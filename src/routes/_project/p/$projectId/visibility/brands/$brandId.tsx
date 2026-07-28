import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BrandVisibilityDetailPage } from "@/client/features/ai-visibility/BrandVisibilityDetailPage";
import { visibilityOverviewSearchSchema } from "@/types/schemas/ai-visibility-analytics";

export const Route = createFileRoute(
  "/_project/p/$projectId/visibility/brands/$brandId",
)({
  validateSearch: visibilityOverviewSearchSchema,
  component: BrandVisibilityDetailRoute,
});

function BrandVisibilityDetailRoute() {
  const { projectId, brandId } = Route.useParams();
  const { days = 30 } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <BrandVisibilityDetailPage
      projectId={projectId}
      brandId={brandId}
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
