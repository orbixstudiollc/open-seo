import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MCP_AUTH_CONTEXT_PROP, type ToolExtra } from "@/server/mcp/context";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  getCitationIntelligenceOverview: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock(
  "@/server/features/ai-visibility/services/citationIntelligence",
  () => ({
    getCitationIntelligenceOverview: mocks.getCitationIntelligenceOverview,
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

describe("get_ai_citation_intelligence MCP tool", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getProjectForOrganization.mockReset();
    mocks.getCitationIntelligenceOverview.mockReset();
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "project_1",
      locationCode: 2840,
      languageCode: "en",
    });
    mocks.getCitationIntelligenceOverview.mockResolvedValue(overviewFixture());
  });

  it("returns project-scoped stored citation intelligence without provider work", async () => {
    const { getAiCitationIntelligenceTool } =
      await import("./get-ai-citation-intelligence");

    const result = await getAiCitationIntelligenceTool.handler(
      { projectId: "project_1", windowDays: 30 },
      toolExtra,
    );

    expect(mocks.getCitationIntelligenceOverview).toHaveBeenCalledWith({
      projectId: "project_1",
      windowDays: 30,
    });
    expect(result.structuredContent).toMatchObject({
      overview: {
        windowDays: 30,
        metric: { avgCitationsPerAnswer: 1.5 },
        gapReport: {
          entries: [{ domain: "gap.example" }],
        },
      },
      meta: {
        projectId: "project_1",
        url: "https://open-seo.test/p/project_1/citations",
      },
    });
    const first = result.content[0];
    expect(first.type === "text" && first.text).toContain(
      "1 domains cited in competitor-mentioned answers",
    );
  });

  it("enforces project membership before reading citation rows", async () => {
    mocks.getProjectForOrganization.mockResolvedValue(null);
    const { getAiCitationIntelligenceTool } =
      await import("./get-ai-citation-intelligence");

    await expect(
      getAiCitationIntelligenceTool.handler(
        { projectId: "foreign_project", windowDays: 7 },
        toolExtra,
      ),
    ).rejects.toThrow();
    expect(mocks.getCitationIntelligenceOverview).not.toHaveBeenCalled();
  });
});

function overviewFixture() {
  return {
    asOf: "2026-07-28T00:00:00.000Z",
    windowDays: 30,
    period: {
      currentStart: "2026-06-28T00:00:00.000Z",
      currentEnd: "2026-07-28T00:00:00.000Z",
      previousStart: "2026-05-29T00:00:00.000Z",
      previousEnd: "2026-06-28T00:00:00.000Z",
    },
    primaryBrand: { id: "brand_1", name: "Acme" },
    metric: {
      citations: 150,
      citedAnswers: 80,
      successfulAnswers: 100,
      uniqueDomains: 22,
      uniqueUrls: 47,
      avgCitationsPerAnswer: 1.5,
      citedAnswerPct: 80,
    },
    trend: [],
    domains: [],
    urls: [],
    gapReport: {
      trackedCompetitors: 2,
      totalDomains: 1,
      truncated: false,
      scopeNote: "Stored window.",
      entries: [
        {
          domain: "gap.example",
          classification: {
            domainType: "unknown",
            method: "unclassified",
            matchScope: null,
            ruleVersion: null,
            confidence: null,
          },
          competitorBrands: [{ id: "brand_2", name: "Beta" }],
          competitorMentionedAnswers: 4,
          citationsInCompetitorAnswers: 6,
          totalCitations: 7,
        },
      ],
    },
    classificationNote: "Maintained list and narrow heuristic.",
  };
}
