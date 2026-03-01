/**
 * 测试运行状态与报告的持久化存储
 * 使用 JSON 文件存储在 data/ 目录下（本地运行）
 */

import * as fs from "fs";
import * as path from "path";
import { APP_DATA_DIR, SESSIONS_FILE, FAULTLOG_DIR, REPORTS_BASE_DIR } from "./paths";

export type TestStatus = "pending" | "running" | "success" | "timeout" | "crash" | "failed";

export interface TestResult {
  id: string;
  arch: string;
  /** 相对路径，如 tests/qtbase/char/libtst_qatomicinteger_char.so */
  path: string;
  name: string;
  module: string;
  status: TestStatus;
  startTime?: string;
  endTime?: string;
  /** 崩溃日志文件名列表 */
  crashLogs?: string[];
  /** 测试结果 XML 报告相对路径（相对于 sessionReportDir） */
  reportFile?: string;
  output?: string;
}

export interface TestSession {
  id: string;
  deviceId: string;
  hapFile: string;
  packageName: string;
  abilityName: string;
  filterArch?: string;
  filterModule?: string;
  filterPattern?: string;
  timeout: number;
  status: "running" | "completed" | "stopped";
  startTime: string;
  endTime?: string;
  results: TestResult[];
  summary?: {
    total: number;
    success: number;
    failed: number;
    timeout: number;
    crash: number;
  };
}

function ensureDataDir() {
  if (!fs.existsSync(APP_DATA_DIR)) fs.mkdirSync(APP_DATA_DIR, { recursive: true });
}

export function loadSessions(): TestSession[] {
  ensureDataDir();
  if (!fs.existsSync(SESSIONS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

export function saveSessions(sessions: TestSession[]) {
  ensureDataDir();
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), "utf-8");
}

export function getSession(id: string): TestSession | undefined {
  return loadSessions().find((s) => s.id === id);
}

export function upsertSession(session: TestSession) {
  const sessions = loadSessions();
  const idx = sessions.findIndex((s) => s.id === session.id);
  if (idx >= 0) sessions[idx] = session;
  else sessions.unshift(session);
  saveSessions(sessions);
}

export function deleteSession(id: string) {
  const sessions = loadSessions();
  const target = sessions.find((s) => s.id === id);
  if (!target) return;

  const otherSessions = sessions.filter((s) => s.id !== id);

  // 收集其他会话仍在引用的崩溃日志文件名（防止误删共享文件）
  const referencedLogs = new Set(
    otherSessions.flatMap((s) => s.results.flatMap((r) => r.crashLogs ?? []))
  );

  // 删除本会话独有的崩溃日志文件
  for (const result of target.results) {
    for (const logFile of result.crashLogs ?? []) {
      if (!referencedLogs.has(logFile)) {
        const filePath = path.join(FAULTLOG_DIR, path.basename(logFile));
        try {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch {
          // 忽略删除失败（文件可能已不存在）
        }
      }
    }
  }

  saveSessions(otherSessions);

  // 删除该会话的 XML 报告目录
  const reportDir = path.join(REPORTS_BASE_DIR, id);
  if (fs.existsSync(reportDir)) {
    try { fs.rmSync(reportDir, { recursive: true, force: true }); } catch { /* 忽略 */ }
  }

  // 清理孤立崩溃日志：删除磁盘上不被任何会话引用的文件
  purgeOrphanCrashLogs(otherSessions);
}

/** 删除 Faultlogger 目录中不属于任何会话的孤立文件 */
function purgeOrphanCrashLogs(sessions: TestSession[]) {
  if (!fs.existsSync(FAULTLOG_DIR)) return;
  const allReferenced = new Set(
    sessions.flatMap((s) => s.results.flatMap((r) => r.crashLogs ?? []))
  );
  try {
    const files = fs.readdirSync(FAULTLOG_DIR);
    for (const file of files) {
      if (!allReferenced.has(file)) {
        try {
          fs.unlinkSync(path.join(FAULTLOG_DIR, file));
        } catch {
          // 忽略
        }
      }
    }
  } catch {
    // 目录不可读，忽略
  }
}

/** 批量删除所有非运行中的会话（含崩溃日志和 XML 报告目录） */
export function deleteAllSessions() {
  const sessions = loadSessions();
  const running = sessions.filter((s) => s.status === "running");
  const toDelete = sessions.filter((s) => s.status !== "running");

  const referencedLogs = new Set(
    running.flatMap((s) => s.results.flatMap((r) => r.crashLogs ?? []))
  );

  for (const target of toDelete) {
    // 删除独有崩溃日志
    for (const result of target.results) {
      for (const logFile of result.crashLogs ?? []) {
        if (!referencedLogs.has(logFile)) {
          const filePath = path.join(FAULTLOG_DIR, path.basename(logFile));
          try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch { /* 忽略 */ }
        }
      }
    }
    // 删除 XML 报告目录
    const reportDir = path.join(REPORTS_BASE_DIR, target.id);
    if (fs.existsSync(reportDir)) {
      try { fs.rmSync(reportDir, { recursive: true, force: true }); } catch { /* 忽略 */ }
    }
  }

  saveSessions(running);
  purgeOrphanCrashLogs(running);
  return toDelete.length;
}

export function updateTestResult(
  sessionId: string,
  resultId: string,
  updates: Partial<TestResult>
) {
  const sessions = loadSessions();
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) return;
  const result = session.results.find((r) => r.id === resultId);
  if (result) Object.assign(result, updates);
  saveSessions(sessions);
}

export function computeSummary(results: TestResult[]) {
  return {
    total: results.length,
    success: results.filter((r) => r.status === "success").length,
    failed: results.filter((r) => r.status === "failed").length,
    timeout: results.filter((r) => r.status === "timeout").length,
    crash: results.filter((r) => r.status === "crash").length,
  };
}

/**
 * 服务启动时调用：将所有未结束的 running 会话标记为 stopped，
 * 并将其中仍处于 pending/running 状态的测试项标记为 failed。
 */
export function resetRunningSessions() {
  const sessions = loadSessions();
  let changed = false;

  for (const session of sessions) {
    if (session.status === "running") {
      // 未完成的测试项标记为 failed
      for (const result of session.results) {
        if (result.status === "pending" || result.status === "running") {
          result.status = "failed";
          result.endTime = new Date().toISOString();
          changed = true;
        }
      }
      session.status = "stopped";
      session.endTime = new Date().toISOString();
      session.summary = computeSummary(session.results);
      changed = true;
    }
  }

  if (changed) saveSessions(sessions);
}
