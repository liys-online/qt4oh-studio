import { NextResponse } from "next/server";
import { getDb, ensureMigrated } from "@/lib/db";
import { getSession } from "@/lib/auth";
import bcrypt from "bcryptjs";

/** PATCH /api/auth/password — 修改密码 */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  let body: { currentPassword?: string; newPassword?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const { currentPassword = "", newPassword = "" } = body;
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "请填写当前密码和新密码" }, { status: 400 });
  }
  if (newPassword.length < 6) {
    return NextResponse.json({ error: "新密码至少 6 位" }, { status: 400 });
  }

  try {
    await ensureMigrated();
    const db = getDb();
    const user = await db("users").where({ id: session.userId }).first();
    if (!user) return NextResponse.json({ error: "用户不存在" }, { status: 404 });

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) return NextResponse.json({ error: "当前密码错误" }, { status: 400 });

    const hash = await bcrypt.hash(newPassword, 10);
    await db("users").where({ id: session.userId }).update({ password_hash: hash });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
