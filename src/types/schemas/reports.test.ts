import { describe, expect, it } from "vitest";
import { reportInputSchema } from "./reports";

describe("reportInputSchema", () => {
  it("accepts a validated report window from an HTTP query string", () => {
    expect(
      reportInputSchema.parse({
        projectId: "project-a",
        windowDays: "30",
      }),
    ).toEqual({
      projectId: "project-a",
      windowDays: 30,
    });
  });

  it("rejects unsupported report windows", () => {
    expect(
      reportInputSchema.safeParse({
        projectId: "project-a",
        windowDays: "31",
      }).success,
    ).toBe(false);
  });
});
