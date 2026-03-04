/**
 * 认证工具 — JWT Cookie 会话管理
 * 使用 jose (纯 JS) 签发/验证 token，存入 HTTP-only Cookie
 */

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "qt4oh_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 天

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET ?? "qt4oh-studio-default-jwt-secret-2026";
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: number;
  username: string;
  displayName: string;
  role: string;
}

/** 签发 JWT 并写入 Cookie */
export async function createSession(payload: SessionPayload): Promise<void> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

/** 销毁 Cookie（登出） */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** 验证 Cookie 中的 JWT，返回 payload；无效时返回 null */
export async function getSession(): Promise<SessionPayload | null> {
  try {
    const store = await cookies();
    const token = store.get(COOKIE_NAME)?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/** 从 cookie 字符串中解析 JWT（供 middleware 使用）*/
export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}
