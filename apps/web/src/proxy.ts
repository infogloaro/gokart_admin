// Next 16 request proxy (formerly middleware). Only a convenience redirect:
// the API checks the session on every request.
import { NextResponse, type NextRequest } from "next/server"

export function proxy(req: NextRequest) {
  const signedIn = req.cookies.has("gk_session")
  const { pathname } = req.nextUrl
  if (pathname === "/")
    return NextResponse.redirect(new URL(signedIn ? "/workspace" : "/login", req.url))
  if (!signedIn) return NextResponse.redirect(new URL("/login", req.url))
  return NextResponse.next()
}

export const config = { matcher: ["/", "/workspace", "/super/:path*", "/admin/:path*"] }
