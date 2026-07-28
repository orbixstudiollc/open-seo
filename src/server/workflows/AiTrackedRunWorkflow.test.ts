/* oxlint-disable typescript/no-unsafe-type-assertion -- the fake WorkflowStep executes callbacks synchronously without implementing the runtime-only surface. */
import { describe, expect, it, vi } from "vitest";
import type { WorkflowStep } from "cloudflare:workers";

vi.mock("cloudflare:workers", () => ({
  WorkflowEntrypoint: vi.fn(),
}));

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  execute: vi.fn(),
  score: vi.fn(),
  finalize: vi.fn(),
  fail: vi.fn(),
}));

vi.mock(
  "@/server/features/ai-visibility/services/aiTrackedRunExecution",
  () => ({
    prepareAiTrackedRun: mocks.prepare,
    executeAiAnswerWork: mocks.execute,
    finalizeAiTrackedRun: mocks.finalize,
  }),
);
vi.mock("@/server/features/ai-visibility/services/aiTrackedRunGuards", () => ({
  failAiRunIfActive: mocks.fail,
}));
vi.mock(
  "@/server/features/ai-visibility/services/aiMentionScoringExecution",
  () => ({
    executeAiMentionScoring: mocks.score,
  }),
);
vi.mock("@/db", () => ({
  withPgClient: (fn: () => Promise<unknown>) => fn(),
}));

import { runAiTrackedRunWorkflow } from "./AiTrackedRunWorkflow";

describe("AiTrackedRunWorkflow", () => {
  it("bounds paid fan-out at four and finalizes despite an isolated tuple failure", async () => {
    const work = Array.from({ length: 10 }, (_, index) => ({
      answerId: `answer_${index}`,
      runId: "run_1",
      prompt: { id: `prompt_${index}`, prompt: `Prompt ${index}` },
      model: "chat_gpt" as const,
    }));
    mocks.prepare.mockResolvedValue(work);
    let concurrent = 0;
    let maxConcurrent = 0;
    mocks.execute.mockImplementation(async (item: { answerId: string }) => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((resolve) => setTimeout(resolve, 2));
      concurrent--;
      if (item.answerId === "answer_2") throw new Error("model failed");
      return { status: "success", replayed: false };
    });
    mocks.score.mockResolvedValue({ status: "success" });
    mocks.finalize.mockResolvedValue({ status: "partial" });
    const stepNames: string[] = [];

    const step = {
      do: (
        name: string,
        configOrCallback: unknown,
        maybeCallback?: () => Promise<unknown>,
      ) => {
        stepNames.push(name);
        const callback =
          typeof configOrCallback === "function"
            ? (configOrCallback as () => Promise<unknown>)
            : maybeCallback;
        return callback!();
      },
    } as unknown as WorkflowStep;

    await runAiTrackedRunWorkflow(
      {
        runId: "run_1",
        promptSetId: "set_1",
        projectId: "project_1",
        trigger: "scheduled",
        billingCustomer: {
          userId: "system",
          userEmail: "system@openseo.so",
          organizationId: "org_1",
          projectId: "project_1",
        },
        prompts: work.map(({ prompt }) => prompt),
        models: ["chat_gpt"],
      },
      step,
    );

    expect(maxConcurrent).toBe(4);
    expect(mocks.execute).toHaveBeenCalledTimes(10);
    expect(mocks.score).toHaveBeenCalledTimes(10);
    expect(
      stepNames.findIndex((name) => name.startsWith("score-")),
    ).toBeGreaterThan(
      stepNames.findLastIndex((name) => name.startsWith("answer-")),
    );
    expect(stepNames.at(-1)).toBe("finalize");
    expect(mocks.finalize).toHaveBeenCalledTimes(1);
    expect(mocks.fail).not.toHaveBeenCalled();
  });
});
