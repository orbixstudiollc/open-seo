/**
 * Seed local D1 with deterministic, gapped AI Visibility history.
 *
 * Usage:
 *   pnpm db:migrate:local
 *   pnpm seed:ai-visibility
 *   pnpm seed:ai-visibility --projectId=<existing-project-uuid> --days=200
 *
 * Then run `pnpm dev` and open AI Visibility in the selected project. The
 * fixture is offline: it writes Phase 0 rows directly and never calls a model.
 */

import process from "node:process";
import { getPlatformProxy } from "wrangler";
import { drizzle } from "drizzle-orm/d1";
import { and, eq, inArray } from "drizzle-orm";
import * as aiVisibilitySchema from "../src/db/ai-visibility.schema";
import * as appSchema from "../src/db/app.schema";
import * as authSchema from "../src/db/better-auth-schema";
import { parseArgs } from "./cli-utils";

const schema = {
  ...appSchema,
  ...authSchema,
  ...aiVisibilitySchema,
};

const LOCAL_ADMIN_USER_ID = "local-admin";
const LOCAL_ADMIN_EMAIL = "admin@localhost";
const LOCAL_ORG_ID = `delegated-${LOCAL_ADMIN_USER_ID}`;
const PROMPT_SET_NORMALIZED_NAME = "visibility analytics demo";
const DEMO_BRAND_NAMES = [
  "openseo demo",
  "rankpilot demo",
  "searchsignal demo",
];
const MODELS = ["chat_gpt", "claude", "gemini", "perplexity"] as const;

const TOPICS = [
  { name: "Buying guides", normalizedName: "buying guides" },
  { name: "Comparisons", normalizedName: "comparisons" },
  { name: "How-to", normalizedName: "how-to" },
] as const;

const PROMPTS = [
  ["Which SEO platform is best for a small team?", 0],
  ["What is the best open-source SEO tool?", 0],
  ["Compare leading SEO analytics products", 1],
  ["Which SEO tool has the clearest reporting?", 1],
  ["How do I monitor visibility in AI answers?", 2],
  ["How can I track brand mentions in LLMs?", 2],
] as const;

