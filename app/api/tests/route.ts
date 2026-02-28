import { NextRequest, NextResponse } from "next/server";
import * as path from "path";
import { startTestSession } from "@/lib/test-runner";
import { loadSessions } from "@/lib/store";

const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");

/** GET /api/tests - 获取所有测试会话列表 */
export async function GET() {
  const sessions = loadSessions();
  return NextResponse.json({ sessions });
}

/** POST /api/tests - 创建并启动新的测试会话 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      fileName,
      deviceId,
      packageName,
      abilityName,
      filterArch,
      filterModule,
      filterPattern,
      timeout,
      skipInstall,
    } = body;

    if (!fileName) return NextResponse.json({ error: "缺少 fileName" }, { status: 400 });
    if (!deviceId) return NextResponse.json({ error: "缺少 deviceId" }, { status: 400 });

    const hapFilePath = path.join(UPLOAD_DIR, fileName);
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
    const err = e as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
