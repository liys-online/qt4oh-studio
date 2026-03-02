import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureMigrated } from "@/lib/db";
import type { CrashLog } from "@/lib/store";

/** GET /api/reports/crash/[filename] - 从数据库查找崩溃日志内容 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  // 防止路径穿越
  if (filename.includes("/") || filename.includes("\\") || filename.startsWith(".")) {
    return NextResponse.json({ error: "非法文件名" }, { status: 400 });
  }

  await ensureMigrated();
  const db = getDb();

  // 扫描所有包含崩溃日志的结果行，按 name 匹配
  const rows = await db("test_results").whereNotNull("crash_logs").select("crash_logs");
  for (const row of rows) {
    const logs = JSON.parse(row.crash_logs as string) as CrashLog[];
    const found = logs.find((l) => l.name === filename);
    if (found) {
      return NextResponse.json({ filename: found.name, content: found.content });
    }
  }

  return NextResponse.json({ error: "崩溃日志不存在" }, { status: 404 });
}
