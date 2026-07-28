import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { PublicReport } from "@/types/schemas/reports";
import {
  ascii,
  formatReportDate,
  formatReportNumber,
  formatReportPercent,
  formatSignedReportNumber,
  titleCaseReportValue,
} from "./reportPdfFormat";

export { reportPdfFilename } from "./reportPdfFormat";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const INK = rgb(38 / 255, 37 / 255, 30 / 255);
const BODY = rgb(90 / 255, 88 / 255, 82 / 255);
const MUTED = rgb(128 / 255, 125 / 255, 114 / 255);
const HAIRLINE = rgb(230 / 255, 229 / 255, 224 / 255);
const CANVAS = rgb(247 / 255, 247 / 255, 244 / 255);
const ORANGE = rgb(245 / 255, 78 / 255, 0);

type Writer = {
  document: PDFDocument;
  regular: PDFFont;
  bold: PDFFont;
  page: PDFPage;
  y: number;
  pageNumber: number;
};

export async function renderReportPdf(report: PublicReport) {
  const document = await PDFDocument.create();
  document.setTitle(`${report.project.name} - OpenSEO report`);
  document.setAuthor("OpenSEO");
  document.setSubject(
    `${report.windowDays}-day AI visibility and citation intelligence report`,
  );
  document.setCreationDate(new Date(report.generatedAt));
  const writer: Writer = {
    document,
    regular: await document.embedFont(StandardFonts.Helvetica),
    bold: await document.embedFont(StandardFonts.HelveticaBold),
    page: document.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    y: PAGE_HEIGHT - MARGIN,
    pageNumber: 1,
  };

  drawHeader(writer, report);
  sectionHeading(writer, "AI visibility");
  metricRow(writer, [
    ["Visibility", formatReportPercent(report.visibility.visibilityPct)],
    ["Answer coverage", formatReportPercent(report.visibility.coveragePct)],
    [
      "Change",
      report.visibility.deltaPctPoints == null
        ? "Not available"
        : `${formatSignedReportNumber(report.visibility.deltaPctPoints)} pp`,
    ],
  ]);
  paragraph(
    writer,
    report.visibility.primaryBrandName
      ? `${report.visibility.mentionedAnswers} of ${report.visibility.successfulAnswers} successful answers mention ${report.visibility.primaryBrandName}.`
      : "Set a primary brand to calculate visibility.",
  );
  paragraph(writer, report.visibility.comparisonMessage, MUTED, 9);

  if (report.visibility.platforms.length > 0) {
    const headings = ["Platform", "Visibility", "Mentioned", "Successful"];
    tableHeading(writer, headings);
    for (const row of report.visibility.platforms) {
      tableRow(
        writer,
        [
          row.label,
          formatReportPercent(row.visibilityPct),
          row.mentionedAnswers.toLocaleString("en-US"),
          row.successfulAnswers.toLocaleString("en-US"),
        ],
        headings,
      );
    }
    writer.y -= 12;
  } else {
    emptyLine(writer, "No successful platform observations in this period.");
  }

  sectionHeading(writer, "Citation intelligence");
  metricRow(writer, [
    [
      "Citations / answer",
      formatReportNumber(report.citations.avgCitationsPerAnswer),
    ],
    ["Answers cited", formatReportPercent(report.citations.citedAnswerPct)],
    ["Unique domains", report.citations.uniqueDomains.toLocaleString("en-US")],
  ]);
  paragraph(
    writer,
    `${report.citations.citations.toLocaleString("en-US")} sanitized citations across ${report.citations.successfulAnswers.toLocaleString("en-US")} successful answers and ${report.citations.uniqueUrls.toLocaleString("en-US")} unique URLs.`,
  );

  subsectionHeading(writer, "Top cited domains");
  if (report.citations.topDomains.length > 0) {
    const headings = ["Domain", "Type", "Citations", "Answers"];
    tableHeading(writer, headings);
    for (const row of report.citations.topDomains) {
      tableRow(
        writer,
        [
          row.domain,
          titleCaseReportValue(row.domainType),
          row.citations.toLocaleString("en-US"),
          row.citingAnswers.toLocaleString("en-US"),
        ],
        headings,
      );
    }
    writer.y -= 16;
  } else {
    emptyLine(writer, "No safe cited domains in this period.");
  }

  subsectionHeading(writer, "Competitor-source gaps");
  paragraph(writer, report.citations.gapScopeNote, MUTED, 9);
  if (report.citations.competitorSourceGaps.length > 0) {
    const headings = ["Domain", "Tracked competitors", "Answers", "Citations"];
    tableHeading(writer, headings);
    for (const row of report.citations.competitorSourceGaps) {
      tableRow(
        writer,
        [
          row.domain,
          row.competitorNames.join(", "),
          row.competitorMentionedAnswers.toLocaleString("en-US"),
          row.citationsInCompetitorAnswers.toLocaleString("en-US"),
        ],
        headings,
      );
    }
    writer.y -= 16;
  } else {
    emptyLine(writer, "No competitor-source gaps in this period.");
  }

  paragraph(
    writer,
    `${report.citations.classificationNote} Labels are domain-level defaults, not verified page facts.`,
    MUTED,
    8,
  );
  drawFooters(writer);
  return document.save();
}

