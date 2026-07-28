import { describe, expect, it } from "vitest";
import {
  getReportPublicOrigin,
  getReportSharingPolicy,
  isReportDigestDeliveryConfigured,
} from "./reportSharingPolicy";

describe("report sharing deployment policy", () => {
  it("fails closed in local_noauth until a share-only boundary is declared", () => {
    expect(getReportSharingPolicy({ AUTH_MODE: "local_noauth" })).toMatchObject(
      {
        enabled: false,
      },
    );
    expect(
      getReportSharingPolicy({
        AUTH_MODE: "local_noauth",
        REPORT_PUBLIC_SHARE_MODE: "share_only",
      }),
    ).toEqual({ enabled: true, reason: null });
  });

  it("allows hosted capability checks without the local no-auth declaration", () => {
    expect(getReportSharingPolicy({ AUTH_MODE: "hosted" })).toEqual({
      enabled: true,
      reason: null,
    });
  });

  it("requires a safe canonical origin and both Loops values for digests", () => {
    const env = {
      AUTH_MODE: "hosted",
      BETTER_AUTH_URL: "https://app.example.com/path",
      LOOPS_API_KEY: "secret",
      LOOPS_TRANSACTIONAL_REPORT_DIGEST_ID: "template",
    };
    expect(getReportPublicOrigin(env)).toBe("https://app.example.com");
    expect(isReportDigestDeliveryConfigured(env)).toBe(true);
    expect(
      isReportDigestDeliveryConfigured({
        ...env,
        REPORT_PUBLIC_ORIGIN: "http://public.example.com",
      }),
    ).toBe(false);
  });
});
