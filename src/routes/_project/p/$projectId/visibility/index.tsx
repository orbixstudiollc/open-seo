import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { VisibilityOverviewPage } from "@/client/features/ai-visibility/VisibilityOverviewPage";
import { visibilityOverviewSearchSchema } from "@/types/schemas/ai-visibility-analytics";

export const Route = createFileRoute("/_project/p/$projectId/visibility/")({
  validateSearch: visibilityOverviewSearchSchema,
  component: VisibilityOverviewRoute,
});

function VisibilityOverviewRoute() {
  const { projectId } = Route.useParams();
  const { days = 30 } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <VisibilityOverviewPage
      projectId={projectId}
      windowDays={days}
      onWindowChange={(nextDays) => {
        void navigate({
          search: { days: nextDays === 30 ? undefined : nextDays },
          replace: true,
        });
      }}
    />
  );
}
