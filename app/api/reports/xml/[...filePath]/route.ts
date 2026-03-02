import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureMigrated } from "@/lib/db";
import { parseXmlReport } from "@/lib/xml-report";

/**
 * GET /api/reports/xml/[sessionId]/[resultId]
 * 返回解析后的 XML 报告数据（parsed JSON）
 * 查询参数 ?raw=1 返回原始 XML 文本
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ filePath: string[] }> }
) {
  const { filePath: segments } = await params;
  if (!segments || segments.length < 2) {
    return NextResponse.json({ error: "路径不合法，需要 /xml/[sessionId]/[resultId]" }, { status: 400 });
  }

  const [sessionId, resultId] = segments;

  await ensureMigrated();
  const db = getDb();

  const row = await db("test_results")
    .where("id", resultId)
    .where("session_id", sessionId)
    .select("report_content")
    .first();

  if (!row || !row.report_content) {
    return NextResponse.json({ error: "XML 报告不存在" }, { status: 404 });
  }

  const xml = row.report_content as string;

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
