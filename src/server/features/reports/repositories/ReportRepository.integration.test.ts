/* eslint-disable no-restricted-imports -- integration seam binds the raw SQLite schema to its real driver. */
// @ts-nocheck -- the runtime repository/schema contract intentionally crosses
// incompatible Drizzle driver types, as in the existing dual-dialect tests.
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { projects } from "@/db/app.schema";
import { reportDigestSchedules, reportShares } from "@/db/reports.schema";
import {
  listReportShares,
  resolveReportShare,
  revokeReportShare,
} from "../services/ReportShareService";
import { sha256Hex } from "../services/reportTokens";
import { createReportRepository } from "./ReportRepository";

vi.mock("cloudflare:workers", () => ({ env: {} }));

const NOW = new Date("2026-07-28T12:00:00.000Z");
const env = { AUTH_MODE: "hosted" };
const tokens = {
  projectA: "A".repeat(43),
  projectB: "B".repeat(43),
  mismatchedOrg: "C".repeat(43),
  archived: "D".repeat(43),
  expired: "E".repeat(43),
  revoked: "F".repeat(43),
};

describe("ReportRepository share capability boundaries", () => {
  let client: Client;
  let repository: ReturnType<typeof createReportRepository>;

  beforeAll(async () => {
    client = createClient({ url: ":memory:" });
    await client.executeMultiple(`
      CREATE TABLE projects (
        id text PRIMARY KEY NOT NULL,
        organization_id text NOT NULL,
        name text NOT NULL,
        domain text,
        location_code integer NOT NULL DEFAULT 2840,
        language_code text NOT NULL DEFAULT 'en',
        created_at text NOT NULL DEFAULT (current_timestamp),
        archived_at text
      );
      CREATE TABLE report_shares (
        id text PRIMARY KEY NOT NULL,
        project_id text NOT NULL,
        organization_id text NOT NULL,
        token_digest text NOT NULL,
        report_version integer NOT NULL DEFAULT 1,
        window_days integer NOT NULL,
        purpose text NOT NULL DEFAULT 'manual',
        created_by text NOT NULL,
        created_at text NOT NULL,
        expires_at text NOT NULL,
        revoked_at text
      );
      CREATE UNIQUE INDEX report_shares_token_digest_idx
        ON report_shares (token_digest);
      CREATE TABLE report_digest_schedules (
        id text PRIMARY KEY NOT NULL,
        project_id text NOT NULL,
        organization_id text NOT NULL,
        user_id text NOT NULL,
        recipient_email text NOT NULL,
        window_days integer NOT NULL DEFAULT 30,
        cadence text NOT NULL DEFAULT 'weekly',
        enabled integer NOT NULL DEFAULT false,
        next_send_at text,
        last_sent_at text,
        last_error text,
        created_at text NOT NULL,
        updated_at text NOT NULL
      );
    `);
    await client.executeMultiple(`
      INSERT INTO projects (id, organization_id, name, domain) VALUES
        ('project-a', 'org-a', 'Project A', 'a.example'),
        ('project-b', 'org-a', 'Project B', 'b.example'),
        ('project-c', 'org-b', 'Project C', 'c.example'),
        ('project-archived', 'org-a', 'Archived', 'archived.example');
      UPDATE projects
        SET archived_at = '2026-07-27T00:00:00.000Z'
        WHERE id = 'project-archived';
    `);
    for (const [id, token] of Object.entries(tokens)) {
      const projectId =
        id === "projectA"
          ? "project-a"
          : id === "projectB"
            ? "project-b"
            : id === "archived"
              ? "project-archived"
              : "project-c";
      const organizationId =
        id === "mismatchedOrg"
          ? "org-a"
          : projectId === "project-c"
            ? "org-b"
            : "org-a";
      const expiresAt =
        id === "expired" ? NOW.toISOString() : "2026-08-28T12:00:00.000Z";
      const revokedAt = id === "revoked" ? "2026-07-28T11:00:00.000Z" : null;
      await client.execute({
        sql: `INSERT INTO report_shares
          (id, project_id, organization_id, token_digest, report_version,
           window_days, purpose, created_by, created_at, expires_at, revoked_at)
          VALUES (?, ?, ?, ?, 1, 30, 'manual', 'user-a', ?, ?, ?)`,
        args: [
          `share-${id}`,
          projectId,
          organizationId,
          await sha256Hex(token),
          "2026-07-28T10:00:00.000Z",
          expiresAt,
          revokedAt,
        ],
      });
    }

    repository = createReportRepository(
      drizzle(client, {
        schema: { projects, reportShares, reportDigestSchedules },
      }),
      { projects, reportShares, reportDigestSchedules },
    );
  });

  afterAll(() => client.close());

  it("resolves exactly one active joined project from a logged-out bearer", async () => {
    await expect(
      resolveReportShare({
        token: tokens.projectA,
        now: NOW,
        env,
        repository,
      }),
    ).resolves.toEqual({
      shareId: "share-projectA",
      expiresAt: "2026-08-28T12:00:00.000Z",
      windowDays: 30,
      project: {
        id: "project-a",
        name: "Project A",
        domain: "a.example",
      },
    });
    await expect(
      resolveReportShare({
        token: tokens.projectB,
        now: NOW,
        env,
        repository,
      }),
    ).resolves.toMatchObject({ project: { id: "project-b" } });
  });

  it.each([
    ["malformed", "short"],
    ["unknown", "Z".repeat(43)],
    ["organization mismatch", tokens.mismatchedOrg],
    ["archived project", tokens.archived],
    ["expiry boundary", tokens.expired],
    ["revoked", tokens.revoked],
  ])("rejects %s tokens with the same null result", async (_label, token) => {
    await expect(
      resolveReportShare({ token, now: NOW, env, repository }),
    ).resolves.toBeNull();
  });

  it("never stores the raw bearer and applies owner revocation immediately", async () => {
    const stored = await client.execute(
      "SELECT token_digest FROM report_shares WHERE id = 'share-projectA'",
    );
    expect(stored.rows[0]?.token_digest).toBe(await sha256Hex(tokens.projectA));
    expect(stored.rows[0]?.token_digest).not.toBe(tokens.projectA);

    await revokeReportShare({
      shareId: "share-projectA",
      projectId: "project-a",
      organizationId: "org-a",
      now: NOW,
      repository,
    });
    await expect(
      resolveReportShare({
        token: tokens.projectA,
        now: new Date(NOW.getTime() + 1),
        env,
        repository,
      }),
    ).resolves.toBeNull();
  });

  it("scopes owner listings and revocations by both project and organization", async () => {
    const rows = await listReportShares({
      projectId: "project-b",
      organizationId: "org-a",
      now: NOW,
      repository,
    });
    expect(rows.map((row) => row.id)).toEqual(["share-projectB"]);
    await expect(
      revokeReportShare({
        shareId: "share-projectB",
        projectId: "project-b",
        organizationId: "org-b",
        now: NOW,
        repository,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
