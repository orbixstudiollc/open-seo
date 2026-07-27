import { beforeEach, describe, expect, it, vi } from "vitest";
import { DataforseoChargedTaskError } from "@/server/lib/dataforseo/envelope";

vi.mock("cloudflare:workers", () => ({ waitUntil: vi.fn() }));

type AnswerState = {
  id: string;
  runId: string;
  trackedPromptId: string;
  model: string;
  status: "pending" | "running" | "success" | "error";
  providerCostUsd: number | null;
  creditsConsumed: number | null;
};

const mocks = vi.hoisted(() => ({
  getAnswerById: vi.fn(),
  claimPendingAnswer: vi.fn(),
  completeRunningAnswer: vi.fn(),
  insertCitations: vi.fn(),
  getAnswersForRun: vi.fn(),
  updateRun: vi.fn(),
  updatePromptSet: vi.fn(),
  llmResponseWithBilling: vi.fn(),
  captureServerEvent: vi.fn(),
}));

vi.mock(
  "@/server/features/ai-visibility/repositories/AiVisibilityRepository",
  () => ({
    AiVisibilityRepository: {
      getAnswerById: mocks.getAnswerById,
      claimPendingAnswer: mocks.claimPendingAnswer,
      completeRunningAnswer: mocks.completeRunningAnswer,
      insertCitations: mocks.insertCitations,
      getAnswersForRun: mocks.getAnswersForRun,
      updateRun: mocks.updateRun,
      updatePromptSet: mocks.updatePromptSet,
    },
  }),
);
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: () => ({
    aiSearch: { llmResponseWithBilling: mocks.llmResponseWithBilling },
  }),
}));
vi.mock("@/server/lib/posthog", () => ({
  captureServerEvent: mocks.captureServerEvent,
}));

import {
  executeAiAnswerWork,
  finalizeAiTrackedRun,
  type AiAnswerWork,
} from "./aiTrackedRunExecution";
import type { AiTrackedRunParams } from "./aiTrackedRunTypes";

const billingCustomer = {
  userId: "user_1",
  userEmail: "user@example.com",
  organizationId: "org_1",
  projectId: "project_1",
};

const params: AiTrackedRunParams = {
  runId: "run_1",
  promptSetId: "set_1",
  projectId: "project_1",
  trigger: "scheduled",
  billingCustomer,
  prompts: [{ id: "prompt_1", prompt: "Which tool?" }],
  models: ["chat_gpt", "claude"],
};

function work(model: "chat_gpt" | "claude"): AiAnswerWork {
  return {
    answerId: `run_1:prompt_1:${model}`,
    runId: "run_1",
    prompt: params.prompts[0],
    model,
  };
}