type SeedDb = ReturnType<typeof drizzle<typeof schema>>;
type BatchStatement = Parameters<SeedDb["batch"]>[0][number];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const days = clampInt(args.days, 200, 3, 390);
  const { env, dispose } = await getPlatformProxy<{ DB: D1Database }>();
  const db = drizzle(env.DB, { schema });

  try {
    const projectId = await resolveProject(db, args.projectId);
    console.log(`Using project ${projectId}`);
    await resetDemo(db, projectId);

    const promptSetId = crypto.randomUUID();
    const topicRows = TOPICS.map((topic) => ({
      ...topic,
      id: crypto.randomUUID(),
      promptSetId,
    }));
    const promptRows = PROMPTS.map(([prompt, topicIndex], index) => ({
      id: crypto.randomUUID(),
      promptSetId,
      topicId: topicRows[topicIndex].id,
      prompt,
      normalizedPrompt: prompt.toLowerCase(),
      sortOrder: index,
    }));
    const brandRows = [
      {
        id: crypto.randomUUID(),
        projectId,
        name: "OpenSEO Demo",
        normalizedName: DEMO_BRAND_NAMES[0],
        domain: "openseo.demo",
        isPrimary: true,
      },
      {
        id: crypto.randomUUID(),
        projectId,
        name: "RankPilot Demo",
        normalizedName: DEMO_BRAND_NAMES[1],
        domain: "rankpilot.demo",
        isPrimary: false,
      },
      {
        id: crypto.randomUUID(),
        projectId,
        name: "SearchSignal Demo",
        normalizedName: DEMO_BRAND_NAMES[2],
        domain: "searchsignal.demo",
        isPrimary: false,
      },
    ];

    await db.insert(schema.aiPromptSets).values({
      id: promptSetId,
      projectId,
      name: "Visibility Analytics Demo",
      normalizedName: PROMPT_SET_NORMALIZED_NAME,
      cadence: "manual",
      isActive: true,
    });
    await db
      .insert(schema.aiPromptSetModels)
      .values(MODELS.map((model) => ({ promptSetId, model })));
    await db.insert(schema.aiPromptTopics).values(topicRows);
    await db.insert(schema.aiTrackedPrompts).values(promptRows);
    await db.insert(schema.aiBrands).values(brandRows);

    const runDates = buildRunDates(days);
    let answerTotal = 0;
    let mentionTotal = 0;
    let citationTotal = 0;
    for (let dayIndex = 0; dayIndex < runDates.length; dayIndex += 1) {
      // Deliberate full-day gaps: no run and no chart point.
      if (dayIndex % 13 === 5) continue;
      const date = runDates[dayIndex];
      const runId = crypto.randomUUID();
      const partial = dayIndex % 17 === 8;
      const answersExpected = promptRows.length * MODELS.length;
      const answerRows: (typeof schema.aiAnswers.$inferInsert)[] = [];
      const mentionRows: (typeof schema.aiBrandMentions.$inferInsert)[] = [];
      const citationRows: (typeof schema.aiCitations.$inferInsert)[] = [];

      for (
        let promptIndex = 0;
        promptIndex < promptRows.length;
        promptIndex += 1
      ) {
        for (let modelIndex = 0; modelIndex < MODELS.length; modelIndex += 1) {
          const model = MODELS[modelIndex];
          const failed =
            partial && (promptIndex * MODELS.length + modelIndex) % 9 === 0;
          const answerId = crypto.randomUUID();
          const primaryThreshold =
            34 +
            Math.round((dayIndex / Math.max(days - 1, 1)) * 34) +
            Math.round(Math.sin(dayIndex / 8) * 8);
          const mentionsPrimary =
            score(dayIndex, promptIndex, modelIndex, 3) < primaryThreshold;
          const mentionsRankPilot =
            score(dayIndex, promptIndex, modelIndex, 19) < 42;
          const mentionsSearchSignal =
            score(dayIndex, promptIndex, modelIndex, 41) < 25;
          const mentionedBrands = [
            ...(mentionsPrimary ? [brandRows[0]] : []),
            ...(mentionsRankPilot ? [brandRows[1]] : []),
            ...(mentionsSearchSignal ? [brandRows[2]] : []),
          ];
          const responseText = failed
            ? null
            : seededAnswerText(
                model,
                mentionedBrands.map(({ name }) => name),
              );
          answerRows.push({
            id: answerId,
            runId,
            trackedPromptId: promptRows[promptIndex].id,
            promptText: promptRows[promptIndex].prompt,
            model,
            modelName: modelName(model),
            status: failed ? "error" : "success",
            responseText,
            errorCode: failed ? "SEEDED_MODEL_ERROR" : null,
            errorMessage: failed ? "Synthetic partial-platform failure" : null,
            observedAt: dbTimestamp(date),
            sourceFetchedAt: dbTimestamp(date),
            webSearch: model !== "claude",
          });
          if (failed || responseText == null) continue;

          if (mentionsPrimary) {
            mentionRows.push(
              mention(
                answerId,
                brandRows[0].id,
                brandRows[0].name,
                responseText,
                1,
                seededSentiment(dayIndex, promptIndex, modelIndex, 3),
              ),
            );
          }
          if (mentionsRankPilot) {
            mentionRows.push(
              mention(
                answerId,
                brandRows[1].id,
                brandRows[1].name,
                responseText,
                mentionsPrimary ? 2 : 1,
                seededSentiment(dayIndex, promptIndex, modelIndex, 19),
              ),
            );
          }
          if (mentionsSearchSignal) {
            mentionRows.push(
              mention(
                answerId,
                brandRows[2].id,
                brandRows[2].name,
                responseText,
                1 + Number(mentionsPrimary) + Number(mentionsRankPilot),
                seededSentiment(dayIndex, promptIndex, modelIndex, 41),
              ),
            );
          }

          const sources = [
            citation(
              answerId,
              0,
              "https://searchengineland.com/ai-search-measurement",
              "A practical guide to AI search measurement",
            ),
          ];
          if (score(dayIndex, promptIndex, modelIndex, 7) < 58) {
            sources.push(
              citation(
                answerId,
                sources.length,
                "https://www.reddit.com/r/SEO/comments/demo/ai_visibility/",
                "SEO community discussion",
              ),
            );
          }
          if ((mentionsRankPilot || mentionsSearchSignal) && !mentionsPrimary) {
            sources.push(
              citation(
                answerId,
                sources.length,
                "https://competitor-insights.example/independent-seo-report",
                "Independent SEO platform report",
              ),
            );
          }
          if (mentionsPrimary || mentionsRankPilot || mentionsSearchSignal) {
            sources.push(
              citation(
                answerId,
                sources.length,
                "https://shared-reviews.example/seo-platforms",
                "SEO platforms reviewed",
              ),
            );
          }
          citationRows.push(...sources);
        }
      }

      const succeeded = answerRows.filter(
        (answer) => answer.status === "success",
      ).length;
      await db.insert(schema.aiRuns).values({
        id: runId,
        promptSetId,
        projectId,
        status: partial ? "partial" : "completed",
        trigger: "scheduled",
        promptsTotal: promptRows.length,
        promptsCompleted: promptRows.length,
        answersExpected,
        answersSucceeded: succeeded,
        answersFailed: answersExpected - succeeded,
        startedAt: dbTimestamp(date),
        completedAt: dbTimestamp(date),
      });
      await batched(db, answerRows, (row) =>
        db.insert(schema.aiAnswers).values(row),
      );
      await batched(db, mentionRows, (row) =>
        db.insert(schema.aiBrandMentions).values(row),
      );
      await batched(db, citationRows, (row) =>
        db.insert(schema.aiCitations).values(row),
      );
      answerTotal += answerRows.length;
      mentionTotal += mentionRows.length;
      citationTotal += citationRows.length;
    }

    console.log(
      `Seeded ${runDates.length} calendar days with deliberate gaps, ${answerTotal} answers, ${mentionTotal} brand mentions, and ${citationTotal} citations.`,
    );
    console.log(
      "Run `pnpm dev`, open the Default project, then choose AI Visibility or Citation Intelligence.",
    );
  } finally {
    await dispose();
  }
}

