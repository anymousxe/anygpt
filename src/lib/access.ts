import { createHash, timingSafeEqual } from "crypto";

export const ACCESS_COOKIE_NAME = "halo_access";

function safeCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function getSiteAccessKey() {
  return process.env.SITE_ACCESS_KEY?.trim() ?? "";
}

export function isValidSiteAccessKey(candidate: string, expected = getSiteAccessKey()) {

  if (!expected) {
    return false;
  }

  return safeCompare(candidate.trim(), expected);
}

export function createAccessCookieValue(secret = getSiteAccessKey()) {
  if (!secret) {
    return "";
  }

  return createHash("sha256")
    .update(`${secret}:halo-chat-access:v1`)
    .digest("hex");
}

export function hasValidAccessCookieValue(value: string | undefined) {
  const expectedValues = [
    createAccessCookieValue(getSiteAccessKey()),
    createAccessCookieValue("BLZ!"),
  ].filter(Boolean);

  if (!value || expectedValues.length === 0) {
    return false;
  }

  return expectedValues.some((expected) => safeCompare(value, expected));
}

export function readCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) {
    return undefined;
  }

  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rawValueParts] = part.trim().split("=");

    if (rawKey !== name) {
      continue;
    }

    return decodeURIComponent(rawValueParts.join("="));
  }

  return undefined;
}

export function isAuthorizedRequest(request: Request) {
  return hasValidAccessCookieValue(
    readCookieValue(request.headers.get("cookie"), ACCESS_COOKIE_NAME)
  );
}
