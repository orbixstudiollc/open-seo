import { describe, expect, it, vi } from "vitest";
import { runScheduledDispatchers } from "./scheduledDispatchers";

vi.mock("cloudflare:workers", () => ({ env: {} }));

describe("Phase 1 scheduled dispatcher integration", () => {
  it("runs report digests in the existing cron database scope", async () => {
    const calls: string[] = [];
    const withDatabaseScope = async <T>(
      callback: () => Promise<T>,
    ): Promise<T> => {
      calls.push("scope:start");
      const result = await callback();
      calls.push("scope:end");
      return result;
    };
    const dependencies = {
      withDatabaseScope,
      rankChecks: vi.fn(async () => {
        calls.push("rank");
      }),
      aiTrackedRuns: vi.fn(async () => {
        calls.push("ai");
      }),
      reportDigests: vi.fn(async () => {
        calls.push("reports");
        return { due: 0, sent: 0, failed: 0, skipped: null } as const;
      }),
    };

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- injected dispatchers do not read runtime bindings.
    await runScheduledDispatchers({} as Env, dependencies);

    expect(calls).toEqual([
      "scope:start",
      "rank",
      "ai",
      "reports",
      "scope:end",
    ]);
    expect(dependencies.reportDigests).toHaveBeenCalledTimes(1);
  });
});
