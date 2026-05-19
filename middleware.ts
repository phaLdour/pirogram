import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const PROTECTED = ["/", "/settings"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED.some(
    (p) => pathname === p || (p !== "/" && pathname.startsWith(p + "/")),
  );
  if (!isProtected) return NextResponse.next();

  if (!req.auth) {
    const signInUrl = new URL("/signin", req.nextUrl);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|signin).*)"],
};
