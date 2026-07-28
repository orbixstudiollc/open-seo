import { describe, expect, it } from "vitest";
import {
  deriveBrandDomainKey,
  deriveCitationSourceKey,
  MAX_CITATION_URL_LENGTH,
  sanitizeCitationUrl,
} from "./citationUrl";

describe("citation URL sanitisation", () => {
  it("keeps safe URLs through the exact storage boundary and rejects overflow", () => {
    const prefix = "https://example.com/";
    const exact = prefix + "a".repeat(MAX_CITATION_URL_LENGTH - prefix.length);
    const over = `${exact}a`;

    expect(exact).toHaveLength(MAX_CITATION_URL_LENGTH);
    expect(sanitizeCitationUrl(exact)).toBe(exact);
    expect(sanitizeCitationUrl(over)).toBeNull();
  });

  it.each([
    "",
    "not a url",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "ftp://example.com/file",
    "https://user@example.com/path",
    "https://user:password@example.com/path",
    "https://\u0000.example.com",
    "https://\uD800.example.com",
  ])("rejects malformed or unsafe input %j", (value) => {
    expect(deriveCitationSourceKey(value)).toBeNull();
  });

  it("normalizes Unicode hosts for keys without rewriting the observation URL", () => {
    const url = "https://例え.テスト/資料";
    expect(deriveCitationSourceKey(url)).toEqual({
      url,
      hostname: "xn--r8jz45g.xn--zckzah",
      domain: "xn--r8jz45g.xn--zckzah",
    });
  });

  it.each([
    [
      "https://news.example.com/path?q=one#first",
      {
        hostname: "news.example.com",
        domain: "example.com",
      },
    ],
    [
      "https://project.github.io/guide",
      {
        hostname: "project.github.io",
        domain: "project.github.io",
      },
    ],
    [
      "http://127.0.0.1:8787/local",
      {
        hostname: "127.0.0.1",
        domain: "127.0.0.1",
      },
    ],
    [
      "http://localhost:3000/local",
      {
        hostname: "localhost",
        domain: "localhost",
      },
    ],
  ])("derives a stable domain key for %s", (url, expected) => {
    expect(deriveCitationSourceKey(url)).toMatchObject(expected);
  });

  it("preserves query and fragment variants as distinct URL observations", () => {
    const first = deriveCitationSourceKey(
      "https://example.com/guide?q=one#first",
    );
    const second = deriveCitationSourceKey(
      "https://example.com/guide?q=two#second",
    );

    expect(first?.url).not.toBe(second?.url);
    expect(first?.domain).toBe(second?.domain);
  });

  it("accepts either a hostname or URL when deriving tracked-brand domains", () => {
    expect(deriveBrandDomainKey("www.example.com")).toBe("example.com");
    expect(deriveBrandDomainKey("https://shop.example.com/about")).toBe(
      "example.com",
    );
    expect(deriveBrandDomainKey("javascript:alert(1)")).toBeNull();
  });
});
