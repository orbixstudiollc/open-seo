import { beforeEach, describe, expect, it, vi } from "vitest";
import { makePublicReport } from "../testFixtures";

vi.mock("cloudflare:workers", () => ({ env: {} }));

const NOW = new Date("2026-07-28T12:00:00.000Z");
const env = {
  AUTH_MODE: "hosted",
  REPORT_PUBLIC_ORIGIN: "https://reports.example",
  LOOPS_API_KEY: "secret",
  LOOPS_TRANSACTIONAL_REPORT_DIGEST_ID: "template",
};
const schedule = {
  id: "schedule-a",
  projectId: "project-a",
  organizationId: "org-a",
  userId: "user-a",
  recipientEmail: "owner@example.com",
  windowDays: 30,
  nextSendAt: "2026-07-28T11:00:00.000Z",
  projectName: "Project A",
  projectDomain: "a.example",
};

const mocks = {
  getDueDigestSchedules: vi.fn(),
  claimDigestSchedule: vi.fn(),
  recordDigestSuccess: vi.fn(),
  recordDigestFailure: vi.fn(),
  buildReport: vi.fn(),
  createShare: vi.fn(),
  revokeShare: vi.fn(),
  sendEmail: vi.fn(),
};

import {
  computeNextDigestAt,
  runScheduledReportDigests,
  type DigestDependencies,
} from "./ReportDigestService";

function dependencies(): DigestDependencies {
  return {
    repository: {
      getDueDigestSchedules: mocks.getDueDigestSchedules,
      claimDigestSchedule: mocks.claimDigestSchedule,
      recordDigestSuccess: mocks.recordDigestSuccess,
      recordDigestFailure: mocks.recordDigestFailure,
    },
    buildReport: mocks.buildReport,
    createShare: mocks.createShare,
    revokeShare: mocks.revokeShare,
    sendEmail: mocks.sendEmail,
  };
}

describe("scheduled report digests", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.getDueDigestSchedules.mockResolvedValue([schedule]);
    mocks.claimDigestSchedule.mockResolvedValue(true);
    mocks.recordDigestSuccess.mockResolvedValue(undefined);
    mocks.recordDigestFailure.mockResolvedValue(undefined);
    mocks.buildReport.mockResolvedValue(
      makePublicReport({
        project: { name: "Project A", domain: "a.example" },
      }),
    );
    mocks.createShare.mockResolvedValue({
      id: "share-a",
      token: "A".repeat(43),
      expiresAt: "2026-08-04T12:00:00.000Z",
    });
    mocks.revokeShare.mockResolvedValue(undefined);
    mocks.sendEmail.mockResolvedValue(undefined);
  });

  it("claims and advances the due row before rendering and sends one digest", async () => {
    await expect(
      runScheduledReportDigests(env, dependencies()),
    ).resolves.toEqual({ due: 1, sent: 1, failed: 0, skipped: null });

    expect(mocks.claimDigestSchedule).toHaveBeenCalledWith({
      id: "schedule-a",
      expectedNextSendAt: schedule.nextSendAt,
      now: NOW.toISOString(),
      nextSendAt: "2026-08-04T11:00:00.000Z",
    });
    const claimOrder = mocks.claimDigestSchedule.mock.invocationCallOrder[0];
    const buildOrder = mocks.buildReport.mock.invocationCallOrder[0];
    expect(claimOrder).toBeDefined();
    expect(buildOrder).toBeDefined();
    if (claimOrder == null || buildOrder == null) {
      throw new Error("Expected claim and report build calls");
    }
    expect(claimOrder).toBeLessThan(buildOrder);
    expect(mocks.createShare).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-a",
        organizationId: "org-a",
        purpose: "digest",
        expiresInDays: 7,
      }),
    );
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "owner@example.com",
        reportUrl: `https://reports.example/share/${"A".repeat(43)}`,
      }),
    );
    expect(mocks.recordDigestSuccess).toHaveBeenCalledWith(
      "schedule-a",
      NOW.toISOString(),
    );
  });

  it("revokes a newly minted link immediately when email delivery fails", async () => {
    mocks.sendEmail.mockRejectedValue(new Error("provider failed"));

    await expect(
      runScheduledReportDigests(env, dependencies()),
    ).resolves.toEqual({ due: 1, sent: 0, failed: 1, skipped: null });

    expect(mocks.revokeShare).toHaveBeenCalledWith(
      expect.objectContaining({
        shareId: "share-a",
        projectId: "project-a",
        organizationId: "org-a",
        now: NOW,
      }),
    );
    expect(mocks.recordDigestFailure).toHaveBeenCalledWith(
      "schedule-a",
      NOW.toISOString(),
      "delivery_failed",
    );
  });

  it("does no database work when delivery or public sharing is not configured", async () => {
    await expect(
      runScheduledReportDigests({ AUTH_MODE: "hosted" }, dependencies()),
    ).resolves.toMatchObject({ skipped: "not_configured" });
    expect(mocks.getDueDigestSchedules).not.toHaveBeenCalled();
  });

  it("advances stale weekly occurrences until the result is in the future", () => {
    expect(computeNextDigestAt("2026-07-01T12:00:00.000Z", NOW)).toBe(
      "2026-07-29T12:00:00.000Z",
    );
  });
});
