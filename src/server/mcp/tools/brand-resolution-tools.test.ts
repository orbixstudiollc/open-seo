import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import {
  normalizeObjectSchema,
  safeParseAsync,
} from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MCP_AUTH_CONTEXT_PROP, type ToolExtra } from "@/server/mcp/context";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  getResolutionState: vi.fn(),
  refreshAutomaticResolutions: vi.fn(),
  applyManualAction: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock("@/server/features/brand-resolution/BrandResolutionService", () => ({
  BrandResolutionService: {
    getResolutionState: mocks.getResolutionState,
    refreshAutomaticResolutions: mocks.refreshAutomaticResolutions,
    applyManualAction: mocks.applyManualAction,
  },
}));

const projectId = "00000000-0000-4000-8000-000000000003";
const state = {
  summary: {
    candidates: 4,
    resolved: 2,
    suppressed: 1,
    needsReview: 1,
    unresolved: 0,
    mentionCount: 12,
  },
  candidates: [
    {
      normalizedName: "clay global",
      rawNames: ["Clay Global"],
      decision: {
        state: "resolved",
        source: "registry",
        brandId: "clay",
        confidence: 1,
        ruleVersion: "brand-resolution-v1",
        evidence: [{ kind: "verified_alias", value: "Clay Global" }],
      },
    },
  ],
  canonicalBrands: [
    {
      brand: { id: "clay", name: "Clay", domain: "clay.global" },
      rawNames: ["Clay", "Clay Global"],
      normalizedNames: ["clay", "clay global"],
      mentionCount: 5,
      mentionRowCount: 2,
    },
  ],
  suggestions: [],
  brands: [{ id: "clay", name: "Clay" }],
  history: [],
  truncated: false,
  ruleVersion: "brand-resolution-v1",
};

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

describe("brand resolution MCP tools", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.getProjectForOrganization.mockResolvedValue({
      id: projectId,
      locationCode: 2840,
      languageCode: "en",
    });
  });

  it("reads bounded resolution state with provenance", async () => {
    mocks.getResolutionState.mockResolvedValue(state);
    const { getBrandResolutionStateTool } =
      await import("./get-brand-resolution-state");

    const result = await getBrandResolutionStateTool.handler(
      { projectId },
      toolExtra,
    );

    expect(mocks.getResolutionState).toHaveBeenCalledWith(projectId);
    expect(result.structuredContent).toMatchObject({
      summary: { resolved: 2, suppressed: 1, needsReview: 1 },
      candidates: [
        {
          normalizedName: "clay global",
          decision: {
            source: "registry",
            ruleVersion: "brand-resolution-v1",
          },
        },
      ],
      meta: { projectId },
    });
    const outputSchema = normalizeObjectSchema(
      getBrandResolutionStateTool.config.outputSchema,
    );
    if (!outputSchema) throw new Error("Output schema did not normalize");
    await expect(
      safeParseAsync(outputSchema, result.structuredContent),
    ).resolves.toMatchObject({ success: true });
  });

  it("refreshes automatic mappings without a paid provider call", async () => {
    mocks.refreshAutomaticResolutions.mockResolvedValue({
      updated: 3,
      state,
    });
    const { manageBrandResolutionTool } =
      await import("./manage-brand-resolution");

    const result = await manageBrandResolutionTool.handler(
      { projectId, action: "refresh" },
      toolExtra,
    );

    expect(mocks.refreshAutomaticResolutions).toHaveBeenCalledWith(projectId);
    expect(result.structuredContent).toMatchObject({
      action: "refresh",
      updated: 3,
      ruleVersion: "brand-resolution-v1",
    });
  });

  it("records the authenticated actor on a manual suppression", async () => {
    mocks.applyManualAction.mockResolvedValue(state);
    const { manageBrandResolutionTool } =
      await import("./manage-brand-resolution");

    await manageBrandResolutionTool.handler(
      {
        projectId,
        action: "suppress",
        normalizedNames: ["saas"],
        reason: "Reviewed generic category term",
      },
      toolExtra,
    );

    expect(mocks.applyManualAction).toHaveBeenCalledWith(
      {
        projectId,
        action: "suppress",
        normalizedNames: ["saas"],
        reason: "Reviewed generic category term",
      },
      "user_123",
    );
  });

  it("authorizes the project before exposing state", async () => {
    mocks.getProjectForOrganization.mockResolvedValue(null);
    const { getBrandResolutionStateTool } =
      await import("./get-brand-resolution-state");

    await expect(
      getBrandResolutionStateTool.handler({ projectId }, toolExtra),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.getResolutionState).not.toHaveBeenCalled();
  });
});
