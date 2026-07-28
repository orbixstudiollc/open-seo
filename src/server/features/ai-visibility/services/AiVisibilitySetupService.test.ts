import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getBrandRegistry: vi.fn(),
  getPromptSetsForProject: vi.fn(),
  getPromptSetDefinition: vi.fn(),
  getProjectRunSettings: vi.fn(),
  getPromptSets: vi.fn(),
  updateProjectRunSettings: vi.fn(),
  getPromptSet: vi.fn(),
  createPromptSet: vi.fn(),
  updatePromptSet: vi.fn(),
  createTopic: vi.fn(),
  createTrackedPrompt: vi.fn(),
  configureRegistry: vi.fn(),
  getConnection: vi.fn(),
}));

vi.mock(
  "@/server/features/ai-visibility/repositories/AiVisibilityRepository",
  () => ({
    AiVisibilityRepository: {
      getBrandRegistry: mocks.getBrandRegistry,
      getPromptSetsForProject: mocks.getPromptSetsForProject,
      getPromptSetDefinition: mocks.getPromptSetDefinition,
    },
  }),
);
vi.mock("@/server/features/ai-visibility/services/AiVisibilityService", () => ({
  AiVisibilityService: {
    getProjectRunSettings: mocks.getProjectRunSettings,
    getPromptSets: mocks.getPromptSets,
    updateProjectRunSettings: mocks.updateProjectRunSettings,
    getPromptSet: mocks.getPromptSet,
    createPromptSet: mocks.createPromptSet,
    updatePromptSet: mocks.updatePromptSet,
    createTopic: mocks.createTopic,
    createTrackedPrompt: mocks.createTrackedPrompt,
  },
}));
vi.mock("@/server/features/brand-resolution/BrandResolutionService", () => ({
  BrandResolutionService: {
    configureRegistry: mocks.configureRegistry,
  },
}));
vi.mock("@/server/features/gsc/services/GscService", () => ({
  GscService: {
    getConnection: mocks.getConnection,
  },
}));

import { AiVisibilitySetupService } from "./AiVisibilitySetupService";

const promptSetDefinition = {
  promptSet: {
    id: "set_1",
    projectId: "project_1",
    name: "Core visibility",
    normalizedName: "core visibility",
    archivedAt: null,
  },
  models: [{ promptSetId: "set_1", model: "chat_gpt" }],
  topics: [],
  prompts: [],
  tags: [],
  assignments: [],
};

describe("AiVisibilitySetupService", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  it("takes a fresh project to a complete weekly configuration", async () => {
    const completedDefinition = {
      ...promptSetDefinition,
      topics: [
        {
          id: "topic_1",
          name: "Discovery",
          normalizedName: "discovery",
          archivedAt: null,
        },
      ],
      prompts: [
        {
          id: "prompt_1",
          promptSetId: "set_1",
          topicId: "topic_1",
          prompt: "What is Acme best known for?",
          normalizedPrompt: "What is Acme best known for?",
          state: "active",
          archivedAt: null,
        },
      ],
    };
    mocks.getPromptSets.mockResolvedValue([]);
    mocks.createPromptSet.mockResolvedValue(promptSetDefinition);
    mocks.createTopic.mockResolvedValue({
      id: "topic_1",
      name: "Discovery",
      normalizedName: "discovery",
      archivedAt: null,
    });
    mocks.createTrackedPrompt.mockResolvedValue(completedDefinition.prompts[0]);
    mocks.getBrandRegistry.mockResolvedValue({
      brands: [
        {
          id: "brand_1",
          name: "Acme",
          domain: "acme.com",
          isPrimary: true,
          archivedAt: null,
        },
      ],
      aliases: [],
    });
    mocks.getPromptSetsForProject.mockResolvedValue([
      completedDefinition.promptSet,
    ]);
    mocks.getPromptSetDefinition.mockResolvedValue(completedDefinition);
    mocks.getProjectRunSettings.mockResolvedValue({
      cadence: "weekly",
      answerCallCap: 200,
    });
    mocks.getConnection.mockResolvedValue(null);

    const result = await AiVisibilitySetupService.completeSetup(
      {
        projectId: "project_1",
        primary: { name: "Acme", domain: "acme.com" },
        competitors: [{ name: "Contoso", domain: "contoso.com" }],
        promptSet: {
          name: "Core visibility",
          models: ["chat_gpt"],
          topics: [
            {
              name: "Discovery",
              prompts: ["What is Acme best known for?"],
            },
          ],
        },
        answerCallCap: 200,
      },
      "user_1",
    );

    expect(mocks.configureRegistry).toHaveBeenCalledWith(
      {
        projectId: "project_1",
        primary: { name: "Acme", domain: "acme.com" },
        competitors: [{ name: "Contoso", domain: "contoso.com" }],
      },
      "user_1",
    );
    expect(mocks.updateProjectRunSettings).toHaveBeenCalledWith({
      projectId: "project_1",
      cadence: "weekly",
      answerCallCap: 200,
    });
    expect(mocks.createTrackedPrompt).toHaveBeenCalledWith({
      projectId: "project_1",
      promptSetId: "set_1",
      topicId: "topic_1",
      prompt: "What is Acme best known for?",
      sortOrder: 0,
    });
    expect(result).toMatchObject({
      promptSetId: "set_1",
      state: {
        needsSetup: false,
        primaryBrand: { name: "Acme" },
        settings: { cadence: "weekly", answerCallCap: 200 },
      },
    });
  });
});
