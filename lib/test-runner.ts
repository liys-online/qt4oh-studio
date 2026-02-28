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
  installHap,
} from "./hdc";
import { parseHap, filterTestLibs, type TestLib } from "./hap-parser";
import {
  upsertSession,
  updateTestResult,
  computeSummary,
  type TestSession,
  type TestResult,
} from "./store";

const FAULTLOG_DIR = path.join(process.cwd(), "data", "Faultlogger");

/** 全局存储运行中会话的日志回调，用于 SSE 推送 */
const sessionLogHandlers = new Map<string, ((line: string) => void)[]>();
/** 全局存储停止信号 */
const sessionStopFlags = new Map<string, boolean>();

export function registerLogHandler(sessionId: string, handler: (line: string) => void) {
  const handlers = sessionLogHandlers.get(sessionId) || [];
  handlers.push(handler);
  sessionLogHandlers.set(sessionId, handlers);
}

export function unregisterLogHandler(sessionId: string, handler: (line: string) => void) {
  const handlers = sessionLogHandlers.get(sessionId) || [];
  sessionLogHandlers.set(sessionId, handlers.filter((h) => h !== handler));
}

export function stopSession(sessionId: string) {
  sessionStopFlags.set(sessionId, true);
}

function emit(sessionId: string, line: string) {
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
  filterModule?: string;
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
    emit(sessionId, `[INFO] 正在安装 HAP: ${session.hapFile}`);
    const { success, message } = installHap(deviceId, hapFilePath, packageName);
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
    parseCrashLogs(getFaultLogs(deviceId), packageName)
  );
  emit(sessionId, `[INFO] 已记录 ${knownCrashLogs.size} 条已有崩溃日志`);

  // 5. 逐一运行测试
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
    const startOutput = startAbility(deviceId, packageName, abilityName, lib.path);
    if (startOutput) emit(sessionId, `[HDC] ${startOutput}`);

    // 等待进程启动
    await sleep(1000);

    // 等待进程结束 or 超时
    let elapsed = 0;
    let testStatus: "success" | "timeout" = "success";

    while (elapsed < timeout) {
      if (sessionStopFlags.get(sessionId)) break;
      if (!checkProcessRunning(deviceId, packageName)) {
        emit(sessionId, `[INFO] 测试完成 (${elapsed}s)`);
        break;
      }
      process.stdout.write(".");
      await sleep(2000);
      elapsed += 2;
    }

    if (elapsed >= timeout) {
      emit(sessionId, `[WARN] 测试超时 (${timeout}s)，强制终止`);
      killProcess(deviceId, packageName);
      await sleep(1000);
      testStatus = "timeout";
    }

    // 检查崩溃日志
    const currentCrashLogs = parseCrashLogs(getFaultLogs(deviceId), packageName);
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
        const ok = downloadFaultLog(deviceId, crashLog, FAULTLOG_DIR);
        emit(sessionId, ok ? `[INFO] 已下载崩溃日志: ${crashLog}` : `[WARN] 下载失败: ${crashLog}`);
      }
    }

    result.status = finalStatus;
    result.endTime = new Date().toISOString();
    result.crashLogs = crashLogFiles;
    updateTestResult(sessionId, result.id, {
      status: finalStatus,
      endTime: result.endTime,
      crashLogs: crashLogFiles,
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
}
