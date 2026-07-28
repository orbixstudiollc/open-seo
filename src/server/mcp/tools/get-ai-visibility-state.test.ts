import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MCP_AUTH_CONTEXT_PROP, type ToolExtra } from "@/server/mcp/context";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  getPromptSetsForProject: vi.fn(),
  getBrandRegistry: vi.fn(),
  getRunsForProject: vi.fn(),
  getOrCreateProjectRunSettings: vi.fn(),
  getPromptSetDefinition: vi.fn(),
  getRunWithObservations: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock(
  "@/server/features/ai-visibility/repositories/AiVisibilityRepository",
  () => ({
    AiVisibilityRepository: {
      getPromptSetsForProject: mocks.getPromptSetsForProject,
      getBrandRegistry: mocks.getBrandRegistry,
      getRunsForProject: mocks.getRunsForProject,
      getOrCreateProjectRunSettings: mocks.getOrCreateProjectRunSettings,
      getPromptSetDefinition: mocks.getPromptSetDefinition,
      getRunWithObservations: mocks.getRunWithObservations,
    },
  }),
);

const toolExtra: ToolExtra = {
  signal: new AbortController().signal,
  requestId: 1,
  sendNotification: vi.fn(),
  sendRequest: vi.fn(),
  authInfo: {
    token: "token",
    clientId: "client_123",
    scopes: ["mcp"],
    resource: new URL("https://open-seo.test/mcp"),
    extra: {
      [MCP_AUTH_CONTEXT_PROP]: {
        userId: "user_123",
        userEmail: "alice@example.com",
        organizationId: "org_123",
        clientId: "client_123",
        scopes: ["mcp"],
        audience: "https://open-seo.test/mcp",
        subject: "user_123",
        baseUrl: "https://open-seo.test",
      },
    },
  } satisfies AuthInfo,
};

describe("get_ai_visibility_state MCP tool", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "project_1",
      locationCode: 2840,
      languageCode: "en",
    });
    mocks.getOrCreateProjectRunSettings.mockResolvedValue({
      projectId: "project_1",
      cadence: "weekly",
      answerCallCap: 200,
      callsReserved: 0,
    });
  });

  it("returns project-scoped persisted state without spending credits", async () => {
    mocks.getPromptSetsForProject.mockResolvedValue([
      { id: "set_1", projectId: "project_1", name: "Core" },
    ]);
    mocks.getBrandRegistry.mockResolvedValue({
      brands: [{ id: "brand_1", name: "Acme" }],
      aliases: [{ id: "alias_1", alias: "Acme Inc." }],
    });
    mocks.getRunsForProject.mockResolvedValue([
      { id: "run_1", status: "completed" },
    ]);
    const { getAiVisibilityStateTool } =
      await import("./get-ai-visibility-state");

    const result = await getAiVisibilityStateTool.handler(
      { projectId: "project_1" },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({
      promptSets: [{ id: "set_1" }],
      brands: [{ id: "brand_1" }],
      aliases: [{ id: "alias_1" }],
      runs: [{ id: "run_1" }],
      settings: { cadence: "weekly", answerCallCap: 200 },
      meta: { projectId: "project_1" },
    });
  });

  it("reports persisted state when only the brand registry has data", async () => {
    mocks.getPromptSetsForProject.mockResolvedValue([]);
    mocks.getBrandRegistry.mockResolvedValue({
      brands: [{ id: "brand_1", name: "Acme" }],
      aliases: [],
    });
    mocks.getRunsForProject.mockResolvedValue([]);
    const { getAiVisibilityStateTool } =
      await import("./get-ai-visibility-state");

    const result = await getAiVisibilityStateTool.handler(
      { projectId: "project_1" },
      toolExtra,
    );

    const first = result.content?.[0];
    expect(first?.type).toBe("text");
    if (first?.type === "text") {
      expect(first.text).toBe(
        "AI visibility state: 0 prompt sets, 1 brands, 0 recent runs.",
      );
    }
  });

  it("does not expose a run belonging to another project", async () => {
    mocks.getRunWithObservations.mockResolvedValue({
      run: { id: "run_other", projectId: "project_other" },
      answers: [],
      mentions: [],
      citations: [],
    });
    const { getAiVisibilityStateTool } =
      await import("./get-ai-visibility-state");

    const result = await getAiVisibilityStateTool.handler(
      { projectId: "project_1", runId: "run_other" },
      toolExtra,
    );

    expect(result.structuredContent).not.toHaveProperty("run");
    const first = result.content?.[0];
    expect(first?.type).toBe("text");
    if (first?.type === "text") {
      expect(first.text).toContain("not found");
    }
  });

  it("exposes bounded mention scoring outcomes and their separate costs", async () => {
    mocks.getRunWithObservations.mockResolvedValue({
      run: { id: "run_1", projectId: "project_1", status: "completed" },
      answers: [
        {
          id: "answer_1",
          responseText: "Acme is excellent.",
          status: "success",
        },
      ],
      mentions: [
        {
          id: 1,
          answerId: "answer_1",
          rawName: "Acme",
          sentiment: "positive",
          position: 1,
          scoringStatus: "scored",
        },
      ],
      scoringAttempts: [
        {
          id: "score_1",
          answerId: "answer_1",
          status: "success",
          costUsd: 0.003,
          costBasis: "actual",
        },
      ],
      citations: [],
    });
    const { getAiVisibilityStateTool } =
      await import("./get-ai-visibility-state");

    const result = await getAiVisibilityStateTool.handler(
      { projectId: "project_1", runId: "run_1" },
      toolExtra,
    );

    expect(result.structuredContent).toMatchObject({
      mentions: [{ sentiment: "positive", position: 1 }],
      scoringAttempts: [{ id: "score_1", costUsd: 0.003, costBasis: "actual" }],
    });
  });
});