async function resetDemo(db: SeedDb, projectId: string) {
  await db
    .delete(schema.aiPromptSets)
    .where(
      and(
        eq(schema.aiPromptSets.projectId, projectId),
        eq(schema.aiPromptSets.normalizedName, PROMPT_SET_NORMALIZED_NAME),
      ),
    );
  await db
    .delete(schema.aiBrands)
    .where(
      and(
        eq(schema.aiBrands.projectId, projectId),
        inArray(schema.aiBrands.normalizedName, DEMO_BRAND_NAMES),
      ),
    );
}

async function resolveProject(
  db: SeedDb,
  projectIdArg: string | undefined,
): Promise<string> {
  if (projectIdArg) {
    const existing = await db.query.projects.findFirst({
      where: eq(schema.projects.id, projectIdArg),
    });
    if (!existing) throw new Error(`Project ${projectIdArg} not found`);
    return projectIdArg;
  }

  await db
    .insert(schema.user)
    .values({
      id: LOCAL_ADMIN_USER_ID,
      name: "admin",
      email: LOCAL_ADMIN_EMAIL,
      emailVerified: true,
    })
    .onConflictDoNothing({ target: schema.user.id });
  await db
    .insert(schema.organization)
    .values({
      id: LOCAL_ORG_ID,
      name: "admin workspace",
      slug: `delegated-admin-${toHex(LOCAL_ADMIN_USER_ID)}`,
      createdAt: new Date(),
    })
    .onConflictDoNothing({ target: schema.organization.id });

  const existing = await db.query.projects.findFirst({
    where: and(
      eq(schema.projects.organizationId, LOCAL_ORG_ID),
      eq(schema.projects.name, "Default"),
    ),
  });
  if (existing) return existing.id;

  const projectId = crypto.randomUUID();
  await db.insert(schema.projects).values({
    id: projectId,
    organizationId: LOCAL_ORG_ID,
    name: "Default",
    domain: null,
  });
  return projectId;
}

