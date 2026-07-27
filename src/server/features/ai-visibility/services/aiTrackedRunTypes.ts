import type { BillingCustomerContext } from "@/server/billing/subscription";
import type { PromptExplorerModel } from "@/types/schemas/ai-search";

export type AiTrackedPromptSnapshot = {
  id: string;
  prompt: string;
};

export type AiTrackedRunParams = {
  runId: string;
  promptSetId: string;
  projectId: string;
  trigger: "manual" | "scheduled";
  billingCustomer: BillingCustomerContext;
  prompts: AiTrackedPromptSnapshot[];
  models: PromptExplorerModel[];
};

export type AiTrackedRunStartResult =
  | { ok: true; runId: string; answerCallsReserved: number }
  | {
      ok: false;
      reason: "already_running";
      blockingRunId: string | null;
    }
  | {
      ok: false;
      reason: "run_cap_reached";
      requestedAnswerCalls: number;
      callsReserved: number;
      answerCallCap: number;
      windowStartedAt: string;
    };
