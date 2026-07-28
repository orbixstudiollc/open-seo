/* eslint-disable no-restricted-imports -- the contract binds the raw SQLite schema to an in-memory driver. */
/* oxlint-disable typescript/no-unsafe-call -- hoisted Vitest dependency mocks intentionally cross the repository's provider-specific Drizzle signature. */
// @ts-nocheck -- runtime repository/schema behavior is the subject of this integration test.
import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { drizzle as drizzleLibsql } from "drizzle-orm/libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as sqliteRecommendations from "@/db/recommendations.schema";
import { buildRecommendationCandidates } from "./recommendationEngine";

const testState = vi.hoisted(() => ({ database: null }));

vi.mock("@/db", () => ({
  get db() {
    return testState.database;
  },
}));
vi.mock("@/db/schema", async () => import("@/db/recommendations.schema"));
vi.mock("@/db/runBatch", () => ({
  runBatch: async (build) => {
    for (const statement of build(testState.database)) await statement;
  },
  executeInBatches: async (items, build) => {
    for (const item of items) await build(testState.database, item);
  },
}));

import { RecommendationRepository } from "./RecommendationRepository";

describe("recommendation workflow persistence", () => {
  let client: Client;
  const projectId = "project-recommendations";

  beforeAll(async () => {
    client = createClient({ url: ":memory:" });
    await client.execute("PRAGMA foreign_keys = OFF");
    await client.execute(
      "CREATE TABLE projects (id text PRIMARY KEY NOT NULL)",
    );
    await client.execute(
      "CREATE TABLE audit_issues (id text PRIMARY KEY NOT NULL)",
    );
    await client.execute(
      "CREATE TABLE ai_citations (id integer PRIMARY KEY NOT NULL)",
    );
    await client.execute(
      "CREATE TABLE ai_brands (id text PRIMARY KEY NOT NULL)",
    );
    await client.executeMultiple(
      readFileSync("drizzle/0042_boring_weapon_omega.sql", "utf8"),
    );
    await client.execute("PRAGMA foreign_keys = ON");
    await client.execute({
      sql: "INSERT INTO projects (id) VALUES (?)",
      args: [projectId],
    });
    await client.execute("INSERT INTO audit_issues (id) VALUES ('issue-1')");
    testState.database = drizzleLibsql(client, {
      schema: sqliteRecommendations,
    });
  });

  afterAll(() => client.close());

  it("round-trips all states and preserves a decline across regeneration", async () => {
    const firstGeneratedAt = "2026-07-28T12:00:00.000Z";
    const [candidate] = buildRecommendationCandidates({
      generatedAt: new Date(firstGeneratedAt),
      auditSource: {
        audit: {
          id: "audit-1",
          startUrl: "https://example.com/",
          completedAt: "2026-07-28T11:00:00.000Z",
        },
        findings: [
          {
            id: "issue-1",
            auditId: "audit-1",
            pageId: "page-1",
            pageUrl: "https://example.com/",
            issueType: "missing-title",
            severity: "critical",
            detailsJson: null,
            crawlDepth: 0,
            inSitemap: true,
          },
        ],
      },
      citationGaps: [],
    });
    const recommendationId = await RecommendationRepository.upsertCandidate({
      projectId,
      generatedAt: firstGeneratedAt,
      candidate,
    });
    let queue = await RecommendationRepository.listQueue(projectId);
    expect(queue.items[0]).toMatchObject({
      id: recommendationId,
      status: "todo",
      isActive: true,
    });
    expect(queue.items[0].auditEvidence).toEqual([
      expect.objectContaining({ auditIssueId: "issue-1" }),
    ]);

    await RecommendationRepository.updateStatus({
      projectId,
      recommendationId,
      status: "done",
      now: "2026-07-28T12:01:00.000Z",
    });
    queue = await RecommendationRepository.listQueue(projectId);
    expect(queue.items[0]).toMatchObject({
      status: "done",
      doneAt: "2026-07-28T12:01:00.000Z",
      declinedAt: null,
    });

    await RecommendationRepository.updateStatus({
      projectId,
      recommendationId,
      status: "declined",
      now: "2026-07-28T12:02:00.000Z",
    });
    const regeneratedAt = "2026-07-29T12:00:00.000Z";
    await RecommendationRepository.upsertCandidate({
      projectId,
      generatedAt: regeneratedAt,
      candidate: {
        ...candidate,
        rationale: "Refreshed evidence rationale",
      },
    });
    await RecommendationRepository.markNotGeneratedInactive(
      projectId,
      regeneratedAt,
    );
    queue = await RecommendationRepository.listQueue(projectId);
    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]).toMatchObject({
      id: recommendationId,
      status: "declined",
      declinedAt: "2026-07-28T12:02:00.000Z",
      rationale: "Refreshed evidence rationale",
      isActive: true,
    });
    expect(queue.items.filter((item) => item.status === "todo")).toEqual([]);

    await RecommendationRepository.updateStatus({
      projectId,
      recommendationId,
      status: "todo",
      now: "2026-07-29T12:01:00.000Z",
    });
    queue = await RecommendationRepository.listQueue(projectId);
    expect(queue.items[0]).toMatchObject({
      status: "todo",
      doneAt: null,
      declinedAt: null,
    });
  });

  it("retains the audit evidence snapshot after source deletion", async () => {
    await client.execute("DELETE FROM audit_issues WHERE id = 'issue-1'");
    const queue = await RecommendationRepository.listQueue(projectId);
    expect(queue.items[0].auditEvidence).toEqual([
      expect.objectContaining({
        auditIssueId: null,
        sourceAuditId: "audit-1",
        issueType: "missing-title",
        pageUrl: "https://example.com/",
      }),
    ]);
  });
});
