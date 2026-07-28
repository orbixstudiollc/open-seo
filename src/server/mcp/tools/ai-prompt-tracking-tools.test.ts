import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MCP_AUTH_CONTEXT_PROP, type ToolExtra } from "@/server/mcp/context";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  updateProjectRunSettings: vi.fn(),
  runPromptSet: vi.fn(),
  runTrackedPrompt: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock("@/server/features/ai-visibility/services/AiVisibilityService", () => ({
  AiVisibilityService: {
    updateProjectRunSettings: mocks.updateProjectRunSettings,
    runPromptSet: mocks.runPromptSet,
    runTrackedPrompt: mocks.runTrackedPrompt,
  },
}));

import {
  manageAiPromptTrackingTool,
  runAiPromptSetTool,
  runAiTrackedPromptTool,
} from "./ai-prompt-tracking-tools";

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

describe("AI prompt tracking MCP tools", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "project_1",
      locationCode: 2840,
      languageCode: "en",
    });
  });

  it("updates project cadence and the hard call cap", async () => {
    mocks.updateProjectRunSettings.mockResolvedValue({
      projectId: "project_1",
      cadence: "weekly",
      answerCallCap: 200,
    });

    const result = await manageAiPromptTrackingTool.handler(
      {
        projectId: "project_1",
        action: "update_settings",
        cadence: "weekly",
        answerCallCap: 200,
      },
      toolExtra,
    );

    expect(mocks.updateProjectRunSettings).toHaveBeenCalledWith({
      projectId: "project_1",
      cadence: "weekly",
      answerCallCap: 200,
    });
    expect(result.structuredContent).toMatchObject({
      result: { answerCallCap: 200 },
      meta: { projectId: "project_1" },
    });
  });

  it("runs through the paid manual path with authenticated billing context", async () => {
    mocks.runPromptSet.mockResolvedValue({
      ok: true,
      runId: "run_1",
      answerCallsReserved: 180,
    });

    const result = await runAiPromptSetTool.handler(
      { projectId: "project_1", promptSetId: "set_1" },
      toolExtra,
    );

    expect(mocks.runPromptSet).toHaveBeenCalledWith({
      projectId: "project_1",
      promptSetId: "set_1",
      billingCustomer: {
        userId: "user_123",
        userEmail: "alice@example.com",
        organizationId: "org_123",
        projectId: "project_1",
      },
    });
    expect(result.structuredContent).toMatchObject({
      result: { runId: "run_1" },
      meta: { runId: "run_1" },
    });
  });

  it("rejects a project outside the caller's organization", async () => {
    mocks.getProjectForOrganization.mockResolvedValue(null);

    await expect(
      runAiPromptSetTool.handler(
        { projectId: "project_other", promptSetId: "set_1" },
        toolExtra,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.runPromptSet).not.toHaveBeenCalled();
  });

  it("runs one tracked prompt with the authenticated billing context", async () => {
    mocks.runTrackedPrompt.mockResolvedValue({
      ok: true,
      runId: "run_single",
      answerCallsReserved: 4,
    });

    const result = await runAiTrackedPromptTool.handler(
      {
        projectId: "project_1",
        promptSetId: "set_1",
        trackedPromptId: "prompt_1",
      },
      toolExtra,
    );

    expect(mocks.runTrackedPrompt).toHaveBeenCalledWith({
      projectId: "project_1",
      promptSetId: "set_1",
      trackedPromptId: "prompt_1",
      billingCustomer: {
        userId: "user_123",
        userEmail: "alice@example.com",
        organizationId: "org_123",
        projectId: "project_1",
      },
    });
    expect(result.structuredContent).toMatchObject({
      result: { runId: "run_single", answerCallsReserved: 4 },
      meta: { runId: "run_single" },
    });
  });
});
