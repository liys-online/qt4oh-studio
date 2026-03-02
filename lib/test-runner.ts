/**
 * 测试运行器 - TypeScript 重写自 test_runner.py
 * 在 Next.js API Route 中调用，通过全局 Map 维护运行中的会话
 */

import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import {
  startAbility,
  checkProcessRunning,
  killProcess,
  getFaultLogs,
  parseCrashLogs,
  downloadFaultLog,
  downloadTestReport,
  installHap,
} from "./hdc";
import { parseXmlReport } from "./xml-report";
import { parseHap, filterTestLibs, type TestLib } from "./hap-parser";
import {
  upsertSession,
  updateTestResult,
  computeSummary,
  type TestSession,
  type TestResult,
} from "./store";
import { FAULTLOG_DIR, REPORTS_BASE_DIR, LOGS_DIR } from "./paths";

/** 全局存储运行中会话的日志回调，用于 SSE 推送 */
const sessionLogHandlers = new Map<string, ((line: string) => void)[]>();
/** 全局存储停止信号 */
const sessionStopFlags = new Map<string, boolean>();
/** 存储运行中会话的设备信息，用于立即 force-stop */
const sessionMeta = new Map<string, { deviceId: string; packageName: string }>();

export function registerLogHandler(sessionId: string, handler: (line: string) => void) {
  const handlers = sessionLogHandlers.get(sessionId) || [];
  handlers.push(handler);
  sessionLogHandlers.set(sessionId, handlers);
}

export function unregisterLogHandler(sessionId: string, handler: (line: string) => void) {
  const handlers = sessionLogHandlers.get(sessionId) || [];
  sessionLogHandlers.set(sessionId, handlers.filter((h) => h !== handler));
}

