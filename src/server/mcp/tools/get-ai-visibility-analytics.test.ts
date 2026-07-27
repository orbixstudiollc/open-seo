import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MCP_AUTH_CONTEXT_PROP, type ToolExtra } from "@/server/mcp/context";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  getVisibilityOverview: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock("@/server/features/ai-visibility/services/visibilityAnalytics", () => ({
  getVisibilityOverview: mocks.getVisibilityOverview,
}));

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

describe("get_ai_visibility_analytics MCP tool", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getProjectForOrganization.mockReset();
    mocks.getVisibilityOverview.mockReset();
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "project_1",
      locationCode: 2840,
      languageCode: "en",
    });
  });

  it("returns project-scoped stored analytics without provider work", async () => {
    mocks.getVisibilityOverview.mockResolvedValue(
      overviewFixture({
        deltaPctPoints: 8.9,
        status: "available",
        message: "Compared with the previous equivalent period.",
      }),
    );
    const { getAiVisibilityAnalyticsTool } =
      await import("./get-ai-visibility-analytics");

    const result = await getAiVisibilityAnalyticsTool.handler(
      { projectId: "project_1", windowDays: 30 },
      toolExtra,
    );

    expect(mocks.getVisibilityOverview).toHaveBeenCalledWith({
      projectId: "project_1",
      windowDays: 30,
    });
    expect(result.structuredContent).toMatchObject({
      overview: {
        windowDays: 30,
        metric: { visibilityPct: 66.4 },
      },
      meta: {
        projectId: "project_1",
        url: "https://open-seo.test/p/project_1/visibility",
      },
    });
    const first = result.content[0];
    expect(first.type === "text" && first.text).toContain(
      "+8.9 percentage points",
    );
  });

  it("reports insufficient history without inventing a zero delta", async () => {
    mocks.getVisibilityOverview.mockResolvedValue(
      overviewFixture({
        deltaPctPoints: null,
        status: "not_enough_elapsed_history",
        message: "Insufficient history for a complete previous period.",
      }),
    );
    const { getAiVisibilityAnalyticsTool } =
      await import("./get-ai-visibility-analytics");

    const result = await getAiVisibilityAnalyticsTool.handler(
      { projectId: "project_1", windowDays: 30 },
      toolExtra,
    );

    const first = result.content[0];
    expect(first.type === "text" && first.text).toContain(
      "Insufficient history",
    );
    expect(first.type === "text" && first.text).not.toContain(
      "0 percentage points",
    );
  });
});

function overviewFixture(comparison: {
  deltaPctPoints: number | null;
  status: string;
  message: string;
}) {
  return {
    asOf: "2026-07-28T00:00:00.000Z",
    windowDays: 30,
    period: {},
    primaryBrand: { id: "brand_1", name: "Acme" },
    metric: {
      visibilityPct: 66.4,
      mentionedAnswers: 428,
      successfulAnswers: 645,
      failedAnswers: 3,
      expectedAnswers: 648,
      coveragePct: 99.5,
    },
    comparison: {
      ...comparison,
      previousVisibilityPct: 57.5,
    },
    successfulModels: ["chat_gpt"],
    trend: [],
    platforms: [],
    topics: [],
    prompts: [],
    shareOfVoice: null,
  };
}
