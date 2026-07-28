const REPORT_TOKEN_BYTES = 32;
export const REPORT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function createReportBearerToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(REPORT_TOKEN_BYTES));
  const token = bytesToBase64Url(bytes);
  return {
    token,
    digest: await sha256Hex(token),
  };
}

export async function digestReportBearerToken(token: string) {
  return REPORT_TOKEN_PATTERN.test(token) ? sha256Hex(token) : null;
}
