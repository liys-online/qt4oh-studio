import { NextRequest } from "next/server";
import { getSession, stripSessionContent } from "@/lib/store";
import {
  registerLogHandler,
  unregisterLogHandler,
  getSessionLogs,
} from "@/lib/test-runner";

/**
 * GET /api/tests/[id]/stream - SSE 实时日志流
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession(id);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // 先回放历史日志（无论会话是否仍在运行）
      const history = getSessionLogs(id);
      for (const entry of history) {
        const data = JSON.stringify({ type: "log", message: entry.message, time: entry.time });
        try { controller.enqueue(encoder.encode(`data: ${data}\n\n`)); } catch { return; }
      }

      if (!session) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", message: "会话不存在" })}\n\n`)
        );
        controller.close();
        return;
      }

      // 如果会话已完成，先推送最终状态；但仍保持连接以接收后续重跑推送
      if (session.status !== "running") {
        const data = JSON.stringify({ type: "done", session: stripSessionContent(session) });
        try { controller.enqueue(encoder.encode(`data: ${data}\n\n`)); } catch { return; }
      }

      // 注册日志回调
      const handler = (line: string) => {
        try {
          // 特殊格式：__status__:<JSON> — 由 rerunSingleTest 推送会话快照
          if (line.startsWith("__status__:")) {
            const sessionSnap = JSON.parse(line.slice("__status__:".length));
            const isRunning = (sessionSnap as { status: string }).status === "running";
            const data = JSON.stringify({
              type: isRunning ? "status" : "done",
              session: sessionSnap,
            });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            return;
          }
          const data = JSON.stringify({ type: "log", message: line, time: new Date().toISOString() });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          // stream 已关闭
        }
      };

      registerLogHandler(id, handler);

      // 定期推送会话状态（仅在运行中）
      const interval = setInterval(async () => {
        const current = await getSession(id);
        if (!current) return;
        if (current.status !== "running") {
          clearInterval(interval);
          return;
        }
        try {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "status", session: stripSessionContent(current) })}\n\n`
            )
          );
        } catch {
          clearInterval(interval);
        }
      }, 2000);

      // 客户端断开时清理
      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        unregisterLogHandler(id, handler);
        try { controller.close(); } catch { /* ignore */ }
      });
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
