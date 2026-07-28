import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPromptSetDefinition: vi.fn(),
  createPromptSuggestion: vi.fn(),
  updateTrackedPrompt: vi.fn(),
  getConnection: vi.fn(),
  getPerformance: vi.fn(),
}));

vi.mock(
  "@/server/features/ai-visibility/repositories/AiVisibilityRepository",
  () => ({
    AiVisibilityRepository: {
      getPromptSetDefinition: mocks.getPromptSetDefinition,
      createPromptSuggestion: mocks.createPromptSuggestion,
      updateTrackedPrompt: mocks.updateTrackedPrompt,
    },
  }),
);
vi.mock("@/server/features/gsc/services/GscService", () => ({
  GscService: {
    getConnection: mocks.getConnection,
    getPerformance: mocks.getPerformance,
  },
}));

import { AiPromptSuggestionService } from "./AiPromptSuggestionService";

const baseDefinition = {
  promptSet: { id: "set_1", projectId: "project_1" },
  models: [],
  topics: [
    {
      id: "topic_1",
      name: "CRM",
      normalizedName: "crm",
      archivedAt: null,
    },
  ],
  prompts: [],
  tags: [],
  assignments: [],
};

describe("AiPromptSuggestionService", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  it("stores GSC and topic-gap candidates without paid provider calls", async () => {
    const storedSuggestions = [
      {
        id: "suggestion_gsc",
        promptSetId: "set_1",
        topicId: "topic_1",
        prompt: "How does crm work?",
        normalizedPrompt: "How does crm work?",
        state: "suggested",
        suggestionSource: "gsc",
        sortOrder: 0,
        archivedAt: null,
      },
    ];
    mocks.getPromptSetDefinition
      .mockResolvedValueOnce(baseDefinition)
      .mockResolvedValueOnce({
        ...baseDefinition,
        prompts: storedSuggestions,
      });
    mocks.getConnection.mockResolvedValue({
      siteUrl: "sc-domain:acme.com",
    });
    mocks.getPerformance.mockResolvedValue({
      rows: [
        {
          keys: ["how does crm work"],
          clicks: 2,
          impressions: 100,
          ctr: 0.02,
          position: 8,
        },
      ],
    });
    mocks.createPromptSuggestion.mockResolvedValue({
      created: true,
      prompt: { id: "stored_suggestion" },
    });

    const result = await AiPromptSuggestionService.refreshSuggestions({
      projectId: "project_1",
      promptSetId: "set_1",
    });

    expect(mocks.getPerformance).toHaveBeenCalledWith({
      projectId: "project_1",
      dimensions: ["query"],
      dateRange: "last_3_months",
      rowLimit: 1_000,
      type: "web",
      dataState: "final",
    });
    expect(mocks.createPromptSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "How does crm work?",
        state: "suggested",
        suggestionSource: "gsc",
      }),
    );
    expect(mocks.createPromptSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        state: "suggested",
        suggestionSource: "topic_gap",
      }),
    );
    expect(result).toMatchObject({
      searchConsoleConnected: true,
      createdBySource: { gsc: 1, topic_gap: 3 },
      suggestions: [{ id: "suggestion_gsc" }],
    });
  });

  it("persists rejection and treats the same decision as idempotent", async () => {
    const suggestion = {
      id: "suggestion_1",
      state: "suggested",
      suggestionSource: "gsc",
    };
    mocks.getPromptSetDefinition.mockResolvedValueOnce({
      ...baseDefinition,
      prompts: [suggestion],
    });
    mocks.updateTrackedPrompt.mockResolvedValue({
      ...suggestion,
      state: "rejected",
    });

    await expect(
      AiPromptSuggestionService.decideSuggestion({
        projectId: "project_1",
        promptSetId: "set_1",
        trackedPromptId: "suggestion_1",
        decision: "reject",
      }),
    ).resolves.toMatchObject({ state: "rejected" });
    expect(mocks.updateTrackedPrompt).toHaveBeenCalledWith(
      "suggestion_1",
      "set_1",
      expect.objectContaining({ state: "rejected" }),
    );

    mocks.getPromptSetDefinition.mockResolvedValueOnce({
      ...baseDefinition,
      prompts: [{ ...suggestion, state: "rejected" }],
    });
    await expect(
      AiPromptSuggestionService.decideSuggestion({
        projectId: "project_1",
        promptSetId: "set_1",
        trackedPromptId: "suggestion_1",
        decision: "reject",
      }),
    ).resolves.toMatchObject({ state: "rejected" });
    expect(mocks.updateTrackedPrompt).toHaveBeenCalledTimes(1);
  });
});
