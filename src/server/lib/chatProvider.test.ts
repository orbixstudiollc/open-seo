import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildChatAgentModel,
  buildMentionScoringModel,
  resolveChatProviderSync,
} from "@/server/lib/chatProvider";

// getEnvValueSync reads process.env first, so a real key in the test runner's
// environment would otherwise decide these cases instead of the passed record.
const ENV_KEYS = [
  "OPENROUTER_API_KEY",
  "OPENROUTER_MODEL",
  "AI_BASE_URL",
  "AI_API_KEY",
  "AI_MODEL",
];

beforeEach(() => {
  for (const key of ENV_KEYS) vi.stubEnv(key, "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveChatProviderSync", () => {
  it("selects the custom provider when AI_BASE_URL is fully configured", () => {
    const result = resolveChatProviderSync({
      AI_BASE_URL: "https://gateway.example.com/v1",
      AI_API_KEY: "custom-key",
      AI_MODEL: "some-model",
    });
    expect(result).toEqual({
      ok: true,
      config: {
        kind: "custom",
        apiKey: "custom-key",
        modelId: "some-model",
        baseURL: "https://gateway.example.com/v1",
      },
    });
  });

  it("names the single missing custom variable", () => {
    const result = resolveChatProviderSync({
      AI_BASE_URL: "https://gateway.example.com/v1",
      AI_API_KEY: "custom-key",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("AI_MODEL is missing");
    expect(result.reason).not.toContain("AI_API_KEY");
  });

  it("names both missing custom variables", () => {
    const result = resolveChatProviderSync({
      AI_BASE_URL: "https://gateway.example.com/v1",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("AI_API_KEY and AI_MODEL are missing");
  });

  it("does not silently fall back to OpenRouter when the custom provider is half-configured", () => {
    // Both are set: an incomplete custom config must surface as an error rather
    // than quietly sending the request to OpenRouter with the wrong key.
    const result = resolveChatProviderSync({
      AI_BASE_URL: "https://gateway.example.com/v1",
      OPENROUTER_API_KEY: "openrouter-key",
    });
    expect(result.ok).toBe(false);
  });

  it("falls back to OpenRouter with the default slug", () => {
    const result = resolveChatProviderSync({
      OPENROUTER_API_KEY: "openrouter-key",
    });
    expect(result).toEqual({
      ok: true,
      config: {
        kind: "openrouter",
        apiKey: "openrouter-key",
        modelId: "minimax/minimax-m3",
      },
    });
  });

  it("honours OPENROUTER_MODEL on the OpenRouter path", () => {
    const result = resolveChatProviderSync({
      OPENROUTER_API_KEY: "openrouter-key",
      OPENROUTER_MODEL: "openai/gpt-5",
    });
    expect(result.ok && result.config.modelId).toBe("openai/gpt-5");
  });

  it("reports nothing configured when no provider is set", () => {
    const result = resolveChatProviderSync({});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("No AI provider is configured");
  });

  it("ignores empty-string env values", () => {
    const result = resolveChatProviderSync({
      AI_BASE_URL: "",
      OPENROUTER_API_KEY: "openrouter-key",
    });
    expect(result.ok && result.config.kind).toBe("openrouter");
  });
});

describe("buildChatAgentModel", () => {
  it("builds a model for the custom provider", () => {
    const model = buildChatAgentModel({
      kind: "custom",
      apiKey: "custom-key",
      modelId: "claude-sonnet-4.6",
      baseURL: "https://gateway.example.com/v1",
    });
    expect(model.modelId).toBe("claude-sonnet-4.6");
  });

  it("builds a model for OpenRouter", () => {
    const model = buildChatAgentModel({
      kind: "openrouter",
      apiKey: "openrouter-key",
      modelId: "minimax/minimax-m3",
    });
    expect(model.modelId).toBe("minimax/minimax-m3");
  });
});

describe("buildMentionScoringModel", () => {
  it("uses the configured chat-provider model for scoring", () => {
    const model = buildMentionScoringModel({
      kind: "custom",
      apiKey: "custom-key",
      modelId: "local-scorer",
      baseURL: "https://gateway.example.com/v1",
    });
    expect(model.modelId).toBe("local-scorer");
  });
});
