import { describe, expect, it, vi } from "vitest";
import type { ReportRepository } from "../repositories/ReportRepository";
import { createReportShare, listReportShares } from "./ReportShareService";
import { sha256Hex } from "./reportTokens";

vi.mock("cloudflare:workers", () => ({ env: {} }));

type CreateShare = typeof ReportRepository.createShare;
type CreateShareInput = Parameters<CreateShare>[0];

describe("ReportShareService", () => {
  it("returns the plaintext once while persisting only its digest and fixed scope", async () => {
    const capture: { stored?: CreateShareInput } = {};
    const createShare = vi.fn<CreateShare>(async (input) => {
      capture.stored = input;
      return { ...input, revokedAt: null };
    });
    const now = new Date("2026-07-28T12:00:00.000Z");
    const result = await createReportShare({
      projectId: "project-a",
      organizationId: "org-a",
      userId: "user-a",
      windowDays: 30,
      expiresInDays: 7,
      now,
      env: { AUTH_MODE: "hosted" },
      repository: {
        createShare,
        findActiveShareByDigest: vi.fn(),
        listShares: vi.fn(),
        revokeShare: vi.fn(),
      },
    });
    expect(result.token).toHaveLength(43);
    const stored = capture.stored;
    if (!stored) throw new Error("Share row was not captured");
    expect(stored).toMatchObject({
      projectId: "project-a",
      organizationId: "org-a",
      reportVersion: 1,
      windowDays: 30,
      purpose: "manual",
      createdBy: "user-a",
      createdAt: now.toISOString(),
      expiresAt: "2026-08-04T12:00:00.000Z",
    });
    expect(stored.tokenDigest).toBe(await sha256Hex(result.token));
    expect(JSON.stringify(stored)).not.toContain(result.token);
  });

  it("does not expose token digests in owner listings", async () => {
    const listShares = vi.fn().mockResolvedValue([
      {
        id: "share-a",
        windowDays: 30,
        purpose: "manual",
        createdAt: "2026-07-28T10:00:00.000Z",
        expiresAt: "2026-08-04T10:00:00.000Z",
        revokedAt: null,
        tokenDigest: "must-not-pass-through",
      },
    ]);
    const result = await listReportShares({
      projectId: "project-a",
      organizationId: "org-a",
      now: new Date("2026-07-28T12:00:00.000Z"),
      repository: {
        createShare: vi.fn(),
        findActiveShareByDigest: vi.fn(),
        listShares,
        revokeShare: vi.fn(),
      },
    });

    expect(result).toEqual([
      {
        id: "share-a",
        windowDays: 30,
        purpose: "manual",
        createdAt: "2026-07-28T10:00:00.000Z",
        expiresAt: "2026-08-04T10:00:00.000Z",
        revokedAt: null,
        status: "active",
      },
    ]);
  });

  it("blocks creation in local_noauth by default before touching the database", async () => {
    const createShare = vi.fn();
    await expect(
      createReportShare({
        projectId: "project-a",
        organizationId: "org-a",
        userId: "user-a",
        windowDays: 30,
        expiresInDays: 7,
        env: { AUTH_MODE: "local_noauth" },
        repository: {
          createShare,
          findActiveShareByDigest: vi.fn(),
          listShares: vi.fn(),
          revokeShare: vi.fn(),
        },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(createShare).not.toHaveBeenCalled();
  });
});
