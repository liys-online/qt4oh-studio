import { NextResponse } from "next/server";
import { getDb, ensureMigrated } from "@/lib/db";
import { createSession } from "@/lib/auth";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  let body: { username?: string; password?: string; displayName?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const username    = body.username?.trim() ?? "";
  const password    = body.password ?? "";
  const displayName = body.displayName?.trim() || username;

  if (!username || !password) {
    return NextResponse.json({ error: "用户名和密码不能为空" }, { status: 400 });
  }
  if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
    return NextResponse.json({ error: "用户名只能包含字母、数字和下划线，长度 3-32 位" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "密码至少 6 位" }, { status: 400 });
  }

  try {
    await ensureMigrated();
    const db = getDb();

    const existing = await db("users").where({ username }).first();
    if (existing) {
      return NextResponse.json({ error: "用户名已被占用" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [id] = await db("users").insert({
      username,
      password_hash: passwordHash,
      display_name:  displayName,
      role:          "user",
      created_at:    new Date().toISOString(),
    });

    await createSession({ userId: id, username, displayName, role: "user" });

    return NextResponse.json({
      ok: true,
      user: { username, displayName, role: "user" },
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
