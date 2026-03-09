/**
 * 测试运行状态与报告的持久化存储
 * 通过 Knex 支持 SQLite / MySQL / PostgreSQL
 *
 * 切换数据库：设置环境变量
 *   DATABASE_PROVIDER=sqlite       (默认)
 *   DATABASE_PROVIDER=mysql        + DATABASE_URL=mysql://...
 *   DATABASE_PROVIDER=postgresql   + DATABASE_URL=postgresql://...
 */

import { getDb, ensureMigrated } from "./db";

export type TestStatus = "pending" | "running" | "success" | "timeout" | "crash" | "failed" | "interrupted";

/** 单条崩溃日志（文件名 + 原始内容，存入数据库，不落盘） */
export interface CrashLog {
  /** 日志文件名，含时间戳，如 cppcrash-com.xxx-20260301043829 */
  name: string;
  /** 日志文件原始文本内容 */
  content: string;
}

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
  /** 崩溃日志列表（含内容，存入数据库，不落本地磁盘） */
  crashLogs?: CrashLog[];
  /** XML 报告展示标签（相对路径）；实际内容见 reportContent */
  reportFile?: string;
  /** XML 报告原始内容（存入数据库，不落本地磁盘） */
  reportContent?: string;
  output?: string;
}

export interface TestSession {
  id: string;
  deviceId: string;
  hapFile: string;
  /** HAP 文件的绝对路径，用于重新运行单个测试 */
  hapFilePath?: string;
  packageName: string;
  abilityName: string;
  filterArch?: string;
  filterModule?: string | string[];
  /** 是否跳过 HAP 包内 resources/resfile/gitignore 忽略列表 */
  disableIgnoreList?: boolean;
  timeout: number;
  status: "running" | "completed" | "stopped";
  startTime: string;
  endTime?: string;
  results: TestResult[];
  /** 创建该会话的用户 ID（null 表示历史/匿名数据） */
  userId?: number;
  summary?: {
    total: number;
    success: number;
    failed: number;
    timeout: number;
    crash: number;
    interrupted: number;
  };
}

// ─── 行内类型转换工具 ────────────────────────────────────────────────────────

type DbSession = {
  id: string;
  device_id: string;
  hap_file: string;
  hap_file_path: string | null;
  package_name: string;
  ability_name: string;
  filter_arch: string | null;
  filter_module: string | null;
  filter_pattern: string | null;
  timeout: number;
  status: string;
  start_time: string;
  end_time: string | null;
  summary: string | null;
  user_id: number | null;
};

type DbResult = {
  id: string;
  session_id: string;
  arch: string;
  path: string;
  name: string;
  module: string;
  status: string;
  start_time: string | null;
  end_time: string | null;
  crash_logs: string | null;
  report_file: string | null;
  report_content: string | null;
  output: string | null;
  sort_order: number;
};

function rowToResult(r: DbResult): TestResult {
  return {
    id: r.id,
    arch: r.arch,
    path: r.path,
    name: r.name,
    module: r.module,
    status: r.status as TestStatus,
    startTime: r.start_time ?? undefined,
    endTime: r.end_time ?? undefined,
    crashLogs: r.crash_logs ? JSON.parse(r.crash_logs) as CrashLog[] : undefined,
    reportFile: r.report_file ?? undefined,
    reportContent: r.report_content ?? undefined,
    output: r.output ?? undefined,
  };
}

function rowToSession(s: DbSession, results: TestResult[]): TestSession {
  return {
    id: s.id,
    deviceId: s.device_id,
    hapFile: s.hap_file,
    hapFilePath: s.hap_file_path ?? undefined,
    packageName: s.package_name,
    abilityName: s.ability_name,
    filterArch: s.filter_arch ?? undefined,
    filterModule: s.filter_module ? JSON.parse(s.filter_module) : undefined,
    timeout: s.timeout,
    status: s.status as TestSession["status"],
    startTime: s.start_time,
    endTime: s.end_time ?? undefined,
    results,
    userId: s.user_id ?? undefined,
    summary: s.summary ? JSON.parse(s.summary) : undefined,
  };
}

// ─── 轻量化工具（剥离大字段，用于 SSE 传输）──────────────────────────────────

/**
 * 去掉 reportContent 和 crashLogs[].content，仅保留元数据。
 * 用于 SSE/GET API 传输，避免将 XML 内容和崩溃日志内容反复发给前端。
 * 实际内容通过专用 API 按需拉取。
 */
