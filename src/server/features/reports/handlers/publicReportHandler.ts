import { renderPublicReportHtml } from "../renderers/reportHtml";
import { renderReportPdf, reportPdfFilename } from "../renderers/reportPdf";
import { buildProjectReport } from "../services/ReportService";
import { resolveReportShare } from "../services/ReportShareService";
import type { ReportRuntimeEnv } from "../services/reportSharingPolicy";

const PUBLIC_REPORT_HEADERS = {
  "Cache-Control": "no-store, private, max-age=0",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
} as const;

const SHARE_PATH_PATTERN = /^\/share\/([A-Za-z0-9_-]{43})(\/report\.pdf)?$/;

export async function handlePublicReportRequest(
  request: Request,
  env: ReportRuntimeEnv,
) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", {
      status: 405,
      headers: {
        ...PUBLIC_REPORT_HEADERS,
        Allow: "GET, HEAD",
      },
    });
  }

  const url = new URL(request.url);
  const match = SHARE_PATH_PATTERN.exec(url.pathname);
  if (!match || url.search) return reportNotFound();
  const token = match[1];
  const wantsPdf = Boolean(match[2]);
  const now = new Date();
  const share = await resolveReportShare({ token, env, now });
  if (!share) return reportNotFound();

  try {
    const report = await buildProjectReport({
      project: share.project,
      windowDays: share.windowDays,
      asOf: now,
    });
    if (wantsPdf) {
      const bytes = await renderReportPdf(report);
      return new Response(
        request.method === "HEAD" ? null : Uint8Array.from(bytes).buffer,
        {
          headers: {
            ...PUBLIC_REPORT_HEADERS,
            "Content-Disposition": `attachment; filename="${reportPdfFilename(report)}"`,
            "Content-Type": "application/pdf",
          },
        },
      );
    }

    const html = renderPublicReportHtml(report);
    return new Response(request.method === "HEAD" ? null : html, {
      headers: {
        ...PUBLIC_REPORT_HEADERS,
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("[report-share] Report rendering failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return new Response("Report unavailable", {
      status: 500,
      headers: PUBLIC_REPORT_HEADERS,
    });
  }
}

function reportNotFound() {
  return new Response("Report not found", {
    status: 404,
    headers: PUBLIC_REPORT_HEADERS,
  });
}
