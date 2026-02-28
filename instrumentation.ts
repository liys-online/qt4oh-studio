/**
 * Next.js Instrumentation Hook
 * 服务启动时执行，将上次未正常结束的 running 会话标记为 stopped
 */
export async function register() {
  // 只在 Node.js 运行时执行（排除 Edge Runtime）
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { resetRunningSessions } = await import("@/lib/store");
    resetRunningSessions();
    console.log("[startup] resetRunningSessions done");
  }
}
