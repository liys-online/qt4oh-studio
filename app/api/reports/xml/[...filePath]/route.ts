import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { parseXmlReport } from "@/lib/xml-report";
import { REPORTS_BASE_DIR } from "@/lib/paths";

/**
 * GET /api/reports/xml/[sessionId]/[...filePath]
 * 返回解析后的 XML 报告数据（parsed JSON）
 * 查询参数 ?raw=1 返回原始 XML 文本
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ filePath: string[] }> }
) {
  const { filePath: segments } = await params;
  if (!segments || segments.length < 2) {
    return NextResponse.json({ error: "路径不合法" }, { status: 400 });
  }

  // 第一段是 sessionId，其余是相对路径
  const [sessionId, ...rest] = segments;
  const relPath = rest.join(path.sep);
  // 防止路径穿越
  const safeRel = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const absPath = path.join(REPORTS_BASE_DIR, sessionId, safeRel);

  if (!absPath.startsWith(REPORTS_BASE_DIR)) {
    return NextResponse.json({ error: "非法路径" }, { status: 403 });
  }

  if (!fs.existsSync(absPath)) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }

  const xml = fs.readFileSync(absPath, "utf-8");

  if (req.nextUrl.searchParams.get("raw") === "1") {
    return new NextResponse(xml, {
      headers: { "Content-Type": "application/xml; charset=utf-8" },
    });
  }

  try {
    const result = parseXmlReport(xml);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
