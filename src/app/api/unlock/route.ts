import { NextResponse } from "next/server";

import { normalizeProfileSlug } from "@/lib/app-state";
import {
  ACCESS_COOKIE_NAME,
  createAccessCookieValue,
  isValidSiteAccessKey,
} from "@/lib/access";

const AIDEN_ACCESS_KEY = "BLZ!";

export async function POST(request: Request) {
  const formData = await request.formData();
  const key = String(formData.get("key") ?? "").trim();
  const profile = normalizeProfileSlug(String(formData.get("profile") ?? "mom"));
  const expectedKey = profile === "aiden" ? AIDEN_ACCESS_KEY : process.env.SITE_ACCESS_KEY;

  if (!expectedKey || !isValidSiteAccessKey(key, expectedKey)) {
    const redirectUrl = new URL("/unlock", request.url);
    redirectUrl.searchParams.set("error", "1");
    redirectUrl.searchParams.set("profile", profile);

    return NextResponse.redirect(redirectUrl, { status: 303 });
  }

  const response = NextResponse.redirect(new URL(`/?profile=${profile}`, request.url), {
    status: 303,
  });

  response.cookies.set({
    name: ACCESS_COOKIE_NAME,
    value: createAccessCookieValue(expectedKey),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}
