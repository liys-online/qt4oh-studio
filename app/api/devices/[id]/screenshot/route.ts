import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { takeScreenshot } from "@/lib/hdc";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let localPath: string | null = null;
  try {
    localPath = await takeScreenshot(id);
    if (!localPath) {
      return NextResponse.json({ error: "截图失败，请检查设备是否连接" }, { status: 500 });
    }

    const buffer = fs.readFileSync(localPath);
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Disposition": `inline; filename="screenshot-${id}-${Date.now()}.jpeg"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: unknown) {
    const err = e as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    // 清理本地临时文件
    if (localPath) {
      try {
        const dir = path.dirname(localPath);
        fs.rmSync(dir, { recursive: true, force: true });
      } catch { /* ignore */ }
    }
  }
}
