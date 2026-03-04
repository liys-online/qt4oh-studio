import { NextResponse } from "next/server";
import { getDb, ensureMigrated } from "@/lib/db";
import { getSession, createSession } from "@/lib/auth";

/** PATCH /api/auth/profile — 修改昵称 */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  let body: { displayName?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const displayName = body.displayName?.trim();
  if (!displayName) {
    return NextResponse.json({ error: "昵称不能为空" }, { status: 400 });
  }

  try {
    await ensureMigrated();
    const db = getDb();
    await db("users").where({ id: session.userId }).update({ display_name: displayName });

    // 刷新 Cookie 中的 JWT
    await createSession({ ...session, displayName });

    return NextResponse.json({ ok: true, displayName });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** GET /api/auth/profile — 获取完整用户信息（含 created_at） */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  try {
    await ensureMigrated();
    const db = getDb();
    const user = await db("users")
      .where({ id: session.userId })
      .select("id", "username", "display_name", "role", "created_at")
      .first();

    if (!user) return NextResponse.json({ error: "用户不存在" }, { status: 404 });

    return NextResponse.json({
      id:          user.id,
      username:    user.username,
      displayName: user.display_name,
      role:        user.role,
      createdAt:   user.created_at,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
