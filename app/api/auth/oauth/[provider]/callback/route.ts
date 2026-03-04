import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyOAuthState, fetchOAuthUser, OAuthProvider } from "@/lib/oauth";
import { getDb, ensureMigrated } from "@/lib/db";
import { createSession } from "@/lib/auth";

const VALID: OAuthProvider[] = ["github", "gitcode", "huawei"];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;

  // 始终用环境变量或请求 host 构造重定向 URL，避免反向代理场景下跳回 localhost
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL?.trim()
    || `${request.nextUrl.protocol}//${request.nextUrl.host}`;
  const loginUrl = new URL("/login", appUrl);

  if (!VALID.includes(provider as OAuthProvider)) {
    loginUrl.searchParams.set("error", "未知的认证提供商");
    return NextResponse.redirect(loginUrl);
  }

  const { searchParams } = new URL(request.url);
  const code  = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    loginUrl.searchParams.set("error", "OAuth 参数缺失");
    return NextResponse.redirect(loginUrl);
  }

  // 验证 state（防 CSRF）
  const storedState = request.cookies.get(`oauth_state_${provider}`)?.value;
  if (!storedState || storedState !== state) {
    loginUrl.searchParams.set("error", "OAuth state 不匹配，请重试");
    return NextResponse.redirect(loginUrl);
  }
  const stateOk = await verifyOAuthState(state, provider as OAuthProvider);
  if (!stateOk) {
    loginUrl.searchParams.set("error", "OAuth state 已过期，请重试");
    return NextResponse.redirect(loginUrl);
  }

  try {
    const callbackUrl = `${appUrl}/api/auth/oauth/${provider}/callback`;
    const oauthUser   = await fetchOAuthUser(provider as OAuthProvider, code, callbackUrl);

    await ensureMigrated();
    const db = getDb();

    // 查找已绑定的 OAuth 账号
    const account = await db("oauth_accounts")
      .where({ provider, provider_user_id: oauthUser.id })
      .first();

    let userId: number;

    if (account) {
      userId = account.user_id;
      // 同步最新昵称/头像
      await db("oauth_accounts")
        .where({ id: account.id })
        .update({
          display_name: oauthUser.displayName,
          avatar_url:   oauthUser.avatarUrl ?? null,
        });
    } else {
      // 首次登录：创建用户
      // 若 username 已存在则加随机后缀
      let username = oauthUser.username;
      const collision = await db("users").where({ username }).first();
      if (collision) username = `${username}_${Math.random().toString(36).slice(2, 7)}`;

      const [newId] = await db("users").insert({
        username,
        password_hash: "$oauth$", // 占位符，不可用密码登录
        display_name:  oauthUser.displayName,
        role:          "user",
        created_at:    new Date().toISOString(),
      });
      userId = newId as number;

      await db("oauth_accounts").insert({
        user_id:          userId,
        provider,
        provider_user_id: oauthUser.id,
        username:         oauthUser.username,
        display_name:     oauthUser.displayName,
        avatar_url:       oauthUser.avatarUrl ?? null,
        created_at:       new Date().toISOString(),
      });
    }

    const user = await db("users").where({ id: userId }).first();
    await createSession({
      userId:      user.id,
      username:    user.username,
      displayName: user.display_name,
      role:        user.role,
    });

    // 统一用 next/headers cookies() 删除 state cookie，与 createSession 保持一致
    const store = await cookies();
    store.delete(`oauth_state_${provider}`);
    return NextResponse.redirect(new URL("/", appUrl));
  } catch (e: unknown) {
    loginUrl.searchParams.set("error", (e as Error).message);
    return NextResponse.redirect(loginUrl);
  }
}
