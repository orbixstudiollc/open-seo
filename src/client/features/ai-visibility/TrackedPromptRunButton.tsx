import { useMutation } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { runAiTrackedPromptNow } from "@/serverFunctions/ai-search";

export function TrackedPromptRunButton({
  projectId,
  promptSetId,
  trackedPromptId,
  modelCount,
  compact = false,
}: {
  projectId: string;
  promptSetId: string;
  trackedPromptId: string;
  modelCount: number;
  compact?: boolean;
}) {
  const run = useMutation({
    mutationFn: () =>
      runAiTrackedPromptNow({
        data: { projectId, promptSetId, trackedPromptId },
      }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(
          `Prompt run started. ${result.answerCallsReserved} model calls reserved.`,
        );
      } else if (result.reason === "run_cap_reached") {
        toast.error(
          `Run cap reached: ${result.callsReserved} of ${result.answerCallCap} calls are already reserved. This prompt needs ${result.requestedAnswerCalls}.`,
        );
      } else {
        toast.info("This prompt set already has a run in progress.");
      }
    },
    onError: (error) =>
      toast.error(
        getStandardErrorMessage(error, "Couldn't start the prompt run."),
      ),
  });
  const label = run.isPending
    ? "Starting…"
    : compact
      ? "Run"
      : `Run ${modelCount} ${modelCount === 1 ? "model" : "models"}`;

  return (
    <button
      type="button"
      className={`btn btn-primary gap-1.5 ${compact ? "btn-xs" : "btn-sm"}`}
      disabled={run.isPending}
      onClick={() => run.mutate()}
    >
      {run.isPending ? (
        <span className="loading loading-spinner loading-xs" />
      ) : (
        <Play className="size-3.5" />
      )}
      {label}
    </button>
  );
}
