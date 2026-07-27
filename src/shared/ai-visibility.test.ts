import { describe, expect, it } from "vitest";
import {
  aiRunWindowStartedAt,
  computeNextAiRunAt,
  countAiAnswerCalls,
} from "./ai-visibility";

describe("AI tracked-run cadence", () => {
  it("uses UTC calendar windows", () => {
    const now = new Date("2026-07-27T22:45:00.000Z");
    expect(aiRunWindowStartedAt("daily", now)).toBe("2026-07-27T00:00:00.000Z");
    expect(aiRunWindowStartedAt("weekly", now)).toBe(
      "2026-07-27T00:00:00.000Z",
    );
    expect(aiRunWindowStartedAt("monthly", now)).toBe(
      "2026-07-01T00:00:00.000Z",
    );
    expect(aiRunWindowStartedAt("manual", now)).toBe(
      "2026-07-01T00:00:00.000Z",
    );
  });

  it("advances overdue schedules beyond now without a retry storm", () => {
    expect(
      computeNextAiRunAt(
        "weekly",
        "2026-06-01T12:00:00.000Z",
        new Date("2026-07-27T13:00:00.000Z"),
      ),
    ).toBe("2026-08-03T12:00:00.000Z");
    expect(
      computeNextAiRunAt(
        "manual",
        "2026-06-01T12:00:00.000Z",
        new Date("2026-07-27T13:00:00.000Z"),
      ),
    ).toBeNull();
  });

  it("clamps monthly cadence to the target month's last day", () => {
    expect(
      computeNextAiRunAt(
        "monthly",
        "2026-01-31T12:00:00.000Z",
        new Date("2026-02-01T00:00:00.000Z"),
      ),
    ).toBe("2026-02-28T12:00:00.000Z");
  });
});

describe("AI tracked-run call counting", () => {
  it("counts answer models, not mentions platforms", () => {
    expect(countAiAnswerCalls(45, 4)).toBe(180);
    expect(countAiAnswerCalls(500, 4)).toBe(2_000);
  });
});
