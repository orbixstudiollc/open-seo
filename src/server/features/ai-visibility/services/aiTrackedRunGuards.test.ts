import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRunnablePromptSetDefinition: vi.fn(),
  tryCreateRun: vi.fn(),
  getOrCreateProjectRunSettings: vi.fn(),
  reserveProjectAnswerCalls: vi.fn(),
  updateRun: vi.fn(),
  updatePromptSet: vi.fn(),
  getActiveRunForPromptSet: vi.fn(),
  getRunById: vi.fn(),
}));

vi.mock(
  "@/server/features/ai-visibility/repositories/AiVisibilityRepository",
  () => ({ AiVisibilityRepository: mocks }),
);

import {
  beginAiTrackedRun,
  type AiTrackedRunWorkflowBinding,
} from "./aiTrackedRunGuards";

const billingCustomer = {
  userId: "user_1",
  userEmail: "user@example.com",
  organizationId: "org_1",
  projectId: "project_1",
};

function promptSet(promptCount = 45) {
  return {
    promptSet: {
      id: "set_1",
      projectId: "project_1",
      isActive: true,
      archivedAt: null,
    },
    prompts: Array.from({ length: promptCount }, (_, index) => ({
      id: `prompt_${index}`,
      prompt: `Prompt ${index}`,
      archivedAt: null,
    })),
    models: [
      { model: "chat_gpt" },
      { model: "claude" },
      { model: "gemini" },
      { model: "perplexity" },
    ],
  };
}

function workflow() {
  const create = vi.fn<AiTrackedRunWorkflowBinding["create"]>(
    async (_options) => ({}),
  );
  const get = vi.fn<AiTrackedRunWorkflowBinding["get"]>(async (_id) => ({
    status: async () => ({ status: "running" }),
    terminate: async () => undefined,
  }));
  const binding: AiTrackedRunWorkflowBinding = { create, get };
  return { binding, create };
}

describe("beginAiTrackedRun", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.getRunnablePromptSetDefinition.mockResolvedValue(promptSet());
    mocks.tryCreateRun.mockResolvedValue(true);
    mocks.getOrCreateProjectRunSettings.mockResolvedValue({
      projectId: "project_1",
      cadence: "weekly",
      answerCallCap: 200,
      callsReserved: 0,
      windowStartedAt: null,
    });
    mocks.reserveProjectAnswerCalls.mockResolvedValue({
      reserved: true,
      settings: {
        projectId: "project_1",
        cadence: "weekly",
        answerCallCap: 200,
        callsReserved: 180,
        windowStartedAt: "2026-07-27T00:00:00.000Z",
      },
    });
  });

  it.each(["manual", "scheduled"] as const)(
    "reserves all 45 × 4 answer calls atomically for a %s run",
    async (trigger) => {
      const { binding, create } = workflow();
      const result = await beginAiTrackedRun({
        workflow: binding,
        promptSetId: "set_1",
        projectId: "project_1",
        billingCustomer,
        trigger,
        now: new Date("2026-07-27T10:00:00.000Z"),
      });

      expect(result).toMatchObject({
        ok: true,
        answerCallsReserved: 180,
      });
      expect(mocks.reserveProjectAnswerCalls).toHaveBeenCalledWith({
        projectId: "project_1",
        calls: 180,
        windowStartedAt: "2026-07-27T00:00:00.000Z",
        now: "2026-07-27T10:00:00.000Z",
      });
      const options = create.mock.calls[0]?.[0];
      expect(options?.params.trigger).toBe(trigger);
      expect(options?.params.models).toEqual([
        "chat_gpt",
        "claude",
        "gemini",
        "perplexity",
      ]);
      expect(options?.params.prompts).toHaveLength(45);
    },
  );

  it.each(["manual", "scheduled"] as const)(
    "refuses a %s run before Workflow creation when the shared cap is exhausted",
    async (trigger) => {
      mocks.reserveProjectAnswerCalls.mockResolvedValue({
        reserved: false,
        settings: {
          projectId: "project_1",
          cadence: "weekly",
          answerCallCap: 200,
          callsReserved: 180,
          windowStartedAt: "2026-07-27T00:00:00.000Z",
        },
      });
      const { binding, create } = workflow();

      const result = await beginAiTrackedRun({
        workflow: binding,
        promptSetId: "set_1",
        projectId: "project_1",
        billingCustomer,
        trigger,
        now: new Date("2026-07-27T10:00:00.000Z"),
      });

      expect(result).toEqual({
        ok: false,
        reason: "run_cap_reached",
        requestedAnswerCalls: 180,
        callsReserved: 180,
        answerCallCap: 200,
        windowStartedAt: "2026-07-27T00:00:00.000Z",
      });
      expect(create).not.toHaveBeenCalled();
      expect(mocks.updateRun).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          status: "failed",
          errorMessage: "Project tracked-run cap reached",
        }),
      );
    },
  );

  it("rejects a 500-prompt four-model set before provider work", async () => {
    mocks.getRunnablePromptSetDefinition.mockResolvedValue(promptSet(500));
    mocks.reserveProjectAnswerCalls.mockResolvedValue({
      reserved: false,
      settings: {
        answerCallCap: 200,
        callsReserved: 0,
      },
    });
    const { binding, create } = workflow();

    const result = await beginAiTrackedRun({
      workflow: binding,
      promptSetId: "set_1",
      projectId: "project_1",
      billingCustomer,
      trigger: "manual",
      now: new Date("2026-07-27T10:00:00.000Z"),
    });

    expect(mocks.reserveProjectAnswerCalls).toHaveBeenCalledWith(
      expect.objectContaining({ calls: 2_000 }),
    );
    expect(result).toMatchObject({
      ok: false,
      reason: "run_cap_reached",
      requestedAnswerCalls: 2_000,
    });
    expect(create).not.toHaveBeenCalled();
  });
});
