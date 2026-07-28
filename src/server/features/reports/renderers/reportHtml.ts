import type { PublicReport } from "@/types/schemas/reports";

export function renderPublicReportHtml(report: PublicReport) {
  const visibility = formatPercent(report.visibility.visibilityPct);
  const coverage = formatPercent(report.visibility.coveragePct);
  const citationRate = formatPercent(report.citations.citedAnswerPct);
  const domains = report.citations.topDomains
    .map(
      (row) => `<tr>
        <td>${escapeHtml(row.domain)}</td>
        <td>${escapeHtml(titleCase(row.domainType))}</td>
        <td class="number">${row.citations.toLocaleString()}</td>
        <td class="number">${row.citingAnswers.toLocaleString()}</td>
      </tr>`,
    )
    .join("");
  const gaps = report.citations.competitorSourceGaps
    .map(
      (row) => `<tr>
        <td>${escapeHtml(row.domain)}</td>
        <td>${escapeHtml(row.competitorNames.join(", "))}</td>
        <td class="number">${row.competitorMentionedAnswers.toLocaleString()}</td>
        <td class="number">${row.citationsInCompetitorAnswers.toLocaleString()}</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>${escapeHtml(report.project.name)} - OpenSEO report</title>
  <style>
    :root{color-scheme:light;--canvas:#f7f7f4;--soft:#fafaf7;--surface:#fff;--ink:#26251e;--body:#5a5852;--muted:#807d72;--line:#e6e5e0;--accent:#f54e00}
    *{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--ink);font-family:system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif;line-height:1.5}
    main{width:min(1080px,calc(100% - 32px));margin:0 auto;padding:48px 0 80px}.brand{color:var(--accent);font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
    h1,h2{font-weight:400;letter-spacing:-.02em}h1{font-size:clamp(32px,6vw,52px);line-height:1.05;margin:24px 0 8px}h2{font-size:25px;margin:42px 0 16px}.meta,.note{color:var(--muted);font-size:14px}
    .metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:20px}.label{color:var(--muted);font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.value{font-size:32px;letter-spacing:-.02em;margin-top:8px}.detail{color:var(--body);font-size:14px;margin-top:8px}
    .table-card{background:var(--surface);border:1px solid var(--line);border-radius:12px;overflow:hidden;margin-top:12px}.table-title{padding:18px 20px;border-bottom:1px solid var(--line);font-weight:600}
    .scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;min-width:620px;font-size:14px}th{background:var(--soft);color:var(--muted);font-size:11px;letter-spacing:.08em;text-align:left;text-transform:uppercase}th,td{padding:12px 16px;border-bottom:1px solid var(--line)}tr:last-child td{border-bottom:0}.number{text-align:right;font-variant-numeric:tabular-nums}.empty{padding:24px;color:var(--muted);font-size:14px}
    footer{border-top:1px solid var(--line);margin-top:48px;padding-top:18px;color:var(--muted);font-size:12px}
    @media(max-width:680px){main{padding-top:28px}.metrics{grid-template-columns:1fr}.card{padding:17px}h2{margin-top:32px}}
  </style>
</head>
<body>
<main>
  <div class="brand">OpenSEO report</div>
  <h1>${escapeHtml(report.project.name)}</h1>
  <p class="meta">${escapeHtml(report.project.domain ?? "Project report")} · ${report.windowDays}-day period · ${formatDate(report.period.currentStart)} to ${formatDate(report.period.currentEnd)}</p>

  <h2>AI visibility</h2>
  <div class="metrics">
    ${metric("Visibility", visibility, report.visibility.primaryBrandName ? `${report.visibility.mentionedAnswers} of ${report.visibility.successfulAnswers} successful answers mention ${escapeHtml(report.visibility.primaryBrandName)}.` : "Primary brand required.")}
    ${metric("Answer coverage", coverage, `${report.visibility.successfulAnswers} successful of ${report.visibility.expectedAnswers} expected.`)}
    ${metric("Period change", report.visibility.deltaPctPoints == null ? "Not available" : `${signed(report.visibility.deltaPctPoints)} pp`, escapeHtml(report.visibility.comparisonMessage))}
  </div>

  <h2>Citation intelligence</h2>
  <div class="metrics">
    ${metric("Citations / answer", formatNumber(report.citations.avgCitationsPerAnswer), `${report.citations.citations.toLocaleString()} sanitized citations.`)}
    ${metric("Answers with citations", citationRate, `${report.citations.citedAnswers.toLocaleString()} cited answers.`)}
    ${metric("Unique sources", report.citations.uniqueDomains.toLocaleString(), `${report.citations.uniqueUrls.toLocaleString()} unique URLs.`)}
  </div>

  <section class="table-card">
    <div class="table-title">Top cited domains</div>
    ${
      domains
        ? `<div class="scroll"><table><thead><tr><th>Domain</th><th>Type</th><th class="number">Citations</th><th class="number">Answers</th></tr></thead><tbody>${domains}</tbody></table></div>`
        : `<div class="empty">No safe cited domains in this period.</div>`
    }
  </section>

  <section class="table-card">
    <div class="table-title">Competitor-source gaps</div>
    ${
      gaps
        ? `<div class="scroll"><table><thead><tr><th>Domain</th><th>Tracked competitors</th><th class="number">Answers</th><th class="number">Citations</th></tr></thead><tbody>${gaps}</tbody></table></div>`
        : `<div class="empty">No competitor-source gaps in this period.</div>`
    }
  </section>
  <p class="note">${escapeHtml(report.citations.gapScopeNote)} A citation and brand mention prove answer-level co-occurrence, not support for a specific statement.</p>
  <p class="note">${escapeHtml(report.citations.classificationNote)} Labels are domain-level defaults, not verified page facts.</p>
  <footer>Generated ${formatDateTime(report.generatedAt)} from stored OpenSEO runs. This read-only report does not refresh providers or start new work.</footer>
</main>
</body>
</html>`;
}

function metric(label: string, value: string, detail: string) {
  return `<section class="card"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div><div class="detail">${detail}</div></section>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatPercent(value: number | null) {
  return value == null ? "—" : `${formatNumber(value)}%`;
}

function formatNumber(value: number | null) {
  return value == null
    ? "—"
    : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function signed(value: number) {
  return `${value > 0 ? "+" : ""}${formatNumber(value)}`;
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
}
