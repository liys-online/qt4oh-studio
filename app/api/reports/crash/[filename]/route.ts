import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { FAULTLOG_DIR } from "@/lib/paths";

/** GET /api/reports/crash/[filename] - 获取崩溃日志文件内容 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  // 防止路径穿越
  const safe = path.basename(filename);
  const filePath = path.join(FAULTLOG_DIR, safe);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }

  const content = fs.readFileSync(filePath, "utf-8");
  return NextResponse.json({ filename: safe, content });
}
