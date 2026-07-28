import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_project/p/$projectId/visibility")({
  component: VisibilityLayout,
});

function VisibilityLayout() {
  return <Outlet />;
}