function drawHeader(writer: Writer, report: PublicReport) {
  writer.page.drawText("OpenSEO", {
    x: MARGIN,
    y: writer.y,
    size: 11,
    font: writer.bold,
    color: ORANGE,
  });
  writer.y -= 34;
  text(writer, report.project.name, 26, writer.regular, INK);
  if (report.project.domain)
    text(writer, report.project.domain, 10, writer.regular, BODY);
  writer.y -= 4;
  text(
    writer,
    `${report.windowDays}-day report | ${formatReportDate(report.period.currentStart)} - ${formatReportDate(report.period.currentEnd)}`,
    10,
    writer.regular,
    MUTED,
  );
  writer.y -= 12;
  rule(writer);
}

function sectionHeading(writer: Writer, label: string) {
  ensureSpace(writer, 48);
  writer.y -= 22;
  text(writer, label, 18, writer.regular, INK);
  writer.y -= 8;
}

function subsectionHeading(writer: Writer, label: string) {
  ensureSpace(writer, 60);
  writer.y -= 24;
  text(writer, label, 12, writer.bold, INK);
  writer.y -= 4;
}

function metricRow(writer: Writer, metrics: Array<[string, string]>) {
  ensureSpace(writer, 72);
  const width = CONTENT_WIDTH / metrics.length;
  writer.page.drawRectangle({
    x: MARGIN,
    y: writer.y - 60,
    width: CONTENT_WIDTH,
    height: 60,
    color: CANVAS,
    borderColor: HAIRLINE,
    borderWidth: 1,
  });
  metrics.forEach(([label, value], index) => {
    const x = MARGIN + index * width + 12;
    writer.page.drawText(ascii(label), {
      x,
      y: writer.y - 18,
      size: 8,
      font: writer.bold,
      color: MUTED,
    });
    writer.page.drawText(ascii(value), {
      x,
      y: writer.y - 43,
      size: 17,
      font: writer.regular,
      color: INK,
    });
    if (index > 0) {
      writer.page.drawLine({
        start: { x: MARGIN + index * width, y: writer.y - 52 },
        end: { x: MARGIN + index * width, y: writer.y - 8 },
        color: HAIRLINE,
        thickness: 1,
      });
    }
  });
  writer.y -= 76;
}

function tableHeading(writer: Writer, cells: string[]) {
  ensureSpace(writer, 42);
  const widths = columnWidths(cells.length);
  writer.page.drawRectangle({
    x: MARGIN,
    y: writer.y - 24,
    width: CONTENT_WIDTH,
    height: 24,
    color: CANVAS,
  });
  drawCells(writer, {
    cells,
    widths,
    font: writer.bold,
    color: MUTED,
    size: 8,
    y: writer.y - 16,
  });
  writer.y -= 24;
}

