import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const PROTECTED = ["/", "/settings", "/sprints"];
const REQUEST_ID_HEADER = "x-request-id";

function generateRequestId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default auth((req) => {
  const incoming = req.headers.get(REQUEST_ID_HEADER);
  const requestId = incoming && /^[a-zA-Z0-9._-]{4,128}$/.test(incoming) ? incoming : generateRequestId();

  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED.some(
    (p) => pathname === p || (p !== "/" && pathname.startsWith(p + "/")),
  );

  let response: NextResponse;
  if (isProtected && !req.auth) {
    const signInUrl = new URL("/signin", req.nextUrl);
    signInUrl.searchParams.set("callbackUrl", pathname);
    response = NextResponse.redirect(signInUrl);
  } else {
    const headers = new Headers(req.headers);
    headers.set(REQUEST_ID_HEADER, requestId);
    response = NextResponse.next({ request: { headers } });
  }
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|signin).*)"],
};
