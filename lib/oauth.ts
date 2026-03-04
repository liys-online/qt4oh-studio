/**
 * 第三方 OAuth 2.0 工具库
 * 支持 GitHub / Gitcode / 华为账号
 *
 * 环境变量（在 .env.local 中配置）：
 *   NEXT_PUBLIC_APP_URL=http://localhost:3000
 *   GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET
 *   GITCODE_CLIENT_ID / GITCODE_CLIENT_SECRET
 *   HUAWEI_CLIENT_ID / HUAWEI_CLIENT_SECRET
 */

import { SignJWT, jwtVerify } from "jose";
import { fetch as undiciFetch, ProxyAgent } from "undici";

export type OAuthProvider = "github" | "gitcode" | "huawei";

/**
 * 支持 HTTPS_PROXY / HTTP_PROXY 环境变量的 fetch 封装。
 * 服务器无法直连目标（如国内服务器访问 GitHub）时，通过代理转发。
 */
function proxyFetch(url: string, init?: RequestInit): Promise<Response> {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;
  if (proxyUrl) {
    const dispatcher = new ProxyAgent(proxyUrl);
    // undici fetch 签名与全局 fetch 兼容
    return undiciFetch(url, { ...(init as object), dispatcher }) as unknown as Promise<Response>;
  }
  return fetch(url, init);
}

export interface OAuthUser {
  id:           string;   // Provider 侧 user ID
  username:     string;   // 用于数据库 username 字段
  displayName:  string;
  avatarUrl?:   string;
}

function getSecret() {
  return new TextEncoder().encode(
    process.env.JWT_SECRET ?? "qt4oh-studio-default-jwt-secret-2026"
  );
}

// ── State JWT（防 CSRF）──────────────────────────────────────────────────────
export async function createOAuthState(provider: OAuthProvider): Promise<string> {
  return new SignJWT({ provider })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(getSecret());
}

export async function verifyOAuthState(
  token: string,
  expectedProvider: OAuthProvider
): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload.provider === expectedProvider;
  } catch {
    return false;
  }
}

// ── 构造授权 URL ──────────────────────────────────────────────────────────────
export function buildAuthUrl(
  provider: OAuthProvider,
  state: string,
  callbackUrl: string
): string {
  const p = new URLSearchParams();
  switch (provider) {
    case "github":
      p.set("client_id",    process.env.GITHUB_CLIENT_ID ?? "");
      p.set("redirect_uri", callbackUrl);
      p.set("scope",        "read:user user:email");
      p.set("state",        state);
      return `https://github.com/login/oauth/authorize?${p}`;

    case "gitcode":
      p.set("client_id",     process.env.GITCODE_CLIENT_ID ?? "");
      p.set("redirect_uri",  callbackUrl);
      p.set("response_type", "code");
      p.set("scope",         "read_user");
      p.set("state",         state);
      return `https://gitcode.com/oauth/authorize?${p}`;

    case "huawei":
      p.set("client_id",     process.env.HUAWEI_CLIENT_ID ?? "");
      p.set("redirect_uri",  callbackUrl);
      p.set("response_type", "code");
      p.set("scope",         "openid profile");
      p.set("state",         state);
      p.set("access_type",   "offline");
      return `https://oauth-login.cloud.huawei.com/oauth2/v3/authorize?${p}`;
  }
}

// ── 授权码换取用户信息 ─────────────────────────────────────────────────────────
export async function fetchOAuthUser(
  provider: OAuthProvider,
  code: string,
  callbackUrl: string
): Promise<OAuthUser> {
  switch (provider) {
    case "github":   return fetchGitHubUser(code, callbackUrl);
    case "gitcode":  return fetchGitcodeUser(code, callbackUrl);
    case "huawei":   return fetchHuaweiUser(code, callbackUrl);
  }
}

// ── GitHub ────────────────────────────────────────────────────────────────────
async function fetchGitHubUser(code: string, callbackUrl: string): Promise<OAuthUser> {
  const tokenRes = await proxyFetch("https://github.com/login/oauth/access_token", {
    method:  "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    cache:   "no-store",
    body:    JSON.stringify({
      client_id:     process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri:  callbackUrl,
    }),
  }).catch((err: unknown) => {
    throw new Error(`连接 GitHub 失败: ${(err as Error).message}`, { cause: err });
  });
  const token = await tokenRes.json() as { access_token?: string; error?: string; error_description?: string };
  if (!token.access_token) throw new Error(token.error_description ?? token.error ?? "GitHub token 获取失败");

  const userRes = await proxyFetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      Accept:        "application/vnd.github+json",
      "User-Agent":  "Qt4OH-Studio",
    },
  });
  const u = await userRes.json() as { id: number; login: string; name?: string | null; avatar_url?: string };
  return {
    id:          String(u.id),
    username:    `gh_${u.login}`,
    displayName: u.name || u.login,
    avatarUrl:   u.avatar_url,
  };
}

