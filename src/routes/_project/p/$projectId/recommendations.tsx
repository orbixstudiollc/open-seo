import { createFileRoute } from "@tanstack/react-router";
import { RecommendationPage } from "@/client/features/recommendations/RecommendationPage";

export const Route = createFileRoute("/_project/p/$projectId/recommendations")({
  component: RecommendationsRoute,
});

function RecommendationsRoute() {
  const { projectId } = Route.useParams();
  return <RecommendationPage projectId={projectId} />;
}
