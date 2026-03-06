import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { parseHap, getModules, readHapIgnoreList } from "@/lib/hap-parser";
import { UPLOAD_DIR } from "@/lib/paths";

/** 确保上传目录存在 */
function ensureDir() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function statFile(filePath: string) {
  try {
    const st = fs.statSync(filePath);
    return { size: st.size, mtime: st.mtime.toISOString() };
  } catch {
    return null;
  }
}

/**
 * GET /api/gitcode-releases/download
 * 返回 UPLOAD_DIR 中已下载的 .hap 文件列表
 */
export async function GET() {
  ensureDir();
  try {
    const files = fs
      .readdirSync(UPLOAD_DIR)
      .filter((f) => f.endsWith(".hap"))
      .map((name) => {
        const fp = path.join(UPLOAD_DIR, name);
        const st = statFile(fp);
        return { name, size: st?.size ?? 0, mtime: st?.mtime ?? "" };
      })
      .sort((a, b) => (b.mtime > a.mtime ? 1 : -1));
    return NextResponse.json({ files });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/**
 * POST /api/gitcode-releases/download
 * body: { url: string, fileName: string }
 *
 * 返回 SSE 流：
 *   data: {"status":"exists","data":{...hapInfo}}          ← 文件已缓存
 *   data: {"status":"progress","p":40,"dl":N,"total":N}    ← 下载进度 (0-100)
 *   data: {"status":"done","data":{...hapInfo}}            ← 完成
 *   data: {"status":"error","message":"..."}               ← 出错
 */
export async function POST(req: NextRequest) {
  const { url, fileName } = (await req.json()) as { url?: string; fileName?: string };

  if (!fileName) {
    return NextResponse.json({ error: "缺少 fileName" }, { status: 400 });
  }
  if (!fileName.endsWith(".hap")) {
    return NextResponse.json({ error: "文件名必须以 .hap 结尾" }, { status: 400 });
  }

  ensureDir();
  const destPath = path.join(UPLOAD_DIR, fileName);

  const encoder = new TextEncoder();
  const sse = (obj: unknown) => encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // ── 已缓存：直接解析返回 ────────────────────────────
        if (fs.existsSync(destPath)) {
          const testLibs = await parseHap(destPath);
          const ignoreList = await readHapIgnoreList(destPath);
          const modules = getModules(testLibs);
          const archs = [...new Set(testLibs.map((t) => t.arch))];
          const st = statFile(destPath);
          controller.enqueue(sse({ status: "exists", data: { fileName, filePath: destPath, totalLibs: testLibs.length, modules, archs, testLibs, ignoreList, size: st?.size } }));
          controller.close();
          return;
        }

        // 文件不存在且没提供下载地址
        if (!url) {
          throw new Error("文件不在缓存中，请重新下载");
        }

        // ── Step 1：拿 CDN 302 重定向地址 ───────────────────
        const redirectRes = await fetch(url, {
          method: "GET",
          redirect: "manual",
          headers: { cookie: "_session=1" },
        });

        let downloadUrl: string;
        if (redirectRes.status === 302 || redirectRes.status === 301) {
          const location = redirectRes.headers.get("location");
          if (!location) throw new Error("未能获取 CDN 下载链接");
          downloadUrl = location;
        } else if (redirectRes.status === 200) {
          downloadUrl = url;
        } else {
          const text = await redirectRes.text().catch(() => "");
          throw new Error(`GitCode 返回 ${redirectRes.status}: ${text.slice(0, 200)}`);
        }

        // ── Step 2：流式下载，每 1% 推送一次进度 ────────────
        const cdnRes = await fetch(downloadUrl, { redirect: "follow" });
        if (!cdnRes.ok) throw new Error(`CDN 下载失败 (${cdnRes.status})`);

        const total = parseInt(cdnRes.headers.get("content-length") || "0", 10);
        const reader = cdnRes.body?.getReader();
        if (!reader) throw new Error("无法读取响应流");

        const tmpPath = destPath + ".tmp";
        const fd = fs.openSync(tmpPath, "w");
        let downloaded = 0;
        let lastP = -1;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            fs.writeSync(fd, value);
            downloaded += value.length;
            const p = total > 0 ? Math.round((downloaded / total) * 100) : 0;
            if (p !== lastP) {
              lastP = p;
              controller.enqueue(sse({ status: "progress", p, dl: downloaded, total }));
            }
          }
        } finally {
          fs.closeSync(fd);
        }

        fs.renameSync(tmpPath, destPath);

        // ── Step 3：解析 HAP ─────────────────────────────────
        const testLibs2 = await parseHap(destPath);
        const ignoreList2 = await readHapIgnoreList(destPath);
        const modules2 = getModules(testLibs2);
        const archs2 = [...new Set(testLibs2.map((t) => t.arch))];
        const st = statFile(destPath);
        controller.enqueue(sse({ status: "done", data: { fileName, filePath: destPath, totalLibs: testLibs2.length, modules: modules2, archs: archs2, testLibs: testLibs2, ignoreList: ignoreList2, size: st?.size } }));
      } catch (e: unknown) {
        controller.enqueue(sse({ status: "error", message: (e as Error).message }));
        try { fs.unlinkSync(destPath + ".tmp"); } catch { /* ignore */ }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/**
 * DELETE /api/gitcode-releases/download?file=xxx
 * 删除已下载的 HAP 文件
 */
export async function DELETE(req: NextRequest) {
  const fileName = new URL(req.url).searchParams.get("file");
  if (!fileName || !fileName.endsWith(".hap")) {
    return NextResponse.json({ error: "无效的文件名" }, { status: 400 });
  }
  const filePath = path.join(UPLOAD_DIR, path.basename(fileName));
  try {
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }
    fs.unlinkSync(filePath);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