export function getSessionLogs(sessionId: string): { time: string; message: string }[] {
  const file = path.join(LOGS_DIR, `${sessionId}.jsonl`);
  if (!fs.existsSync(file)) return [];
  try {
    return fs.readFileSync(file, "utf-8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

export function stopSession(sessionId: string) {
  sessionStopFlags.set(sessionId, true);
  // 立即向设备发送 force-stop，不等待当前测试的轮询检测到标志位
  const meta = sessionMeta.get(sessionId);
  if (meta) {
    killProcess(meta.deviceId, meta.packageName).catch(() => {});
  }
}

function emit(sessionId: string, line: string) {
  const time = new Date().toISOString();
  // 将日志追加写入文件（JSONL），就算热更新/重启也不丢失
  try {
    if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
    fs.appendFileSync(
      path.join(LOGS_DIR, `${sessionId}.jsonl`),
      JSON.stringify({ time, message: line }) + "\n",
      "utf-8"
    );
  } catch { /* ignore write errors */ }
  const handlers = sessionLogHandlers.get(sessionId) || [];
  for (const h of handlers) h(line);
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export interface RunOptions {
  hapFilePath: string;
  deviceId: string;
  packageName?: string;
  abilityName?: string;
  architectures?: string[];
  filterArch?: string;
  filterModule?: string | string[];
  filterPattern?: string;
  timeout?: number;
  skipInstall?: boolean;
}

/** 启动测试会话，异步运行，返回 sessionId */
export async function startTestSession(options: RunOptions): Promise<string> {
  const sessionId = uuidv4();
  const {
    hapFilePath,
    deviceId,
    packageName = "com.qtsig.qtest",
    abilityName = "EntryAbility",
    architectures = ["arm64-v8a", "armeabi-v7a", "x86_64"],
    filterArch,
    filterModule,
    filterPattern,
    timeout = 300,
    skipInstall = false,
  } = options;

  // 确保 Faultlogger 目录存在
  if (!fs.existsSync(FAULTLOG_DIR)) fs.mkdirSync(FAULTLOG_DIR, { recursive: true });

  const session: TestSession = {
    id: sessionId,
    deviceId,
    hapFile: path.basename(hapFilePath),
    hapFilePath,
    packageName,
    abilityName,
    filterArch,
    filterModule,
    filterPattern,
    timeout,
    status: "running",
    startTime: new Date().toISOString(),
    results: [],
  };
  upsertSession(session);
  sessionStopFlags.set(sessionId, false);
  sessionMeta.set(sessionId, { deviceId, packageName });

  // 异步执行，不阻塞 API 返回
  runSession(sessionId, session, hapFilePath, architectures, skipInstall).catch(
    (e) => {
      emit(sessionId, `[ERROR] 会话异常终止: ${e?.message || e}`);
      session.status = "stopped";
      session.endTime = new Date().toISOString();
      upsertSession(session);
    }
  );

  return sessionId;
}

async function runSession(
  sessionId: string,
  session: TestSession,
  hapFilePath: string,
  architectures: string[],
  skipInstall: boolean
) {
  const { deviceId, packageName, abilityName, timeout } = session;

  emit(sessionId, `[INFO] 会话启动: ${sessionId}`);

  // 1. 安装 HAP
  if (!skipInstall) {
    emit(sessionId, `[INFO] ── 阶段 1/4：上传并安装 HAP ──`);
    emit(sessionId, `[INFO] 正在安装 HAP: ${session.hapFile}`);
    const { success, message } = await installHap(deviceId, hapFilePath, packageName, (cmd) => {
      emit(sessionId, `[CMD] ${cmd}`);
    });
    if (!success) {
      emit(sessionId, `[ERROR] 安装失败: ${message}`);
      session.status = "stopped";
      session.endTime = new Date().toISOString();
      upsertSession(session);
      return;
    }
    emit(sessionId, `[INFO] 安装成功: ${message}`);
  } else {
    emit(sessionId, `[INFO] 跳过安装步骤`);
  }

  // 2. 解析 HAP，获取测试库列表
  emit(sessionId, `[INFO] ── 阶段 2/4：解析 HAP，枚举测试库 ──`);
  emit(sessionId, `[INFO] 解析 HAP 包...`);
  let allLibs: TestLib[];
  try {
    allLibs = await parseHap(hapFilePath, architectures);
  } catch (e: unknown) {
    const err = e as Error;
    emit(sessionId, `[ERROR] HAP 解析失败: ${err?.message}`);
    session.status = "stopped";
    session.endTime = new Date().toISOString();
    upsertSession(session);
    return;
  }

  const libs = filterTestLibs(
    allLibs,
    session.filterArch,
    session.filterModule,
    session.filterPattern
  );

  emit(sessionId, `[INFO] 共找到 ${libs.length} 个测试库`);

  // 3. 初始化 result 列表
  emit(sessionId, `[INFO] ── 阶段 3/4：记录基线崩溃日志 ──`);
  session.results = libs.map((lib) => ({
    id: uuidv4(),
    arch: lib.arch,
    path: lib.path,
    name: lib.name,
    module: lib.module,
    status: "pending" as const,
  }));
  upsertSession(session);

  // 4. 记录初始崩溃日志，用于后续对比
  const knownCrashLogs = new Set<string>(
    parseCrashLogs(await getFaultLogs(deviceId), packageName)
  );
  emit(sessionId, `[INFO] 已记录 ${knownCrashLogs.size} 条已有崩溃日志`);

  // 5. 逐一运行测试
  emit(sessionId, `[INFO] ── 阶段 4/4：逐一执行测试库 ──`);
  for (let i = 0; i < session.results.length; i++) {
    if (sessionStopFlags.get(sessionId)) {
      emit(sessionId, `[INFO] 收到停止信号，终止测试`);
      break;
    }

    const result = session.results[i];
    const lib = libs[i];

    emit(sessionId, `[INFO] [${i + 1}/${libs.length}] 运行: ${lib.path} (${lib.arch})`);
    result.status = "running";
    result.startTime = new Date().toISOString();
    updateTestResult(sessionId, result.id, {
      status: "running",
      startTime: result.startTime,
    });

    // 启动测试
    const startOutput = await startAbility(deviceId, packageName, abilityName, lib.path, (cmd) => {
      emit(sessionId, `[CMD] ${cmd}`);
    });
    if (startOutput) emit(sessionId, `[HDC] ${startOutput}`);

    // 等待进程启动
    await sleep(1000);

    // 等待进程结束 or 超时
    let elapsed = 0;
    let testStatus: "success" | "timeout" = "success";

    while (elapsed < timeout) {
      if (sessionStopFlags.get(sessionId)) {
        emit(sessionId, `[INFO] 检测到停止信号，强制停止当前测试`);
        await killProcess(deviceId, packageName);
        break;
      }
      if (!await checkProcessRunning(deviceId, packageName)) {
        emit(sessionId, `[INFO] 测试完成 (${elapsed}s)`);
        break;
      }
      process.stdout.write(".");
      await sleep(2000);
      elapsed += 2;
    }

    if (elapsed >= timeout) {
      emit(sessionId, `[WARN] 测试超时 (${timeout}s)，强制终止`);
      await killProcess(deviceId, packageName);
      await sleep(1000);
      testStatus = "timeout";
    }

    // 检查崩溃日志
    const currentCrashLogs = parseCrashLogs(await getFaultLogs(deviceId), packageName);
    const newCrashes = currentCrashLogs.filter((c) => !knownCrashLogs.has(c));

    let finalStatus: TestResult["status"] = testStatus;
    const crashLogFiles: string[] = [];

    if (newCrashes.length > 0) {
      finalStatus = "crash";
      emit(sessionId, `[WARN] 检测到 ${newCrashes.length} 条新崩溃日志`);
      for (const crashLog of newCrashes) {
        emit(sessionId, `[CRASH] ${crashLog}`);
        knownCrashLogs.add(crashLog);
        crashLogFiles.push(crashLog);
        const ok = await downloadFaultLog(deviceId, crashLog, FAULTLOG_DIR);
        emit(sessionId, ok ? `[INFO] 已下载崩溃日志: ${crashLog}` : `[WARN] 下载失败: ${crashLog}`);
      }
    }

    result.status = finalStatus;
    result.endTime = new Date().toISOString();
    result.crashLogs = crashLogFiles;

    // 下载并解析 XML 测试报告
    const sessionReportDir = path.join(REPORTS_BASE_DIR, sessionId);
    const xmlLocalPath = await downloadTestReport(deviceId, packageName, lib.path, sessionReportDir, (cmd) => {
      emit(sessionId, `[CMD] ${cmd}`);
    });

    let reportFile: string | undefined;
    if (xmlLocalPath) {
      // reportFile 存相对路径（相对 sessionReportDir）
      reportFile = path.relative(sessionReportDir, xmlLocalPath);
      emit(sessionId, `[INFO] XML 报告已下载: ${reportFile}`);
      try {
        const xmlContent = fs.readFileSync(xmlLocalPath, "utf-8");
        const xmlResult = parseXmlReport(xmlContent);
        // 测试函数有任何失败则覆盖状态为 failed（崩溃优先级更高）
        if (finalStatus !== "crash" && finalStatus !== "timeout") {
          finalStatus = xmlResult.passed ? "success" : "failed";
        }
        const failedFuncs = xmlResult.functions.filter((f) => f.hasFailed);
        if (failedFuncs.length > 0) {
          emit(sessionId, `[WARN] XML 报告: ${failedFuncs.length} 个测试函数失败`);
          for (const fn of failedFuncs.slice(0, 5)) {
            emit(sessionId, `[FAIL] 函数: ${fn.name}${fn.message ? " - " + fn.message.trim().slice(0, 120) : ""}`);
          }
        }
      } catch (e) {
        emit(sessionId, `[WARN] XML 解析失败: ${(e as Error).message}`);
      }
    } else {
      emit(sessionId, `[WARN] XML 报告下载失败`);
      // 报告下载失败时，若非崩溃/超时，标记为 failed（无法确认测试结果）
      if (finalStatus !== "crash" && finalStatus !== "timeout") {
        finalStatus = "failed";
        emit(sessionId, `[WARN] 无法获取测试报告，判定为失败`);
      }
    }

    result.status = finalStatus;
    result.endTime = new Date().toISOString();
    result.crashLogs = crashLogFiles;
    result.reportFile = reportFile;

    updateTestResult(sessionId, result.id, {
      status: finalStatus,
      endTime: result.endTime,
      crashLogs: crashLogFiles,
      reportFile,
    });

    emit(
      sessionId,
      `[RESULT] ${lib.name}: ${finalStatus.toUpperCase()}`
    );
  }

  // 6. 汇总
  const sessions = (await import("./store")).loadSessions();
  const finalSession = sessions.find((s) => s.id === sessionId);
  if (finalSession) {
    finalSession.status = sessionStopFlags.get(sessionId) ? "stopped" : "completed";
    finalSession.endTime = new Date().toISOString();
    finalSession.summary = computeSummary(finalSession.results);
    upsertSession(finalSession);
    const s = finalSession.summary;
    emit(sessionId, `[DONE] 测试完成！总计:${s.total} 成功:${s.success} 超时:${s.timeout} 崩溃:${s.crash} 失败:${s.failed}`);
  }

  sessionLogHandlers.delete(sessionId);
  sessionStopFlags.delete(sessionId);
  sessionMeta.delete(sessionId);
}

// ─────────────────────────────────────────────
// 单测重新运行
// ─────────────────────────────────────────────

export interface RerunOptions {
  /** 指定新的 HAP 路径；不传则使用会话原路径 */
  hapFilePath?: string;
  /** 设备 ID；不传则使用会话原设备 */
  deviceId?: string;
  /** 超时秒数；不传则使用会话原超时 */
  timeout?: number;
  /** 是否跳过重新安装 HAP */
  skipInstall?: boolean;
}

/**
 * 重新运行会话中的某一条测试，结果就地更新。
 * 异步执行，立即返回。
 */
export async function rerunSingleTest(
  sessionId: string,
  resultId: string,
  options: RerunOptions = {}
): Promise<void> {
  const session = (await import("./store")).getSession(sessionId);
  if (!session) throw new Error(`会话不存在: ${sessionId}`);
  if (session.status === "running") throw new Error("会话正在运行中，无法重跑单条测试");

  const result = session.results.find((r) => r.id === resultId);
  if (!result) throw new Error(`结果记录不存在: ${resultId}`);

  const hapFilePath = options.hapFilePath ?? session.hapFilePath ?? "";
  if (!hapFilePath) throw new Error("未指定 HAP 路径，且会话未记录原始路径");
  if (!fs.existsSync(hapFilePath)) throw new Error(`HAP 文件不存在: ${hapFilePath}`);

  const deviceId = options.deviceId ?? session.deviceId;
  const timeout = options.timeout ?? session.timeout;
  const packageName = session.packageName;
  const abilityName = session.abilityName;
  const skipInstall = options.skipInstall ?? false;

  // 如果指定了新的 HAP 路径，更新会话记录
  if (options.hapFilePath && options.hapFilePath !== session.hapFilePath) {
    (await import("./store")).upsertSession({
      ...session,
      hapFilePath: options.hapFilePath,
      hapFile: path.basename(options.hapFilePath),
    });
  }

  // 将该条目标记为 running，推送状态更新
  const store = await import("./store");
  const rerunId = `${sessionId}:rerun:${resultId}`;
  sessionStopFlags.set(rerunId, false);

  // 立即告知前端该条目开始运行
  updateTestResult(sessionId, resultId, { status: "running", startTime: new Date().toISOString() });
  const updatedSession = store.getSession(sessionId)!;
  const handlers = sessionLogHandlers.get(sessionId) ?? [];
  for (const h of handlers) {
    // 推送 status 事件让 SSE 客户端刷新
    h(`__status__:${JSON.stringify(updatedSession)}`);
  }

  // 异步执行
  _rerunSingleTestAsync(sessionId, resultId, rerunId, {
    hapFilePath, deviceId, timeout, packageName, abilityName, skipInstall,
    lib: { arch: result.arch, path: result.path, name: result.name, module: result.module },
  }).catch((e) => {
    emit(sessionId, `[ERROR] 重跑异常: ${e?.message || e}`);
    updateTestResult(sessionId, resultId, { status: "failed", endTime: new Date().toISOString() });
  });
}

async function _rerunSingleTestAsync(
  sessionId: string,
  resultId: string,
  rerunId: string,
  opts: {
    hapFilePath: string;
    deviceId: string;
    timeout: number;
    packageName: string;
    abilityName: string;
    skipInstall: boolean;
    lib: { arch: string; path: string; name: string; module: string };
  }
) {
  const { hapFilePath, deviceId, timeout, packageName, abilityName, skipInstall, lib } = opts;

  emit(sessionId, `[INFO] ── 重新运行: ${lib.name} (${lib.arch}) ──`);

  // 安装 HAP（可选）
  if (!skipInstall) {
    emit(sessionId, `[INFO] 正在安装 HAP: ${path.basename(hapFilePath)}`);
    const { success, message } = await installHap(deviceId, hapFilePath, packageName, (cmd) => {
      emit(sessionId, `[CMD] ${cmd}`);
    });
    if (!success) {
      emit(sessionId, `[ERROR] 安装失败: ${message}`);
      updateTestResult(sessionId, resultId, { status: "failed", endTime: new Date().toISOString() });
      sessionStopFlags.delete(rerunId);
      return;
    }
    emit(sessionId, `[INFO] 安装成功`);
  }

  // 记录已有崩溃日志
  const knownCrashLogs = new Set<string>(
    parseCrashLogs(await getFaultLogs(deviceId), packageName)
  );

  // 启动测试
  const startOutput = await startAbility(deviceId, packageName, abilityName, lib.path, (cmd) => {
    emit(sessionId, `[CMD] ${cmd}`);
  });
  if (startOutput) emit(sessionId, `[HDC] ${startOutput}`);

  await sleep(1000);

  // 等待完成或超时
  let elapsed = 0;
  let testStatus: "success" | "timeout" = "success";
  while (elapsed < timeout) {
    if (!await checkProcessRunning(deviceId, packageName)) {
      emit(sessionId, `[INFO] 测试完成 (${elapsed}s)`);
      break;
    }
    await sleep(2000);
    elapsed += 2;
  }
  if (elapsed >= timeout) {
    emit(sessionId, `[WARN] 测试超时 (${timeout}s)，强制终止`);
    await killProcess(deviceId, packageName);
    await sleep(1000);
    testStatus = "timeout";
  }

  // 检查崩溃
  const currentCrashLogs = parseCrashLogs(await getFaultLogs(deviceId), packageName);
  const newCrashes = currentCrashLogs.filter((c) => !knownCrashLogs.has(c));
  let finalStatus: TestResult["status"] = testStatus;
  const crashLogFiles: string[] = [];

  if (newCrashes.length > 0) {
    finalStatus = "crash";
    emit(sessionId, `[WARN] 检测到 ${newCrashes.length} 条新崩溃日志`);
    for (const crashLog of newCrashes) {
      emit(sessionId, `[CRASH] ${crashLog}`);
      crashLogFiles.push(crashLog);
      const ok = await downloadFaultLog(deviceId, crashLog, FAULTLOG_DIR);
      emit(sessionId, ok ? `[INFO] 已下载崩溃日志: ${crashLog}` : `[WARN] 下载失败: ${crashLog}`);
    }
  }

  // 下载并解析 XML 报告
  const sessionReportDir = path.join(REPORTS_BASE_DIR, sessionId);
  const xmlLocalPath = await downloadTestReport(deviceId, packageName, lib.path, sessionReportDir, (cmd) => {
    emit(sessionId, `[CMD] ${cmd}`);
  });

  let reportFile: string | undefined;
  if (xmlLocalPath) {
    reportFile = path.relative(sessionReportDir, xmlLocalPath);
    emit(sessionId, `[INFO] XML 报告已下载: ${reportFile}`);
    try {
      const xmlContent = fs.readFileSync(xmlLocalPath, "utf-8");
      const xmlResult = parseXmlReport(xmlContent);
      if (finalStatus !== "crash" && finalStatus !== "timeout") {
        finalStatus = xmlResult.passed ? "success" : "failed";
      }
      const failedFuncs = xmlResult.functions.filter((f) => f.hasFailed);
      if (failedFuncs.length > 0) {
        emit(sessionId, `[WARN] XML 报告: ${failedFuncs.length} 个测试函数失败`);
        for (const fn of failedFuncs.slice(0, 5)) {
          emit(sessionId, `[FAIL] 函数: ${fn.name}${fn.message ? " - " + fn.message.trim().slice(0, 120) : ""}`);
        }
      }
    } catch (e) {
      emit(sessionId, `[WARN] XML 解析失败: ${(e as Error).message}`);
    }
  } else {
    emit(sessionId, `[WARN] XML 报告下载失败`);
    if (finalStatus !== "crash" && finalStatus !== "timeout") {
      finalStatus = "failed";
    }
  }

  updateTestResult(sessionId, resultId, {
    status: finalStatus,
    endTime: new Date().toISOString(),
    crashLogs: crashLogFiles,
    reportFile,
  });

  emit(sessionId, `[RESULT] ${lib.name}: ${finalStatus.toUpperCase()} (重跑完成)`);

  // 重新计算 summary
  const store = await import("./store");
  const finalSession = store.getSession(sessionId);
  if (finalSession) {
    finalSession.summary = computeSummary(finalSession.results);
    upsertSession(finalSession);
    // 通知前端刷新
    const handlers = sessionLogHandlers.get(sessionId) ?? [];
    for (const h of handlers) {
      h(`__status__:${JSON.stringify(finalSession)}`);
    }
  }

  sessionStopFlags.delete(rerunId);
}
