import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/store";
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

/** DELETE /api/tests/[id] - 停止运行中的测试会话 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  stopSession(id);
  return NextResponse.json({ message: "已发送停止信号" });
}
