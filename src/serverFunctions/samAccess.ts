import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveChatProvider } from "@/server/lib/chatProvider";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { requireProjectContext } from "@/serverFunctions/middleware";

const projectScopedSchema = z.object({ projectId: z.string().min(1) });

type SamAccessStatus = {
  enabled: boolean;
  errorMessage: string | null;
};

// Gates the in-app AI agent (SAM) on an AI provider being configured — either
// OpenRouter or a custom OpenAI-compatible one — the same way backlinks/AI-search
// gate on their DataForSEO subscriptions. Hosted deployments always have
// OpenRouter provisioned, so only self-hosted is checked. The reason string comes
// from the resolver so the gate and the agent never disagree about what's wrong.
export const getSamAccessSetupStatus = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async (): Promise<SamAccessStatus> => {
    if (await isHostedServerAuthMode()) {
      return { enabled: true, errorMessage: null };
    }

    const provider = await resolveChatProvider();
    return {
      enabled: provider.ok,
      errorMessage: provider.ok ? null : provider.reason,
    };
  });
