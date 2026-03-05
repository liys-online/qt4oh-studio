import { NextResponse } from "next/server";
import { loadSessionsSummary, computeSummary } from "@/lib/store";

/** GET /api/reports - 汇总所有会话的统计报告 */
export async function GET() {
  const sessions = await loadSessionsSummary();

  const overview = {
    totalSessions: sessions.length,
    completedSessions: sessions.filter((s) => s.status === "completed").length,
    runningSessions: sessions.filter((s) => s.status === "running").length,
    totalTests: 0,
    totalSuccess: 0,
    totalFailed: 0,
    totalTimeout: 0,
    totalCrash: 0,
    totalInterrupted: 0,
  };

  for (const s of sessions) {
    const summary = s.summary || computeSummary(s.results);
    overview.totalTests += summary.total;
    overview.totalSuccess += summary.success;
    overview.totalFailed += summary.failed;
    overview.totalTimeout += summary.timeout;
    overview.totalCrash += summary.crash;
    overview.totalInterrupted += summary.interrupted ?? 0;
  }

  // 崩溃日志文件名列表（从 DB 自动聚合，去重）
  const crashFileSet = new Set<string>();
  for (const s of sessions) {
    for (const r of s.results) {
      for (const log of r.crashLogs ?? []) {
        crashFileSet.add(log.name);
      }
    }
  }
  const crashFiles = [...crashFileSet];

  // 列表页只需会话元数据，不需要 results 数组
  const sessionList = sessions.map((s) => ({
    id: s.id,
    hapFile: s.hapFile,
    deviceId: s.deviceId,
    status: s.status,
    startTime: s.startTime,
    endTime: s.endTime,
    summary: s.summary,
  }));

  return NextResponse.json({ overview, sessions: sessionList, crashFiles });
}
