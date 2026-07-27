import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDuePromptSetsWithOrganization: vi.fn(),
  getOrCreateProjectRunSettings: vi.fn(),
  getRunnablePromptSetDefinition: vi.fn(),
  updatePromptSet: vi.fn(),
  pruneExpiredTerminalRuns: vi.fn(),
  beginAiTrackedRun: vi.fn(),
  isHostedServerAuthMode: vi.fn(),
  customerHasPaidPlan: vi.fn(),
}));

vi.mock("@/server/billing/subscription", () => ({
  customerHasPaidPlan: mocks.customerHasPaidPlan,
}));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: mocks.isHostedServerAuthMode,
}));
vi.mock(
  "@/server/features/ai-visibility/repositories/AiVisibilityRepository",
  () => ({
    AiVisibilityRepository: {
      getDuePromptSetsWithOrganization: mocks.getDuePromptSetsWithOrganization,
      getOrCreateProjectRunSettings: mocks.getOrCreateProjectRunSettings,
      getRunnablePromptSetDefinition: mocks.getRunnablePromptSetDefinition,
      updatePromptSet: mocks.updatePromptSet,
      pruneExpiredTerminalRuns: mocks.pruneExpiredTerminalRuns,
    },
  }),
);
vi.mock("./aiTrackedRunGuards", () => ({
  beginAiTrackedRun: mocks.beginAiTrackedRun,
}));

import { runScheduledAiTrackedRuns } from "./scheduledAiRuns";
import type { AiTrackedRunWorkflowBinding } from "./aiTrackedRunGuards";

const dueSet = {
  id: "set_1",
  projectId: "project_1",
  organizationId: "org_1",
  nextRunAt: "2026-07-27T09:00:00.000Z",
  projectCadence: "weekly",
};
const workflow: AiTrackedRunWorkflowBinding = {
  create: async () => ({}),
  get: async () => ({
    status: async () => ({ status: "running" }),
    terminate: async () => undefined,
  }),
};
const scheduledEnv = { AI_TRACKED_RUN_WORKFLOW: workflow };

describe("runScheduledAiTrackedRuns", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T10:00:00.000Z"));
    mocks.getDuePromptSetsWithOrganization.mockResolvedValue([dueSet]);
    mocks.getOrCreateProjectRunSettings.mockResolvedValue({
      projectId: "project_1",
      cadence: "weekly",
      answerCallCap: 200,
      callsReserved: 0,
    });
    mocks.getRunnablePromptSetDefinition.mockResolvedValue({
      promptSet: dueSet,
      prompts: [{ id: "prompt_1", prompt: "Question" }],
      models: [{ model: "chat_gpt" }],
    });
    mocks.updatePromptSet.mockResolvedValue(dueSet);
    mocks.pruneExpiredTerminalRuns.mockResolvedValue(0);
    mocks.isHostedServerAuthMode.mockResolvedValue(false);
    mocks.beginAiTrackedRun.mockResolvedValue({
      ok: false,
      reason: "run_cap_reached",
      requestedAnswerCalls: 1,
      callsReserved: 200,
      answerCallCap: 200,
      windowStartedAt: "2026-07-27T00:00:00.000Z",
    });
  });

  it("advances cadence before a cap refusal and records the skip", async () => {
    await runScheduledAiTrackedRuns(scheduledEnv);

    expect(mocks.beginAiTrackedRun).toHaveBeenCalledTimes(1);
    expect(mocks.updatePromptSet).toHaveBeenCalledWith(
      "set_1",
      "project_1",
      expect.objectContaining({
        nextRunAt: "2026-08-03T09:00:00.000Z",
      }),
    );
    expect(mocks.updatePromptSet).toHaveBeenCalledWith(
      "set_1",
      "project_1",
      expect.objectContaining({
        nextRunAt: "2026-08-03T09:00:00.000Z",
        lastSkipReason: "run_cap_reached",
      }),
    );
  });

  it("advances unpaid projects instead of rechecking every 15 minutes", async () => {
    mocks.isHostedServerAuthMode.mockResolvedValue(true);
    mocks.customerHasPaidPlan.mockResolvedValue(false);

    await runScheduledAiTrackedRuns(scheduledEnv);

    expect(mocks.beginAiTrackedRun).not.toHaveBeenCalled();
    expect(mocks.updatePromptSet).toHaveBeenCalledWith(
      "set_1",
      "project_1",
      expect.objectContaining({
        nextRunAt: "2026-08-03T09:00:00.000Z",
        lastSkipReason: "payment_required",
      }),
    );
  });

  it("clears legacy due dates without running when project cadence is manual", async () => {
    mocks.getOrCreateProjectRunSettings.mockResolvedValue({
      projectId: "project_1",
      cadence: "manual",
      answerCallCap: 200,
      callsReserved: 0,
    });

    await runScheduledAiTrackedRuns(scheduledEnv);

    expect(mocks.beginAiTrackedRun).not.toHaveBeenCalled();
    expect(mocks.updatePromptSet).toHaveBeenCalledWith(
      "set_1",
      "project_1",
      expect.objectContaining({ nextRunAt: null }),
    );
  });
});