export function stripSessionContent(session: TestSession): TestSession {
  return {
    ...session,
    results: session.results.map((r) => ({
      ...r,
      reportContent: undefined,
      crashLogs: r.crashLogs?.map((l) => ({ name: l.name, content: "" })),
    })),
  };
}

// ─── 公开 API ────────────────────────────────────────────────────────────────

export async function loadSessions(userId?: number, role?: string): Promise<TestSession[]> {
  await ensureMigrated();
  const db = getDb();
  let query = db<DbSession>("sessions").select("*").orderBy("start_time", "desc");
  // 非管理员只能看自己的会话
  if (userId !== undefined && role !== "admin") {
    query = query.where("user_id", userId);
  }
  const rows = await query;
  const sessions: TestSession[] = [];
  for (const row of rows) {
    const results = await db<DbResult>("test_results")
      .where("session_id", row.id)
      .orderBy("sort_order", "asc");
    sessions.push(rowToSession(row, results.map(rowToResult)));
  }
  return sessions;
}

/**
 * 轻量化批量加载，用于列表 API：
 * - 单次批量查询替代 N+1
 * - DB 层不读取 report_content / output（大字段）
 * - 崩溃日志只保留文件名，剥离内容
 */
export async function loadSessionsSummary(userId?: number, role?: string): Promise<TestSession[]> {
  await ensureMigrated();
  const db = getDb();
  let sessionQuery = db<DbSession>("sessions").select("*").orderBy("start_time", "desc");
  // 非管理员只能看自己的会话
  if (userId !== undefined && role !== "admin") {
    sessionQuery = sessionQuery.where("user_id", userId);
  }
  const sessionRows = await sessionQuery;
  if (sessionRows.length === 0) return [];

  const sessionIds = sessionRows.map((s) => s.id);
  // 批量查询：显式排除 report_content 和 output
  type LightResult = Omit<DbResult, "report_content" | "output">;
  const resultRows: LightResult[] = await db("test_results")
    .whereIn("session_id", sessionIds)
    .select(
      "id", "session_id", "arch", "path", "name", "module",
      "status", "start_time", "end_time", "crash_logs", "report_file", "sort_order",
    )
    .orderBy("sort_order", "asc");

  // 按 session_id 分组
  const bySession: Record<string, LightResult[]> = {};
  for (const r of resultRows) {
    (bySession[r.session_id] ??= []).push(r);
  }

  return sessionRows.map((row) =>
    rowToSession(
      row,
      (bySession[row.id] ?? []).map((r) => ({
        id: r.id,
        arch: r.arch,
        path: r.path,
        name: r.name,
        module: r.module,
        status: r.status as TestStatus,
        startTime: r.start_time ?? undefined,
        endTime: r.end_time ?? undefined,
        // 只保留日志文件名，内容按需拉取
        crashLogs: r.crash_logs
          ? (JSON.parse(r.crash_logs) as CrashLog[]).map((l) => ({ name: l.name, content: "" }))
          : undefined,
        reportFile: r.report_file ?? undefined,
        // reportContent 不加载，节省内存
      })),
    )
  );
}

export async function getSession(id: string): Promise<TestSession | undefined> {
  await ensureMigrated();
  const db = getDb();
  const row = await db<DbSession>("sessions").where("id", id).first();
  if (!row) return undefined;
  const results = await db<DbResult>("test_results")
    .where("session_id", id)
    .orderBy("sort_order", "asc");
  return rowToSession(row, results.map(rowToResult));
}

