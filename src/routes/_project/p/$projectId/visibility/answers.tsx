import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AnswerExplorerPage } from "@/client/features/ai-visibility/AnswerExplorerPage";
import { answerExplorerSearchSchema } from "@/types/schemas/ai-answer-explorer";

export const Route = createFileRoute(
  "/_project/p/$projectId/visibility/answers",
)({
  validateSearch: answerExplorerSearchSchema,
  component: AnswerExplorerRoute,
});

function AnswerExplorerRoute() {
  const { projectId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <AnswerExplorerPage
      projectId={projectId}
      search={search}
      onSearchChange={(nextSearch) => {
        void navigate({
          search: nextSearch,
          replace: true,
        });
      }}
    />
  );
}
