import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "qt4oh_session";
const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/oauth",  // 所有 /api/auth/oauth/* 均公开
];

function getSecret() {
  const raw = process.env.JWT_SECRET ?? "qt4oh-studio-default-jwt-secret-2026";
  return new TextEncoder().encode(raw);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths through unconditionally
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static assets / Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (token) {
    try {
      await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
      return NextResponse.next();
    } catch {
      // Invalid / expired token — fall through to redirect
    }
  }

  // API routes: return 401 instead of redirecting
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // 只对页面/API 生效，跳过 Next.js 内部资源和所有带扩展名的静态文件（svg/png/jpg/ico/…）
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};
