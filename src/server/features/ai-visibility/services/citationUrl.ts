import { getDomain } from "tldts";
import { safeHostname, safeHttpUrl } from "@/server/features/ai-search/safeUrl";

export const MAX_CITATION_URL_LENGTH = 2_048;

export type CitationSourceKey = {
  url: string;
  hostname: string;
  domain: string;
};

export function sanitizeCitationUrl(
  value: string | null | undefined,
): string | null {
  const url = safeHttpUrl(value);
  return url && url.length <= MAX_CITATION_URL_LENGTH ? url : null;
}

export function deriveCitationSourceKey(
  value: string | null | undefined,
): CitationSourceKey | null {
  const url = sanitizeCitationUrl(value);
  if (!url) return null;
  const hostname = safeHostname(url)?.toLowerCase() ?? null;
  if (!hostname) return null;
  const domain =
    getDomain(hostname, { allowPrivateDomains: true })?.toLowerCase() ??
    hostname;
  return { url, hostname, domain };
}

export function deriveBrandDomainKey(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const candidate = /^[a-z][a-z\d+.-]*:/iu.test(value)
    ? value
    : `https://${value}`;
  return deriveCitationSourceKey(candidate)?.domain ?? null;
}
