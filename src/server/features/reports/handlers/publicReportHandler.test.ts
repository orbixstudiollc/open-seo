import { PDFDocument } from "pdf-lib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { buildProjectReport } from "../services/ReportService";
import type { resolveReportShare } from "../services/ReportShareService";
import { makePublicReport } from "../testFixtures";

type ResolveReportShare = typeof resolveReportShare;
type BuildProjectReport = typeof buildProjectReport;

const mocks = vi.hoisted(() => ({
  resolve: vi.fn<ResolveReportShare>(),
  build: vi.fn<BuildProjectReport>(),
}));

vi.mock("../services/ReportShareService", () => ({
  resolveReportShare: mocks.resolve,
}));
vi.mock("../services/ReportService", () => ({
  buildProjectReport: mocks.build,
}));

import { handlePublicReportRequest } from "./publicReportHandler";

const token = "A".repeat(43);
const env = { AUTH_MODE: "hosted" };

describe("logged-out public report handler", () => {
  beforeEach(() => {
    mocks.resolve.mockReset();
    mocks.build.mockReset();
    mocks.resolve.mockResolvedValue({
      shareId: "share-a",
      expiresAt: "2026-08-01T00:00:00.000Z",
      windowDays: 30,
      project: {
        id: "project-a",
        name: "Project A",
        domain: "a.example",
      },
    });
    mocks.build.mockResolvedValue(
      makePublicReport({
        project: { name: "Project A", domain: "a.example" },
      }),
    );
  });

  it("renders only the token-bound project without an auth cookie", async () => {
    const response = await handlePublicReportRequest(
      new Request(`https://reports.example/share/${token}`),
      env,
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(response.headers.get("content-security-policy")).toContain(
      "default-src 'none'",
    );
    expect(html).toContain("Project A");
    expect(html).not.toContain(token);
    expect(html).not.toContain("<script");
    const buildInput = mocks.build.mock.calls[0]?.[0];
    expect(buildInput?.project.id).toBe("project-a");
    expect(buildInput?.windowDays).toBe(30);
  });

  it("does not accept project, organization, or period substitutions", async () => {
    for (const query of [
      "projectId=project-b",
      "organizationId=org-b",
      "days=90",
      "reportId=other",
    ]) {
      const response = await handlePublicReportRequest(
        new Request(`https://reports.example/share/${token}?${query}`),
        env,
      );
      expect(response.status).toBe(404);
    }
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it("exports the same logged-out capability as a real PDF", async () => {
    const response = await handlePublicReportRequest(
      new Request(`https://reports.example/share/${token}/report.pdf`),
      env,
    );
    const bytes = await response.arrayBuffer();
    const parsed = await PDFDocument.load(bytes);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(parsed.getTitle()).toBe("Project A - OpenSEO report");
  });

  it("uses one indistinguishable not-found response for invalid capabilities", async () => {
    mocks.resolve.mockResolvedValue(null);
    const unknown = await handlePublicReportRequest(
      new Request(`https://reports.example/share/${"Z".repeat(43)}`),
      env,
    );
    const malformed = await handlePublicReportRequest(
      new Request("https://reports.example/share/short"),
      env,
    );

    expect([unknown.status, await unknown.text()]).toEqual([
      404,
      "Report not found",
    ]);
    expect([malformed.status, await malformed.text()]).toEqual([
      404,
      "Report not found",
    ]);
  });
});
