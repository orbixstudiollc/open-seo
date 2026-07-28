import type { PublicReport } from "@/types/schemas/reports";

export function ascii(value: string) {
  return value
    .normalize("NFKD")
    .replaceAll(/[^\x20-\x7E]/g, "-")
    .replaceAll(/\s+/g, " ")
    .trim();
}

export function formatReportPercent(value: number | null) {
  return value == null ? "-" : `${formatReportNumber(value)}%`;
}

export function formatReportNumber(value: number | null) {
  return value == null
    ? "-"
    : value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

export function formatSignedReportNumber(value: number) {
  return `${value > 0 ? "+" : ""}${formatReportNumber(value)}`;
}

export function titleCaseReportValue(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");
}

export function formatReportDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function reportPdfFilename(report: PublicReport) {
  const slug =
    report.project.domain ??
    report.project.name.toLowerCase().replaceAll(/\W+/g, "-");
  const safe = slug.replaceAll(/[^a-zA-Z0-9.-]/g, "-").replaceAll(/-+/g, "-");
  return `openseo-${safe || "project"}-${report.windowDays}d-report.pdf`;
}
