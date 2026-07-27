import {
  createOpenRouter,
  type LanguageModelV3,
} from "@openrouter/ai-sdk-provider";
import { getEnvValueSync, getWorkersEnvRecord } from "@/server/lib/runtime-env";

// OpenRouter model slug used for the in-app chat agents (onboarding + SAM)
// when no custom provider is configured. Override with OPENROUTER_MODEL.
const DEFAULT_CHAT_AGENT_MODEL = "minimax/minimax-m3";

/**
 * Which upstream the chat agents talk to.
 *
 * `openrouter` is the default and the only one the hosted service uses.
 * `custom` is any OpenAI-compatible gateway — a self-hosted LiteLLM/vLLM/Ollama,
 * or another vendor — selected by setting AI_BASE_URL.
 */
type ChatProviderConfig =
  | { kind: "openrouter"; apiKey: string; modelId: string }
  | { kind: "custom"; apiKey: string; modelId: string; baseURL: string };

type ChatProviderResult =
  | { ok: true; config: ChatProviderConfig }
  | { ok: false; reason: string };

const NOTHING_CONFIGURED =
  "No AI provider is configured for this deployment yet. Set OPENROUTER_API_KEY, or set AI_BASE_URL + AI_API_KEY + AI_MODEL to use your own OpenAI-compatible provider. Restart OpenSEO, then confirm here.";

/**
 * Resolves the chat provider from environment, preferring an explicitly
 * configured custom provider over OpenRouter.
 *
 * A custom provider is selected by AI_BASE_URL alone, and then AI_API_KEY and
 * AI_MODEL are both required: the OpenRouter default slug is a provider-specific
 * name no other gateway resolves, so silently falling back to it would surface
 * as a confusing 404 on the first chat turn instead of a clear setup error.
 */
export function resolveChatProviderSync(env: object): ChatProviderResult {
  const baseURL = getEnvValueSync(env, "AI_BASE_URL");
  if (baseURL) {
    const apiKey = getEnvValueSync(env, "AI_API_KEY");
    const modelId = getEnvValueSync(env, "AI_MODEL");
    const missing = [
      apiKey ? null : "AI_API_KEY",
      modelId ? null : "AI_MODEL",
    ].filter((name): name is string => name !== null);
    if (missing.length > 0) {
      return {
        ok: false,
        reason: `AI_BASE_URL is set, so a custom AI provider is selected, but ${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} missing. Set ${missing.length === 1 ? "it" : "them"}, restart OpenSEO, then confirm here.`,
      };
    }
    return {
      ok: true,
      // Both are non-null here; `missing` above is the only path where they aren't.
      config: { kind: "custom", apiKey: apiKey!, modelId: modelId!, baseURL },
    };
  }

  const apiKey = getEnvValueSync(env, "OPENROUTER_API_KEY");
  if (!apiKey) {
    return { ok: false, reason: NOTHING_CONFIGURED };
  }
  return {
    ok: true,
    config: {
      kind: "openrouter",
      apiKey,
      modelId:
        getEnvValueSync(env, "OPENROUTER_MODEL") ?? DEFAULT_CHAT_AGENT_MODEL,
    },
  };
}

/** Async variant for callers outside a Durable Object's sync `getModel()` hook. */
export async function resolveChatProvider(): Promise<ChatProviderResult> {
  return resolveChatProviderSync((await getWorkersEnvRecord()) ?? {});
}

/**
 * Builds the AI SDK LanguageModel for a resolved provider.
 *
 * On the OpenRouter path, `usage: { include: true }` turns on usage accounting
 * so each response carries its real USD cost
 * (providerMetadata.openrouter.usage.cost) — metered against the shared usage
 * credit pool. `provider.order` prefers Together, then Atlas Cloud (fp8);
 * `zdr: true` restricts routing to Zero-Data-Retention endpoints (prompts are
 * never retained), which is the actual constraint. Fallbacks stay on within the
 * ZDR set because pinning providers caused a prod outage (Jul 2026: Together
 * upstream-rate-limited m3 and every chat turn 429'd). `reasoning` routes the
 * model's chain-of-thought to a separate stream instead of leaking `<think>`
 * traces into the visible answer.
 *
 * None of those options are portable: they are OpenRouter request extensions,
 * and a strict OpenAI-compatible server rejects the unknown body keys. The
 * custom path therefore sends a plain request and gives up cost metering and
 * the reasoning channel — the trade for provider freedom.
 */
export function buildChatAgentModel(
  config: ChatProviderConfig,
): LanguageModelV3 {
  if (config.kind === "custom") {
    return createOpenRouter({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    })(config.modelId);
  }
  return createOpenRouter({ apiKey: config.apiKey })(config.modelId, {
    usage: { include: true },
    reasoning: { effort: "medium" },
    provider: {
      order: ["together", "atlas-cloud/fp8"],
      zdr: true,
      allow_fallbacks: true,
    },
  });
}
