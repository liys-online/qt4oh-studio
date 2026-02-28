import { NextRequest } from "next/server";
import { getSession } from "@/lib/store";
import {
  registerLogHandler,
  unregisterLogHandler,
} from "@/lib/test-runner";

/**
 * GET /api/tests/[id]/stream - SSE 实时日志流
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = getSession(id);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // 如果会话已完成，直接推送最终状态并关闭
      if (session && session.status !== "running") {
        const data = JSON.stringify({ type: "done", session });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        controller.close();
        return;
      }

      if (!session) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", message: "会话不存在" })}\n\n`)
        );
        controller.close();
        return;
      }

      // 注册日志回调
      const handler = (line: string) => {
        const data = JSON.stringify({ type: "log", message: line, time: new Date().toISOString() });
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          // stream 已关闭
        }
      };

      registerLogHandler(id, handler);

      // 定期推送会话状态
      const interval = setInterval(() => {
        const current = getSession(id);
        if (!current) return;
        try {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "status", session: current })}\n\n`
            )
          );
          if (current.status !== "running") {
            clearInterval(interval);
            unregisterLogHandler(id, handler);
            controller.close();
          }
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
