import { createFileRoute } from "@tanstack/react-router";
import { resolveUserContextFromHeaders } from "@/middleware/ensure-user/resolve";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import {
  renderReportPdf,
  reportPdfFilename,
} from "@/server/features/reports/renderers/reportPdf";
import { buildProjectReport } from "@/server/features/reports/services/ReportService";
import { responseForAppError } from "@/server/lib/http-errors";
import { AppError } from "@/server/lib/errors";
import { reportInputSchema } from "@/types/schemas/reports";

async function handleExport(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = reportInputSchema.safeParse({
      projectId: url.searchParams.get("projectId"),
      windowDays: url.searchParams.get("days") ?? 30,
    });
    if (!parsed.success) throw new AppError("VALIDATION_ERROR");
    const input = parsed.data;
    const context = await resolveUserContextFromHeaders(request.headers);
    const project = await ProjectRepository.getProjectForOrganization(
      input.projectId,
      context.organizationId,
    );
    if (!project) throw new AppError("NOT_FOUND");

    const report = await buildProjectReport({
      project,
      windowDays: input.windowDays,
    });
    const bytes = await renderReportPdf(report);
    return new Response(Uint8Array.from(bytes).buffer, {
      headers: {
        "Cache-Control": "no-store, private, max-age=0",
        "Content-Disposition": `attachment; filename="${reportPdfFilename(report)}"`,
        "Content-Type": "application/pdf",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return responseForAppError(error, "Report export failed");
  }
}

export const Route = createFileRoute("/api/reports/export")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => handleExport(request),
    },
  },
});