// ── Gitcode ───────────────────────────────────────────────────────────────────
async function fetchGitcodeUser(code: string, callbackUrl: string): Promise<OAuthUser> {
  console.log("[Gitcode OAuth] token exchange, redirect_uri =", callbackUrl);
  const tokenRes = await proxyFetch("https://gitcode.com/oauth/token", {
    method:  "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    cache:   "no-store",
    body:    new URLSearchParams({
      client_id:     process.env.GITCODE_CLIENT_ID ?? "",
      client_secret: process.env.GITCODE_CLIENT_SECRET ?? "",
      code,
      grant_type:    "authorization_code",
      redirect_uri:  callbackUrl,
    }).toString(),
  }).catch((err: unknown) => {
    throw new Error(`连接 Gitcode 失败: ${(err as Error).message}`, { cause: err });
  });
  const rawText = await tokenRes.text();
  console.log("[Gitcode OAuth] token response status:", tokenRes.status, "body:", rawText);
  let token: { access_token?: string; error?: string; error_description?: string };
  try { token = JSON.parse(rawText); } catch { throw new Error(`Gitcode token 响应非 JSON: ${rawText}`); }
  if (!token.access_token) throw new Error(token.error_description ?? token.error ?? "Gitcode token 获取失败");

  const userRes = await proxyFetch(
    `https://gitcode.com/api/v5/user?access_token=${token.access_token}`,
    {
      headers: {
        Accept:              "application/json",
        Authorization:       `Bearer ${token.access_token}`,
        "X-Requested-With":  "XMLHttpRequest",
        "User-Agent":        "Qt4OH-Studio/1.0",
      },
      redirect: "manual",
    }
  );
  const userText = await userRes.text();
  const ct = userRes.headers.get("content-type") ?? "";
  console.log("[Gitcode OAuth] user response status:", userRes.status, "content-type:", ct, "body:", userText.slice(0, 300));
  if (userRes.status >= 300 && userRes.status < 400) {
    throw new Error(`Gitcode 用户接口被重定向 (${userRes.status})，token 可能已过期或无效`);
  }
  if (!ct.includes("json")) {
    throw new Error(`Gitcode 用户接口返回非 JSON (status=${userRes.status}, ct=${ct}): ${userText.slice(0, 100)}`);
  }
  let u: { id: string; login: string; name?: string; avatar_url?: string };
  try { u = JSON.parse(userText); } catch { throw new Error(`Gitcode 用户信息响应非 JSON: ${userText.slice(0, 200)}`); }
  return {
    id:          u.id,
    username:    `gc_${u.login}`,
    displayName: u.name || u.login,
    avatarUrl:   u.avatar_url,
  };
}

// ── 华为账号 ──────────────────────────────────────────────────────────────────
async function fetchHuaweiUser(code: string, callbackUrl: string): Promise<OAuthUser> {
  console.log("[Huawei OAuth] token exchange, redirect_uri =", callbackUrl);
  const tokenRes = await fetch("https://oauth-login.cloud.huawei.com/oauth2/v3/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    new URLSearchParams({
      grant_type:    "authorization_code",
      code,
      client_id:     process.env.HUAWEI_CLIENT_ID ?? "",
      client_secret: process.env.HUAWEI_CLIENT_SECRET ?? "",
      redirect_uri:  callbackUrl,
    }),
  });
  const token = await tokenRes.json() as { access_token?: string; error?: number; error_description?: string };
  if (!token.access_token) {
    console.error("[Huawei OAuth] token error:", JSON.stringify(token));
    throw new Error(token.error_description ?? `华为 token 获取失败 (error=${token.error})`);
  }

  const infoRes = await fetch(
    `https://account.cloud.huawei.com/rest.php?nsp_svc=GOpen.User.getInfo&nsp_ts=${Date.now()}`,
    { headers: { Authorization: `Bearer ${token.access_token}` } }
  );
  const info = await infoRes.json() as {
    userID?: string; displayName?: string; headPictureURL?: string; error?: string;
  };
  if (info.error) throw new Error(`华为用户信息获取失败: ${info.error}`);

  return {
    id:          info.userID ?? "",
    username:    `hw_${(info.userID ?? "").slice(0, 12)}`,
    displayName: info.displayName ?? "华为用户",
    avatarUrl:   info.headPictureURL,
  };
}
