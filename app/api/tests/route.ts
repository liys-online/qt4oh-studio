import { NextRequest, NextResponse } from "next/server";
import * as path from "path";
import { startTestSession } from "@/lib/test-runner";
import { loadSessions, deleteAllSessions } from "@/lib/store";
import { UPLOAD_DIR } from "@/lib/paths";

/** GET /api/tests - 获取所有测试会话列表 */
export async function GET() {
  const sessions = loadSessions();
  return NextResponse.json({ sessions });
}

/**
 * DELETE /api/tests
 * 批量删除所有非运行中的会话
 */
export async function DELETE() {
  const count = deleteAllSessions();
  return NextResponse.json({ ok: true, deleted: count });
}

/** POST /api/tests - 创建并启动新的测试会话 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      fileName,
      hapFilePath: hapFilePathDirect,
      deviceId,
      packageName,
      abilityName,
      filterArch,
      filterModule,
      filterPattern,
      timeout,
      skipInstall,
    } = body;

    // hapFilePath（直接路径，Electron 模式）优先；否则从 UPLOAD_DIR 拼接 fileName
    const hapFilePath = hapFilePathDirect || (fileName ? path.join(UPLOAD_DIR, fileName) : null);
    if (!hapFilePath) return NextResponse.json({ error: "缺少 hapFilePath 或 fileName" }, { status: 400 });
    if (!deviceId) return NextResponse.json({ error: "缺少 deviceId" }, { status: 400 });
    const sessionId = await startTestSession({
      hapFilePath,
      deviceId,
      packageName,
      abilityName,
      filterArch,
      filterModule,
      filterPattern,
      timeout,
      skipInstall,
    });

    return NextResponse.json({ sessionId });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
