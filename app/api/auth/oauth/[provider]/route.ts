import { NextRequest, NextResponse } from "next/server";
import { createOAuthState, buildAuthUrl, OAuthProvider } from "@/lib/oauth";

const VALID: OAuthProvider[] = ["github", "gitcode", "huawei"];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  if (!VALID.includes(provider as OAuthProvider)) {
    return NextResponse.json({ error: "未知的认证提供商" }, { status: 400 });
  }

  // 优先使用环境变量，否则从请求 origin 自动推导（避免重启才生效的问题）
  const appUrl      = process.env.NEXT_PUBLIC_APP_URL?.trim()
    || `${request.nextUrl.protocol}//${request.nextUrl.host}`;
  const callbackUrl = `${appUrl}/api/auth/oauth/${provider}/callback`;
  const state       = await createOAuthState(provider as OAuthProvider);
  const authUrl     = buildAuthUrl(provider as OAuthProvider, state, callbackUrl);

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(`oauth_state_${provider}`, state, {
    httpOnly: true,
    sameSite: "lax",
    path:     "/",
    maxAge:   600, // 10 分钟
  });
  return response;
}