export async function upsertSession(session: TestSession): Promise<void> {
  await ensureMigrated();
  const db = getDb();

  const sessionRow = {
    id: session.id,
    device_id: session.deviceId,
    hap_file: session.hapFile,
    hap_file_path: session.hapFilePath ?? null,
    package_name: session.packageName,
    ability_name: session.abilityName,
    filter_arch: session.filterArch ?? null,
    filter_module: session.filterModule != null ? JSON.stringify(session.filterModule) : null,
    filter_pattern: null,
    timeout: session.timeout,
    status: session.status,
    start_time: session.startTime,
    end_time: session.endTime ?? null,
    summary: session.summary ? JSON.stringify(session.summary) : null,
    user_id: session.userId ?? null,
  };

  const existing = await db<DbSession>("sessions").where("id", session.id).first();
  if (existing) {
    await db("sessions").where("id", session.id).update(sessionRow);
  } else {
    await db("sessions").insert(sessionRow);
  }

  // 同步 results：删除已移除的，insert 新增的，update 已有的
  const existingResultIds = new Set(
    (await db<DbResult>("test_results").where("session_id", session.id).select("id")).map((r) => r.id)
  );

  for (let i = 0; i < session.results.length; i++) {
    const r = session.results[i];
    const resultRow = {
      id: r.id,
      session_id: session.id,
      arch: r.arch,
      path: r.path,
      name: r.name,
      module: r.module,
      status: r.status,
      start_time: r.startTime ?? null,
      end_time: r.endTime ?? null,
      crash_logs: r.crashLogs ? JSON.stringify(r.crashLogs) : null,
      report_file: r.reportFile ?? null,
      report_content: r.reportContent ?? null,
      output: r.output ?? null,
      sort_order: i,
    };

    if (existingResultIds.has(r.id)) {
      await db("test_results").where("id", r.id).update(resultRow);
      existingResultIds.delete(r.id);
    } else {
      await db("test_results").insert(resultRow);
    }
  }

  // 删除不再存在的结果行
  if (existingResultIds.size > 0) {
    await db("test_results").whereIn("id", [...existingResultIds]).delete();
  }
}

export async function deleteSession(id: string): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  // CASCADE 约束自动删除 test_results，内容全在 DB 中无需清理文件
  await db("test_results").where("session_id", id).delete();
  await db("sessions").where("id", id).delete();
}

/** 批量删除所有非运行中会话 */
export async function deleteAllSessions(): Promise<number> {
  await ensureMigrated();
  const db = getDb();
  const toDelete = await db<DbSession>("sessions").whereNot("status", "running").select("id");
  if (toDelete.length === 0) return 0;
  const ids = toDelete.map((r) => r.id);
  await db("test_results").whereIn("session_id", ids).delete();
  await db("sessions").whereIn("id", ids).delete();
  return ids.length;
}

export async function updateTestResult(
  sessionId: string,
  resultId: string,
  updates: Partial<TestResult>
): Promise<void> {
  await ensureMigrated();
  const db = getDb();

  const row: Record<string, unknown> = {};
  if (updates.status !== undefined) row.status = updates.status;
  if (updates.startTime !== undefined) row.start_time = updates.startTime;
  if (updates.endTime !== undefined) row.end_time = updates.endTime;
  if (updates.crashLogs !== undefined) row.crash_logs = JSON.stringify(updates.crashLogs);
  if (updates.reportFile !== undefined) row.report_file = updates.reportFile;
  if (updates.reportContent !== undefined) row.report_content = updates.reportContent;
  if (updates.output !== undefined) row.output = updates.output;

  if (Object.keys(row).length > 0) {
    await db("test_results").where("id", resultId).where("session_id", sessionId).update(row);
  }
}

export function computeSummary(results: TestResult[]) {
  return {
    total: results.length,
    success: results.filter((r) => r.status === "success").length,
    failed: results.filter((r) => r.status === "failed").length,
    timeout: results.filter((r) => r.status === "timeout").length,
    crash: results.filter((r) => r.status === "crash").length,
    interrupted: results.filter((r) => r.status === "interrupted").length,
  };
}

/**
 * 服务启动时调用：将所有未结束的 running 会话标记为 stopped，
 * 并将其中仍处于 pending/running 状态的测试项标记为 failed。
 */
export async function resetRunningSessions(): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  const now = new Date().toISOString();

  const runningSessions = await db<DbSession>("sessions")
    .where("status", "running")
    .select("id");

  if (runningSessions.length === 0) return;

  const runningIds = runningSessions.map((s) => s.id);

  // 未完成的 results 标记为 failed
  await db("test_results")
    .whereIn("session_id", runningIds)
    .whereIn("status", ["pending", "running"])
    .update({ status: "failed", end_time: now });

  // 重新计算每个会话的 summary，并标记 stopped
  for (const { id } of runningSessions) {
    const results = await db<DbResult>("test_results").where("session_id", id);
    const mapped = results.map(rowToResult);
    const summary = computeSummary(mapped);
    await db("sessions")
      .where("id", id)
      .update({ status: "stopped", end_time: now, summary: JSON.stringify(summary) });
  }
}

