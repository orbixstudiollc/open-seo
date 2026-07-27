import { createFileRoute } from "@tanstack/react-router";
import { BrandResolutionPage } from "@/client/features/brand-resolution/BrandResolutionPage";

export const Route = createFileRoute("/_project/p/$projectId/brand-resolution")(
  {
    component: BrandResolutionRoute,
  },
);

function BrandResolutionRoute() {
  const { projectId } = Route.useParams();
  return <BrandResolutionPage projectId={projectId} />;
}