function buildRunDates(days: number): Date[] {
  const newest = new Date();
  newest.setUTCHours(12, 0, 0, 0);
  if (newest.getTime() > Date.now()) {
    newest.setUTCDate(newest.getUTCDate() - 1);
  }
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(newest);
    date.setUTCDate(date.getUTCDate() - (days - index - 1));
    return date;
  });
}

function mention(
  answerId: string,
  brandId: string,
  rawName: string,
  responseText: string,
  position: number,
  sentiment: "positive" | "neutral" | "negative",
): typeof schema.aiBrandMentions.$inferInsert {
  const firstOccurrenceStart = responseText.indexOf(rawName);
  return {
    answerId,
    brandId,
    rawName,
    normalizedName: rawName.toLowerCase(),
    mentionCount: 1,
    sentiment,
    position,
    firstOccurrenceStart,
    firstOccurrenceEnd: firstOccurrenceStart + rawName.length,
    scoringStatus: "scored",
    scoredAt: new Date().toISOString(),
  };
}

function seededAnswerText(model: string, brandNames: string[]): string {
  const comparison =
    brandNames.length === 0
      ? "No tracked brand is recommended in this sample."
      : `The shortlist includes ${brandNames.join(", ")}.`;
  return [
    `Synthetic ${model} answer for answer-explorer verification.`,
    "",
    comparison,
    "This raw text intentionally includes punctuation and line breaks so the reader can verify text-only rendering.",
  ].join("\n");
}

function seededSentiment(
  dayIndex: number,
  promptIndex: number,
  modelIndex: number,
  salt: number,
): "positive" | "neutral" | "negative" {
  const value = score(dayIndex, promptIndex, modelIndex, salt) % 3;
  return value === 0 ? "negative" : value === 1 ? "neutral" : "positive";
}

function citation(
  answerId: string,
  citationOrder: number,
  url: string,
  title: string,
): typeof schema.aiCitations.$inferInsert {
  return {
    answerId,
    citationOrder,
    url,
    domain: new URL(url).hostname.replace(/^www\./u, ""),
    title,
  };
}

async function batched<T>(
  db: SeedDb,
  items: T[],
  buildStatement: (item: T) => BatchStatement,
) {
  const size = 60;
  for (let index = 0; index < items.length; index += size) {
    const statements = items.slice(index, index + size).map(buildStatement);
    const [first, ...rest] = statements;
    if (first) await db.batch([first, ...rest]);
  }
}

function score(
  dayIndex: number,
  promptIndex: number,
  modelIndex: number,
  salt: number,
): number {
  return (dayIndex * 37 + promptIndex * 23 + modelIndex * 17 + salt * 11) % 100;
}

function modelName(model: (typeof MODELS)[number]): string {
  const names = {
    chat_gpt: "GPT-5",
    claude: "Claude Sonnet 4.5",
    gemini: "Gemini 2.5 Pro",
    perplexity: "Sonar Reasoning Pro",
  };
  return names[model];
}

function dbTimestamp(date: Date): string {
  return date.toISOString();
}

function toHex(value: string): string {
  return Array.from(new TextEncoder().encode(value), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function clampInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = raw ? Number.parseInt(raw, 10) : fallback;
  return Number.isFinite(parsed)
    ? Math.min(Math.max(parsed, min), max)
    : fallback;
}

await main();
