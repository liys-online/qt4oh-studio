import { NextRequest, NextResponse } from "next/server";
import { getSession, deleteSession } from "@/lib/store";
import { stopSession } from "@/lib/test-runner";

/** GET /api/tests/[id] - 获取单个会话详情 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = getSession(id);
  if (!session) return NextResponse.json({ error: "会话不存在" }, { status: 404 });
  return NextResponse.json({ session });
}

/**
 * DELETE /api/tests/[id]
 * - ?action=delete  → 从历史记录中删除（仅限非运行中会话）
 * - 默认            → 停止运行中的会话
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const action = req.nextUrl.searchParams.get("action");

  if (action === "delete") {
    const session = getSession(id);
    if (!session) return NextResponse.json({ error: "会话不存在" }, { status: 404 });
    if (session.status === "running") {
      return NextResponse.json({ error: "运行中的会话不能删除" }, { status: 400 });
    }
    deleteSession(id);
    return NextResponse.json({ ok: true });
  }

  stopSession(id);
  return NextResponse.json({ message: "已发送停止信号" });
}
