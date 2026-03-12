import { NextResponse } from "next/server";
import { getSession, isElectronMode } from "@/lib/auth";

export async function GET() {
  if (isElectronMode()) {
    return NextResponse.json({ isElectron: true });
  }
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  return NextResponse.json({
    userId:      session.userId,
    username:    session.username,
    displayName: session.displayName,
    role:        session.role,
    isElectron:  false,
  });
}
