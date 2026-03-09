import { NextRequest, NextResponse } from "next/server";
import * as path from "path";
import { startTestSession } from "@/lib/test-runner";
import { loadSessionsSummary, deleteAllSessions } from "@/lib/store";
import { UPLOAD_DIR } from "@/lib/paths";
import { getSession } from "@/lib/auth";

/** GET /api/tests - 获取测试会话列表（轻量化：不含大字段，不含已完成会话的 results） */
export async function GET() {
  const auth = await getSession();
  const sessions = await loadSessionsSummary(
    auth?.userId,
    auth?.role,
  );
  // 有 summary 的会话（已完成/已停止），默认不返回 results
  // 但如果有结果正在重跑（running/pending），依然返回精简 results，供前端检测重跑状态
  const lean = sessions.map((s) => {
    const hasActiveRerun = s.results.some(
      (r) => r.status === "running" || r.status === "pending"
    );
    return {
      ...s,
      results:
        !s.summary || hasActiveRerun
          ? s.results.map((r) => ({ id: r.id, status: r.status }))
          : [],
    };
  });
  return NextResponse.json({ sessions: lean });
}

/**
 * DELETE /api/tests
 * 批量删除所有非运行中的会话
 */
export async function DELETE() {
  const count = await deleteAllSessions();
  return NextResponse.json({ ok: true, deleted: count });
}

/** POST /api/tests - 创建并启动新的测试会话 */
export async function POST(req: NextRequest) {
  try {
    const auth = await getSession();
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
      disableIgnoreList,
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
      timeout,
      skipInstall,
      disableIgnoreList,
      userId: auth?.userId,
    });

    return NextResponse.json({ sessionId });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
