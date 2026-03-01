import { NextResponse } from "next/server";
import * as fs from "fs";
import { loadSessions, computeSummary } from "@/lib/store";
import { FAULTLOG_DIR } from "@/lib/paths";

/** GET /api/reports - 汇总所有会话的统计报告 */
export async function GET() {
  const sessions = loadSessions();

  const overview = {
    totalSessions: sessions.length,
    completedSessions: sessions.filter((s) => s.status === "completed").length,
    runningSessions: sessions.filter((s) => s.status === "running").length,
    totalTests: 0,
    totalSuccess: 0,
    totalFailed: 0,
    totalTimeout: 0,
    totalCrash: 0,
  };

  for (const s of sessions) {
    const summary = s.summary || computeSummary(s.results);
    overview.totalTests += summary.total;
    overview.totalSuccess += summary.success;
    overview.totalFailed += summary.failed;
    overview.totalTimeout += summary.timeout;
    overview.totalCrash += summary.crash;
  }

  // 崩溃日志文件列表
  let crashFiles: string[] = [];
  if (fs.existsSync(FAULTLOG_DIR)) {
    crashFiles = fs.readdirSync(FAULTLOG_DIR);
  }

  return NextResponse.json({ overview, sessions, crashFiles });
}
