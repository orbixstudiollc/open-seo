import { beforeEach, describe, expect, it, vi } from "vitest";
import type { sendLoopsTransactionalEmail } from "@/server/email/loops";
import { makePublicReport } from "../testFixtures";

type SendLoopsTransactionalEmail = typeof sendLoopsTransactionalEmail;

const send = vi.hoisted(() => vi.fn<SendLoopsTransactionalEmail>());
vi.mock("@/server/email/loops", () => ({
  sendLoopsTransactionalEmail: send,
}));

import { sendReportDigestEmail } from "./reportDigestEmail";

describe("report digest email", () => {
  beforeEach(() => send.mockReset().mockResolvedValue(undefined));

  it("sends the bounded report variables through the dedicated template", async () => {
    await sendReportDigestEmail({
      env: {
        LOOPS_API_KEY: "secret",
        LOOPS_TRANSACTIONAL_REPORT_DIGEST_ID: "report-template",
      },
      email: "owner@example.com",
      report: makePublicReport(),
      reportUrl: `https://reports.example/share/${"A".repeat(43)}`,
    });

    const call = send.mock.calls[0]?.[0];
    expect(call).toEqual({
      apiKey: "secret",
      email: "owner@example.com",
      transactionalId: "report-template",
      redactErrorDetails: true,
      dataVariables: {
        projectName: "Acme Search",
        projectDomain: "acme.example",
        reportPeriod: "30 days",
        visibility: "62.5%",
        visibilityChange: "+4.2 pp",
        answerCoverage: "95.2%",
        citationsPerAnswer: "1.8",
        citedAnswerRate: "75%",
        reportUrl: `https://reports.example/share/${"A".repeat(43)}`,
      },
    });
  });
});
