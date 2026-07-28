import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CitationIntelligencePage } from "@/client/features/ai-visibility/CitationIntelligencePage";
import { citationIntelligenceSearchSchema } from "@/types/schemas/citation-intelligence";

export const Route = createFileRoute("/_project/p/$projectId/citations")({
  validateSearch: citationIntelligenceSearchSchema,
  component: CitationIntelligenceRoute,
});

function CitationIntelligenceRoute() {
  const { projectId } = Route.useParams();
  const { days = 30 } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <CitationIntelligencePage
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
