import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  aiAnswers,
  aiBrandAliases,
  aiBrandMentions,
  aiBrandResolutionEvidence,
  aiBrandResolutionRules,
  aiBrands,
  aiRuns,
} from "@/db/schema";

const tables = {
  aiAnswers,
  aiBrandAliases,
  aiBrandMentions,
  aiBrandResolutionEvidence,
  aiBrandResolutionRules,
  aiBrands,
  aiRuns,
};

type Database = typeof db;
type Tables = typeof tables;
type AtomicBatch = (
  build: (tx: Database) => readonly Promise<unknown>[],
) => Promise<void>;

export type BrandResolutionRuleRecord =
  typeof aiBrandResolutionRules.$inferSelect;
export type BrandResolutionEvidenceRecord =
  typeof aiBrandResolutionEvidence.$inferSelect;

export type ReplacementRule = Omit<
  typeof aiBrandResolutionRules.$inferInsert,
  "createdAt" | "supersededAt" | "supersedesRuleId"
> & {
  evidence: Array<
    Omit<typeof aiBrandResolutionEvidence.$inferInsert, "ruleId" | "createdAt">
  >;
};

const MAX_MENTION_ROWS = 5_000;
const MAX_HISTORY_ROWS = 500;

export function createBrandResolutionRepository(
  database: Database,
  schema: Tables = tables,
  atomicBatch?: AtomicBatch,
) {
  async function executeAtomically(
    build: (tx: Database) => readonly Promise<unknown>[],
  ) {
    if (atomicBatch) {
      await atomicBatch(build);
      return;
    }
    for (const statement of build(database)) await statement;
  }

  async function listMentionRows(projectId: string, limit = MAX_MENTION_ROWS) {
    return database
      .select({
        id: schema.aiBrandMentions.id,
        answerId: schema.aiBrandMentions.answerId,
        rawName: schema.aiBrandMentions.rawName,
        normalizedName: schema.aiBrandMentions.normalizedName,
        mentionCount: schema.aiBrandMentions.mentionCount,
      })
      .from(schema.aiBrandMentions)
      .innerJoin(
        schema.aiAnswers,
        eq(schema.aiBrandMentions.answerId, schema.aiAnswers.id),
      )
      .innerJoin(schema.aiRuns, eq(schema.aiAnswers.runId, schema.aiRuns.id))
      .where(eq(schema.aiRuns.projectId, projectId))
      .orderBy(desc(schema.aiBrandMentions.id))
      .limit(Math.min(Math.max(limit, 1), MAX_MENTION_ROWS));
  }

  async function getRegistry(projectId: string) {
    const [brands, aliases] = await Promise.all([
      database
        .select()
        .from(schema.aiBrands)
        .where(eq(schema.aiBrands.projectId, projectId))
        .orderBy(schema.aiBrands.createdAt),
      database
        .select()
        .from(schema.aiBrandAliases)
        .where(eq(schema.aiBrandAliases.projectId, projectId))
        .orderBy(schema.aiBrandAliases.createdAt),
    ]);
    return { brands, aliases };
  }

  async function listActiveRules(projectId: string) {
    return database
      .select()
      .from(schema.aiBrandResolutionRules)
      .where(
        and(
          eq(schema.aiBrandResolutionRules.projectId, projectId),
          isNull(schema.aiBrandResolutionRules.supersededAt),
        ),
      )
      .orderBy(schema.aiBrandResolutionRules.normalizedName);
  }

  async function listRuleHistory(projectId: string, limit = MAX_HISTORY_ROWS) {
    return database
      .select()
      .from(schema.aiBrandResolutionRules)
      .where(eq(schema.aiBrandResolutionRules.projectId, projectId))
      .orderBy(desc(schema.aiBrandResolutionRules.createdAt))
      .limit(Math.min(Math.max(limit, 1), MAX_HISTORY_ROWS));
  }

  async function listEvidence(ruleIds: string[]) {
    if (ruleIds.length === 0) return [];
    return database
      .select()
      .from(schema.aiBrandResolutionEvidence)
      .where(inArray(schema.aiBrandResolutionEvidence.ruleId, ruleIds))
      .orderBy(schema.aiBrandResolutionEvidence.createdAt);
  }

  async function getBrandById(projectId: string, brandId: string) {
    const [brand] = await database
      .select()
      .from(schema.aiBrands)
      .where(
        and(
          eq(schema.aiBrands.projectId, projectId),
          eq(schema.aiBrands.id, brandId),
        ),
      )
      .limit(1);
    return brand ?? null;
  }

  async function getBrandByNormalizedName(
    projectId: string,
    normalizedName: string,
  ) {
    const [brand] = await database
      .select()
      .from(schema.aiBrands)
      .where(
        and(
          eq(schema.aiBrands.projectId, projectId),
          eq(schema.aiBrands.normalizedName, normalizedName),
        ),
      )
      .limit(1);
    return brand ?? null;
  }

  async function createBrand(values: typeof aiBrands.$inferInsert) {
    await database
      .insert(schema.aiBrands)
      .values(values)
      .onConflictDoNothing({
        target: [schema.aiBrands.projectId, schema.aiBrands.normalizedName],
      });
    const brand = await getBrandByNormalizedName(
      values.projectId,
      values.normalizedName,
    );
    if (!brand) throw new Error("Failed to create canonical AI brand");
    return brand;
  }

  async function configureBrands(
    projectId: string,
    brands: Array<
      Pick<
        typeof aiBrands.$inferInsert,
        "id" | "name" | "normalizedName" | "domain" | "isPrimary"
      >
    >,
  ) {
    const updatedAt = new Date().toISOString();
    await executeAtomically((tx) => [
      tx
        .update(schema.aiBrands)
        .set({ isPrimary: false, updatedAt })
        .where(eq(schema.aiBrands.projectId, projectId)),
      ...brands.map((brand) =>
        tx
          .insert(schema.aiBrands)
          .values({ ...brand, projectId, updatedAt, archivedAt: null })
          .onConflictDoUpdate({
            target: [schema.aiBrands.projectId, schema.aiBrands.normalizedName],
            set: {
              name: brand.name,
              domain: brand.domain,
              isPrimary: brand.isPrimary,
              updatedAt,
              archivedAt: null,
            },
          }),
      ),
    ]);
    return getRegistry(projectId);
  }

  async function replaceRules(
    projectId: string,
    replacements: ReplacementRule[],
  ) {
    if (replacements.length === 0) return;
    const normalizedNames = replacements.map((rule) => rule.normalizedName);
    const currentRules = await database
      .select()
      .from(schema.aiBrandResolutionRules)
      .where(
        and(
          eq(schema.aiBrandResolutionRules.projectId, projectId),
          inArray(
            schema.aiBrandResolutionRules.normalizedName,
            normalizedNames,
          ),
          isNull(schema.aiBrandResolutionRules.supersededAt),
        ),
      );
    const currentByName = new Map(
      currentRules.map((rule) => [rule.normalizedName, rule]),
    );
    const supersededAt = new Date().toISOString();

    await executeAtomically((tx) =>
      replacements.flatMap(({ evidence, ...replacement }) => {
        const current = currentByName.get(replacement.normalizedName);
        const statements: Promise<unknown>[] = [
          tx
            .update(schema.aiBrandResolutionRules)
            .set({ supersededAt })
            .where(
              and(
                eq(
                  schema.aiBrandResolutionRules.projectId,
                  replacement.projectId,
                ),
                eq(
                  schema.aiBrandResolutionRules.normalizedName,
                  replacement.normalizedName,
                ),
                isNull(schema.aiBrandResolutionRules.supersededAt),
              ),
            ),
          tx.insert(schema.aiBrandResolutionRules).values({
            ...replacement,
            supersedesRuleId: current?.id ?? null,
          }),
        ];
        if (evidence.length > 0) {
          statements.push(
            tx.insert(schema.aiBrandResolutionEvidence).values(
              evidence.map((item) => ({
                ...item,
                ruleId: replacement.id,
              })),
            ),
          );
        }
        return statements;
      }),
    );
  }

  return {
    listMentionRows,
    getRegistry,
    listActiveRules,
    listRuleHistory,
    listEvidence,
    getBrandById,
    getBrandByNormalizedName,
    createBrand,
    configureBrands,
    replaceRules,
  };
}

export const BrandResolutionRepository = createBrandResolutionRepository(
  db,
  tables,
  runBatch,
);
