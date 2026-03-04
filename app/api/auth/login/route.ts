import { NextResponse } from "next/server";
import { getDb, ensureMigrated } from "@/lib/db";
import { createSession } from "@/lib/auth";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const { username = "", password = "" } = body;
  if (!username || !password) {
    return NextResponse.json({ error: "用户名和密码不能为空" }, { status: 400 });
  }

  try {
    await ensureMigrated();
    const db = getDb();
    const user = await db("users").where({ username }).first();

    if (!user) {
      return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
    }

    await createSession({
      userId:      user.id,
      username:    user.username,
      displayName: user.display_name,
      role:        user.role,
    });

    return NextResponse.json({
      ok: true,
      user: { username: user.username, displayName: user.display_name, role: user.role },
    });
  } catch (e: unknown) {
    const err = e as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
