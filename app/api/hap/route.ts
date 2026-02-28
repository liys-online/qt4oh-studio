import { NextRequest, NextResponse } from "next/server";
import * as path from "path";
import { saveHapFile, parseHap, getModules } from "@/lib/hap-parser";

const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");

/** POST /api/hap - 上传 HAP 文件 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "未提供文件" }, { status: 400 });
    if (!file.name.endsWith(".hap")) {
      return NextResponse.json({ error: "请上传 .hap 文件" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const savePath = await saveHapFile(buffer, file.name, UPLOAD_DIR);

    // 解析测试库列表
    const testLibs = await parseHap(savePath);
    const modules = getModules(testLibs);
    const archs = [...new Set(testLibs.map((t) => t.arch))];

    return NextResponse.json({
      fileName: file.name,
      savePath,
      totalLibs: testLibs.length,
      modules,
      archs,
      testLibs,
    });
  } catch (e: unknown) {
    const err = e as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** GET /api/hap?file=xxx - 解析已上传的 HAP */
export async function GET(req: NextRequest) {
  try {
    const fileName = req.nextUrl.searchParams.get("file");
    if (!fileName) return NextResponse.json({ error: "缺少 file 参数" }, { status: 400 });

    const filePath = path.join(UPLOAD_DIR, fileName);
    const testLibs = await parseHap(filePath);
    const modules = getModules(testLibs);
    const archs = [...new Set(testLibs.map((t) => t.arch))];

    return NextResponse.json({ fileName, totalLibs: testLibs.length, modules, archs, testLibs });
  } catch (e: unknown) {
    const err = e as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
