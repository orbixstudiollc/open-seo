import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { makePublicReport } from "../testFixtures";
import { renderReportPdf, reportPdfFilename } from "./reportPdf";

describe("report PDF renderer", () => {
  it("creates a parseable, paginated PDF with document metadata", async () => {
    const report = makePublicReport({
      citations: {
        ...makePublicReport().citations,
        topDomains: Array.from({ length: 10 }, (_, index) => ({
          domain: `source-${index}.example.com`,
          domainType: "editorial" as const,
          classificationMethod: "curated_rule" as const,
          citations: 20 - index,
          citingAnswers: 10 - Math.floor(index / 2),
        })),
        competitorSourceGaps: Array.from({ length: 10 }, (_, index) => ({
          domain: `gap-${index}.example.com`,
          competitorNames: ["A long competitor name", "Another competitor"],
          competitorMentionedAnswers: 10 - index,
          citationsInCompetitorAnswers: 15 - index,
        })),
      },
    });
    const bytes = await renderReportPdf(report);
    const parsed = await PDFDocument.load(bytes);

    expect(new TextDecoder().decode(bytes.slice(0, 8))).toContain("%PDF-");
    expect(parsed.getPageCount()).toBeGreaterThanOrEqual(2);
    expect(parsed.getTitle()).toBe("Acme Search - OpenSEO report");
    expect(reportPdfFilename(report)).toBe(
      "openseo-acme.example-30d-report.pdf",
    );
  });
});
