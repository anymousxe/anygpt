import { NextResponse, type NextRequest } from "next/server";

const ACCESS_COOKIE = "halo_access";
const HEX_RE = /^[0-9a-f]{64}$/;

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const cookieValue = request.cookies.get(ACCESS_COOKIE)?.value ?? "";
  const hasAccess = HEX_RE.test(cookieValue);

  if (pathname.startsWith("/unlock") || pathname.startsWith("/api/unlock")) {
    if (hasAccess && pathname === "/unlock") {
      return NextResponse.redirect(new URL("/", request.url));
    }

    return NextResponse.next();
  }

  if (hasAccess) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.redirect(new URL("/unlock", request.url));
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
