import { describe, expect, it } from "vitest";
import {
  createReportBearerToken,
  digestReportBearerToken,
  REPORT_TOKEN_PATTERN,
  sha256Hex,
} from "./reportTokens";

describe("report bearer tokens", () => {
  it("creates distinct 256-bit base64url tokens and stores a SHA-256 digest", async () => {
    const tokens = await Promise.all(
      Array.from({ length: 64 }, () => createReportBearerToken()),
    );

    expect(new Set(tokens.map(({ token }) => token)).size).toBe(64);
    for (const { token, digest } of tokens) {
      expect(token).toMatch(REPORT_TOKEN_PATTERN);
      expect(token).toHaveLength(43);
      expect(digest).toMatch(/^[a-f0-9]{64}$/);
      expect(digest).not.toContain(token);
      await expect(sha256Hex(token)).resolves.toBe(digest);
    }
  });

  it("rejects malformed input before hashing", async () => {
    await expect(digestReportBearerToken("short")).resolves.toBeNull();
    await expect(
      digestReportBearerToken(`${"a".repeat(42)}!`),
    ).resolves.toBeNull();
  });
});