function tableRow(writer: Writer, cells: string[], headings: string[]) {
  if (ensureSpace(writer, 30)) tableHeading(writer, headings);
  const widths = columnWidths(cells.length);
  const wrapped = cells.map((cell, index) =>
    truncateToWidth(ascii(cell), writer.regular, 8.5, widths[index] - 10),
  );
  drawCells(writer, {
    cells: wrapped,
    widths,
    font: writer.regular,
    color: BODY,
    size: 8.5,
    y: writer.y - 17,
  });
  writer.page.drawLine({
    start: { x: MARGIN, y: writer.y - 25 },
    end: { x: MARGIN + CONTENT_WIDTH, y: writer.y - 25 },
    color: HAIRLINE,
    thickness: 0.6,
  });
  writer.y -= 26;
}

function drawCells(
  writer: Writer,
  input: {
    cells: string[];
    widths: number[];
    font: PDFFont;
    color: ReturnType<typeof rgb>;
    size: number;
    y: number;
  },
) {
  let x = MARGIN;
  input.cells.forEach((cell, index) => {
    writer.page.drawText(cell, {
      x: x + 5,
      y: input.y,
      size: input.size,
      font: input.font,
      color: input.color,
    });
    x += input.widths[index];
  });
}

function columnWidths(count: number) {
  if (count === 4) return [190, 155, 77, 77];
  return Array.from({ length: count }, () => CONTENT_WIDTH / count);
}

function paragraph(writer: Writer, value: string, color = BODY, size = 9.5) {
  const lines = wrap(ascii(value), writer.regular, size, CONTENT_WIDTH);
  ensureSpace(writer, lines.length * 13 + 10);
  for (const line of lines) {
    text(writer, line, size, writer.regular, color);
    writer.y -= 3;
  }
  writer.y -= 7;
}

function emptyLine(writer: Writer, value: string) {
  paragraph(writer, value, MUTED, 9);
}

function text(
  writer: Writer,
  value: string,
  size: number,
  font: PDFFont,
  color: ReturnType<typeof rgb>,
) {
  writer.page.drawText(ascii(value), {
    x: MARGIN,
    y: writer.y,
    size,
    font,
    color,
  });
  writer.y -= size + 5;
}

function rule(writer: Writer) {
  writer.page.drawLine({
    start: { x: MARGIN, y: writer.y },
    end: { x: MARGIN + CONTENT_WIDTH, y: writer.y },
    color: HAIRLINE,
    thickness: 1,
  });
  writer.y -= 4;
}

function ensureSpace(writer: Writer, height: number) {
  if (writer.y - height >= MARGIN + 24) return false;
  writer.page = writer.document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  writer.pageNumber += 1;
  writer.y = PAGE_HEIGHT - MARGIN;
  return true;
}

function drawFooters(writer: Writer) {
  const pages = writer.document.getPages();
  pages.forEach((page, index) => {
    page.drawText(
      `Generated by OpenSEO | Page ${index + 1} of ${pages.length}`,
      {
        x: MARGIN,
        y: 24,
        size: 8,
        font: writer.regular,
        color: MUTED,
      },
    );
  });
}

function wrap(value: string, font: PDFFont, size: number, maxWidth: number) {
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = truncateToWidth(word, font, size, maxWidth);
    }
  }
  if (line) lines.push(line);
  return lines;
}

function truncateToWidth(
  value: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
) {
  if (font.widthOfTextAtSize(value, size) <= maxWidth) return value;
  let output = value;
  while (
    output.length > 1 &&
    font.widthOfTextAtSize(`${output}...`, size) > maxWidth
  ) {
    output = output.slice(0, -1);
  }
  return `${output}...`;
}