describe("AI tracked answer execution", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.insertCitations.mockResolvedValue(undefined);
    mocks.updateRun.mockResolvedValue(undefined);
    mocks.updatePromptSet.mockResolvedValue(undefined);
    mocks.captureServerEvent.mockResolvedValue(undefined);
  });

  it("never repeats a paid call for a running tuple on Workflow replay", async () => {
    mocks.getAnswerById.mockResolvedValue({
      id: "run_1:prompt_1:chat_gpt",
      runId: "run_1",
      status: "running",
      providerCostUsd: null,
      creditsConsumed: null,
    });
    mocks.claimPendingAnswer.mockResolvedValue(false);
    mocks.completeRunningAnswer.mockResolvedValue(true);

    await expect(
      executeAiAnswerWork(work("chat_gpt"), billingCustomer),
    ).resolves.toEqual({ status: "error", replayed: true });

    expect(mocks.llmResponseWithBilling).not.toHaveBeenCalled();
    expect(mocks.completeRunningAnswer).toHaveBeenCalledWith(
      "run_1:prompt_1:chat_gpt",
      "run_1",
      expect.objectContaining({
        status: "error",
        errorCode: "REPLAY_INDETERMINATE",
      }),
    );
  });

  it("keeps the paid answer terminal when citation persistence fails", async () => {
    mocks.getAnswerById.mockResolvedValue({
      id: "run_1:prompt_1:chat_gpt",
      runId: "run_1",
      status: "pending",
    });
    mocks.claimPendingAnswer.mockResolvedValue(true);
    mocks.completeRunningAnswer.mockResolvedValue(true);
    mocks.llmResponseWithBilling.mockResolvedValue({
      data: {
        model_name: "gpt-5",
        items: [
          {
            type: "message",
            sections: [
              {
                text: "Use Acme.",
                annotations: [{ url: "https://example.com", title: "Example" }],
              },
            ],
          },
        ],
      },
      billing: {
        path: ["v3", "ai_optimization", "chat_gpt", "llm_responses", "live"],
        costUsd: 0.1,
      },
      creditsConsumed: 128,
    });
    mocks.insertCitations.mockRejectedValue(new Error("database unavailable"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(
      executeAiAnswerWork(work("chat_gpt"), billingCustomer),
    ).resolves.toEqual({ status: "success", replayed: false });

    expect(mocks.completeRunningAnswer).toHaveBeenCalledWith(
      work("chat_gpt").answerId,
      "run_1",
      expect.objectContaining({
        status: "success",
        providerCostUsd: 0.1,
        creditsConsumed: 128,
      }),
    );
    consoleError.mockRestore();
  });

  it("persists one model failure, keeps the success, and finalizes partial cost", async () => {
    const answers = new Map<string, AnswerState>([
      [
        work("chat_gpt").answerId,
        {
          id: work("chat_gpt").answerId,
          runId: "run_1",
          trackedPromptId: "prompt_1",
          model: "chat_gpt",
          status: "pending",
          providerCostUsd: null,
          creditsConsumed: null,
        },
      ],
      [
        work("claude").answerId,
        {
          id: work("claude").answerId,
          runId: "run_1",
          trackedPromptId: "prompt_1",
          model: "claude",
          status: "pending",
          providerCostUsd: null,
          creditsConsumed: null,
        },
      ],
    ]);
    mocks.getAnswerById.mockImplementation(async (answerId: string) =>
      answers.get(answerId),
    );
    mocks.claimPendingAnswer.mockImplementation(async (answerId: string) => {
      const answer = answers.get(answerId);
      if (!answer || answer.status !== "pending") return false;
      answer.status = "running";
      return true;
    });
    mocks.completeRunningAnswer.mockImplementation(
      async (
        answerId: string,
        _runId: string,
        values: Partial<AnswerState>,
      ) => {
        const answer = answers.get(answerId);
        if (!answer || answer.status !== "running") return false;
        Object.assign(answer, values);
        return true;
      },
    );
    mocks.getAnswersForRun.mockImplementation(async () => [
      ...answers.values(),
    ]);
    mocks.llmResponseWithBilling.mockImplementation(
      async ({ modelSlug }: { modelSlug: string }) => {
        if (modelSlug === "claude") {
          const error = new DataforseoChargedTaskError("Claude unavailable", {
            path: ["v3", "ai_optimization", "claude", "llm_responses", "live"],
            costUsd: 0.05,
          });
          error.creditsConsumed = 64;
          throw error;
        }
        return {
          data: {
            model_name: "gpt-5",
            output_tokens: 20,
            web_search: true,
            items: [
              {
                type: "message",
                sections: [
                  {
                    text: "Use Acme.",
                    annotations: [
                      { url: "https://example.com", title: "Example" },
                    ],
                  },
                ],
              },
            ],
          },
          billing: {
            path: [
              "v3",
              "ai_optimization",
              "chat_gpt",
              "llm_responses",
              "live",
            ],
            costUsd: 0.1,
          },
          creditsConsumed: 128,
        };
      },
    );

    await Promise.all([
      executeAiAnswerWork(work("chat_gpt"), billingCustomer),
      executeAiAnswerWork(work("claude"), billingCustomer),
    ]);
    const result = await finalizeAiTrackedRun(params);

    expect(result).toEqual({
      status: "partial",
      answersSucceeded: 1,
      answersFailed: 1,
    });
    expect(mocks.updateRun).toHaveBeenCalledWith(
      "run_1",
      expect.objectContaining({
        status: "partial",
        answersSucceeded: 1,
        answersFailed: 1,
        providerCostUsd: 0.15,
        creditsConsumed: 192,
      }),
    );
    expect(mocks.insertCitations).toHaveBeenCalledWith([
      expect.objectContaining({
        answerId: "run_1:prompt_1:chat_gpt",
        url: "https://example.com",
      }),
    ]);
  });
});
