/**
 * 测试运行状态与报告的持久化存储
 * 使用 JSON 文件存储在 data/ 目录下（本地运行）
 */

import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");

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
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
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
