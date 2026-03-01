import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { saveHapFile, parseHap, getModules } from "@/lib/hap-parser";
import { UPLOAD_DIR } from "@/lib/paths";

/** POST /api/hap - 上传 HAP 文件 */
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    let hapFilePath: string;
    let fileName: string;

    if (contentType.includes("application/json")) {
      // Electron 路径模式：直接使用本地文件路径，不读入内存
      const body = await req.json();
      const { localPath, fileName: fn } = body as { localPath?: string; fileName?: string };
      if (!localPath) return NextResponse.json({ error: "缺少 localPath" }, { status: 400 });
      fileName = fn || path.basename(localPath);
      if (!fileName.endsWith(".hap")) {
        return NextResponse.json({ error: "请上传 .hap 文件" }, { status: 400 });
      }
      if (!fs.existsSync(localPath)) {
        return NextResponse.json({ error: `文件不存在: ${localPath}` }, { status: 400 });
      }
      hapFilePath = localPath;
    } else {
      // FormData 模式（小文件 / 浏览器模式回退）
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) return NextResponse.json({ error: "未提供文件" }, { status: 400 });
      if (!file.name.endsWith(".hap")) {
        return NextResponse.json({ error: "请上传 .hap 文件" }, { status: 400 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      fileName = file.name;
      hapFilePath = await saveHapFile(buffer, fileName, UPLOAD_DIR);
    }

    // 解析测试库列表
    const testLibs = await parseHap(hapFilePath);
    const modules = getModules(testLibs);
    const archs = [...new Set(testLibs.map((t) => t.arch))];

    return NextResponse.json({
      fileName,
      filePath: hapFilePath,
      totalLibs: testLibs.length,
      modules,
      archs,
      testLibs,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
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
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
