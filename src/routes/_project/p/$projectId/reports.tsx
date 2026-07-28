import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ReportsPage } from "@/client/features/reports/ReportsPage";
import { reportSearchSchema } from "@/types/schemas/reports";

export const Route = createFileRoute("/_project/p/$projectId/reports")({
  validateSearch: reportSearchSchema,
  component: ReportsRoute,
});

function ReportsRoute() {
  const { projectId } = Route.useParams();
  const { days = 30 } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <ReportsPage
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
