/* eslint-disable no-restricted-imports -- integration seam binds the raw SQLite schema to its real driver. */
// @ts-nocheck -- runtime repository/schema compatibility is covered by the
// dialect parity suite; this test verifies the reversible persistence contract.
import { globSync, readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { drizzle as drizzleLibsql } from "drizzle-orm/libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as sqliteAiVisibility from "@/db/ai-visibility.schema";
import { createBrandResolutionRepository } from "./BrandResolutionRepository";
import { createBrandResolutionService } from "./BrandResolutionService";

vi.mock("cloudflare:workers", () => ({ env: {} }));

describe("brand resolution reversible persistence", () => {
  let client: Client;
  let repository: ReturnType<typeof createBrandResolutionRepository>;
  let service: ReturnType<typeof createBrandResolutionService>;
  const projectId = "00000000-0000-4000-8000-000000000003";

  beforeAll(async () => {
    client = createClient({ url: ":memory:" });
    await client.execute("PRAGMA foreign_keys = ON");
    await client.execute(
      "CREATE TABLE projects (id text PRIMARY KEY NOT NULL)",
    );

    const migrations = globSync("drizzle/*.sql").toSorted();
    const phase0 = migrations.find((path) =>
      readFileSync(path, "utf8").includes("CREATE TABLE `ai_prompt_sets`"),
    );
    const phase3 = migrations.find((path) =>
      readFileSync(path, "utf8").includes(
        "CREATE TABLE `ai_brand_resolution_rules`",
      ),
    );
    if (!phase0 || !phase3) throw new Error("AI visibility migrations missing");
    await client.executeMultiple(readFileSync(phase0, "utf8"));
    await client.executeMultiple(readFileSync(phase3, "utf8"));

    await client.execute({
      sql: "INSERT INTO projects (id) VALUES (?)",
      args: [projectId],
    });
    await client.execute({
      sql: `INSERT INTO ai_prompt_sets
        (id, project_id, name, normalized_name)
        VALUES ('set', ?, 'Core', 'core')`,
      args: [projectId],
    });
    await client.execute({
      sql: `INSERT INTO ai_runs
        (id, prompt_set_id, project_id, status, trigger)
        VALUES ('run', 'set', ?, 'completed', 'manual')`,
      args: [projectId],
    });
    await client.execute(`
      INSERT INTO ai_answers
        (id, run_id, tracked_prompt_id, prompt_text, model, status)
      VALUES
        ('answer-1', 'run', 'prompt-1', 'Who leads?', 'model', 'success'),
        ('answer-2', 'run', 'prompt-2', 'What category?', 'model', 'success')
    `);
    await client.execute(`
      INSERT INTO ai_brand_mentions
        (answer_id, raw_name, normalized_name, mention_count)
      VALUES
        ('answer-1', 'Clay', 'clay', 2),
        ('answer-1', 'Clay Global', 'clay global', 1),
        ('answer-2', 'SaaS', 'saas', 3),
        ('answer-2', 'AI', 'ai', 4)
    `);
    await client.execute({
      sql: `INSERT INTO ai_brands
        (id, project_id, name, normalized_name, domain)
        VALUES ('clay-brand', ?, 'Clay', 'clay', 'clay.global')`,
      args: [projectId],
    });
    await client.execute({
      sql: `INSERT INTO ai_brand_aliases
        (id, project_id, brand_id, alias, normalized_alias)
        VALUES ('clay-global-alias', ?, 'clay-brand', 'Clay Global', 'clay global')`,
      args: [projectId],
    });

    const database = drizzleLibsql(client, {
      schema: sqliteAiVisibility,
    });
    repository = createBrandResolutionRepository(database, sqliteAiVisibility);
    service = createBrandResolutionService(repository);
  });

  afterAll(() => {
    client.close();
  });

  it("resolves the gate corpus and merge-split round-trips with zero mention loss", async () => {
    const mentionsBefore = await repository.listMentionRows(projectId);
    const integrityBefore = mentionsBefore.map((mention) => ({
      id: mention.id,
      rawName: mention.rawName,
      normalizedName: mention.normalizedName,
      mentionCount: mention.mentionCount,
    }));

    const refreshed = await service.refreshAutomaticResolutions(projectId);
    const byName = new Map(
      refreshed.state.candidates.map((row) => [row.normalizedName, row]),
    );
    expect(byName.get("saas")?.decision).toMatchObject({
      state: "suppressed",
      brandId: null,
    });
    expect(byName.get("ai")?.decision).toMatchObject({
      state: "suppressed",
      brandId: null,
    });
    expect(byName.get("clay")?.decision.brandId).toBe("clay-brand");
    expect(byName.get("clay global")?.decision.brandId).toBe("clay-brand");
    expect(refreshed.state.canonicalBrands).toHaveLength(1);
    expect(refreshed.state.canonicalBrands[0]).toMatchObject({
      normalizedNames: ["clay", "clay global"],
      rawNames: ["Clay", "Clay Global"],
      mentionCount: 3,
    });
    expect(refreshed.state.canonicalBrands[0]?.brand).toMatchObject({
      id: "clay-brand",
      name: "Clay",
    });

    await service.applyManualAction(
      {
        projectId,
        action: "merge",
        normalizedNames: ["clay", "clay global"],
        canonicalName: "Clay",
        brandId: "clay-brand",
        reason: "Reviewed as the same company",
      },
      "reviewer-1",
    );
    const split = await service.applyManualAction(
      {
        projectId,
        action: "split",
        normalizedNames: ["clay global"],
        canonicalName: "Clay Global",
        reason: "Undo the merge for independent review",
      },
      "reviewer-1",
    );
    const splitByName = new Map(
      split.candidates.map((row) => [row.normalizedName, row]),
    );
    expect(splitByName.get("clay")?.decision.brandId).toBe("clay-brand");
    expect(splitByName.get("clay global")?.decision).toMatchObject({
      state: "resolved",
      source: "manual",
    });
    expect(splitByName.get("clay global")?.decision.brandId).not.toBe(
      "clay-brand",
    );

    const mentionsAfter = await repository.listMentionRows(projectId);
    expect(
      mentionsAfter.map((mention) => ({
        id: mention.id,
        rawName: mention.rawName,
        normalizedName: mention.normalizedName,
        mentionCount: mention.mentionCount,
      })),
    ).toEqual(integrityBefore);
    expect(split.summary.mentionCount).toBe(10);
    expect(
      split.history.filter((rule) => rule.normalizedName === "clay global"),
    ).toHaveLength(3);
  });
});
