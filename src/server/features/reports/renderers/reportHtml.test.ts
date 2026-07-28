import { describe, expect, it } from "vitest";
import { makePublicReport } from "../testFixtures";
import { renderPublicReportHtml } from "./reportHtml";

describe("public report HTML", () => {
  it("escapes project content and includes no scripts or external resources", () => {
    const html = renderPublicReportHtml(
      makePublicReport({
        project: {
          name: `Acme <script>alert("x")</script>`,
          domain: "acme.example",
        },
      }),
    );

    expect(html).toContain("Acme &lt;script&gt;");
    expect(html).not.toContain("<script");
    expect(html).not.toMatch(/src=|https?:\/\//);
    expect(html).toContain("AI visibility");
    expect(html).toContain("Citation intelligence");
  });
});
