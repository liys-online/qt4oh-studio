import { NextRequest, NextResponse } from "next/server";
import { getSession, deleteSession } from "@/lib/store";
import { stopSession, rerunSingleTest } from "@/lib/test-runner";

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
 * PATCH /api/tests/[id]
 * Body: { resultId, hapFilePath?, deviceId?, timeout?, skipInstall? }
 * 重新执行会话中指定的单条测试结果
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await req.json();
    const { resultId, hapFilePath, deviceId, timeout, skipInstall } = body as {
      resultId: string;
      hapFilePath?: string;
      deviceId?: string;
      timeout?: number;
      skipInstall?: boolean;
    };
    if (!resultId) return NextResponse.json({ error: "缺少 resultId" }, { status: 400 });
    await rerunSingleTest(id, resultId, { hapFilePath, deviceId, timeout, skipInstall });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
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
