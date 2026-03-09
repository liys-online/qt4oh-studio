"use client";

import { use, useEffect, useRef, useState } from "react";
import { Spinner } from "@heroui/react";
import Link from "next/link";
import TestResultsList from "@/components/TestResultsList";

interface TestResult {
  id: string;
  name: string;
  arch: string;
  module: string;
  status: "pending" | "running" | "success" | "failed" | "timeout" | "crash" | "interrupted";
  duration?: number;
  output?: string;
}

interface Session {
  id: string;
  hapFile: string;
  hapFilePath?: string;
  deviceId: string;
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
    interrupted: number;
  };
}

interface LogEntry {
  time: string;
  message: string;
}

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [testCmdLogs, setTestCmdLogs] = useState<Record<string, LogEntry[]>>({});
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [logCollapsed, setLogCollapsed] = useState(false);
  // 重跑相关
  const [rerunningId, setRerunningId] = useState<string | null>(null);
  const [showChangeHap, setShowChangeHap] = useState(false);
  const [newHapPath, setNewHapPath] = useState("");
  const newHapFileRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const resultsEndRef = useRef<HTMLDivElement>(null);
  const currentTestIdRef = useRef<string | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const pendingGroupsRef = useRef<{ soName: string; entries: LogEntry[] }[]>([]);

  useEffect(() => {
    // Flush buffered pending log groups to testCmdLogs once sessionRef has results.
    // Pending groups are created when a runTestLib CMD arrives before sessionRef is populated.
    const flushPendingGroups = () => {
      if (!pendingGroupsRef.current.length || !sessionRef.current?.results.length) return;
      const groups = pendingGroupsRef.current.splice(0);
      const updates: Record<string, LogEntry[]> = {};
      for (const group of groups) {
        const result = sessionRef.current!.results.find((r) => r.name === group.soName);
        if (result) updates[result.id] = [...(updates[result.id] ?? []), ...group.entries];
      }
      if (Object.keys(updates).length) {
        setTestCmdLogs((prev) => {
          const next = { ...prev };
          for (const [id, entries] of Object.entries(updates)) next[id] = [...(next[id] ?? []), ...entries];
          return next;
        });
      }
    };

    fetch(`/api/tests/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setSession(d.session ?? null);
        sessionRef.current = d.session ?? null;
        setSessionLoading(false);
        // 初始数据到位后立即尝试刷新：历史日志回放可能比 fetch 更早完成
        flushPendingGroups();
      })
      .catch(() => setSessionLoading(false));

    const es = new EventSource(`/api/tests/${id}/stream`);

    es.onopen = () => setConnected(true);

    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "log") {
        const entry: LogEntry = { time: data.time, message: data.message };
        setLogs((prev) => [...prev, entry]);
        const msg: string = data.message;
        const isTestLog =
          msg.startsWith("[CMD]") ||
          msg.startsWith("[HDC]") ||
          msg.startsWith("[WARN]") ||
          msg.startsWith("[FAIL]") ||
          msg.startsWith("[RESULT]") ||
          (msg.startsWith("[INFO]") && (
            msg.includes("测试完成") ||
            msg.includes("XML 报告")
          ));
        if (isTestLog) {
          let buffered = false;
          if (msg.startsWith("[CMD]") && msg.includes("runTestLib")) {
            const soMatch = msg.match(/runTestLib\s+(\S+\.so)/);
            if (soMatch) {
              const soName = soMatch[1].split("/").pop() ?? "";
              const matched = sessionRef.current?.results.find((r) => r.name === soName);
              if (matched) {
                // sessionRef has results: flush any previously buffered groups, then switch
                flushPendingGroups();
                currentTestIdRef.current = matched.id;
              } else {
                // sessionRef empty/stale: start a new pending group for this test
                pendingGroupsRef.current.push({ soName, entries: [entry] });
                buffered = true;
              }
            }
          } else if (!currentTestIdRef.current && pendingGroupsRef.current.length > 0) {
            // Non-runTestLib log with no active test: append to last pending group
            pendingGroupsRef.current[pendingGroupsRef.current.length - 1].entries.push(entry);
            buffered = true;
          }
          if (!buffered && currentTestIdRef.current) {
            const tid = currentTestIdRef.current;
            setTestCmdLogs((prev) => ({ ...prev, [tid]: [...(prev[tid] ?? []), entry] }));
          }
        }
      } else if (data.type === "status" || data.type === "done") {
        setSession(data.session);
        sessionRef.current = data.session;
        flushPendingGroups();
        const running = (data.session.results as TestResult[]).find((r) => r.status === "running");
        currentTestIdRef.current = running?.id ?? null;
        // 重跑结束时，清除 rerunningId、广播通知列表页刷新
        if (!running) {
          setRerunningId(null);
          try { new BroadcastChannel("qt4oh_sessions").postMessage({ type: "updated", id }); } catch { /* ignore */ }
        }
        if (data.type === "done") {
          // 不关闭 SSE —— 保持连接以便重跑时接收 __status__ 推送
          setConnected(false);
        }
      }
    };

    es.onerror = () => {
      setConnected(false);
      // onerror 时才真正关闭
      es.close();
    };

    return () => es.close();
  }, [id]);

  // 轮询兜底：重跑期间每 2s 检查状态，防止 SSE 事件丢失导致按钮永久禁用
  useEffect(() => {
    if (!rerunningId) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/tests/${id}`);
        const data = await res.json();
        const results = (data.session?.results ?? []) as { id: string; status: string }[];
        const target = results.find((r) => r.id === rerunningId);
        if (!target || (target.status !== "running" && target.status !== "pending")) {
          setRerunningId(null);
        }
      } catch { /* 忽略网络错误 */ }
    }, 2000);
    return () => clearInterval(timer);
  }, [rerunningId, id]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    resultsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.results, testCmdLogs]);

  const handleStop = async () => {
    setStopping(true);
    await fetch(`/api/tests/${id}`, { method: "DELETE" });
    setStopping(false);
  };

  const handleRerun = async (resultId: string, hapFilePath?: string) => {
    if (rerunningId) return; // 同时只允许一个重跑
    setRerunningId(resultId);
    try {
      const res = await fetch(`/api/tests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resultId,
          ...(hapFilePath ? { hapFilePath } : {}),
          skipInstall: !hapFilePath, // 没有新 HAP 则跳过安装
        }),
      });
      if (!res.ok) {
        let msg = res.statusText;
        try { const t = await res.text(); const d = JSON.parse(t); msg = d.error || msg; } catch { /* non-json */ }
        alert("重跑失败: " + msg);
        setRerunningId(null);
      }
      // 成功后由 SSE 推送状态更新，rerunningId 在 done/status 消息中清除
    } catch (e) {
      alert("重跑失败: " + (e as Error).message);
      setRerunningId(null);
    }
  };

  const handleChangeHapFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const localPath = (file as unknown as { path?: string }).path;
    if (localPath) {
      setNewHapPath(localPath);
    } else {
      alert("请在 Electron 桌面客户端中使用此功能");
    }
  };

  const summary = session?.summary;
  const completed = (session?.results ?? []).filter(
    (r) => r.status !== "pending" && r.status !== "running"
  ).length;
  const total = session?.results.length ?? 0;

  const cardStyle = {
    background: "rgba(255,255,255,0.85)",
    backdropFilter: "blur(12px)",
    border: "1px solid rgba(255,255,255,0.9)",
  };

  const sessionStatusStyle = sessionLoading
    ? { bg: "rgba(65,205,82,0.1)", text: "#1d7a2e", label: "启动中..." }
    : session?.status === "completed"
    ? { bg: "rgba(16,185,129,0.1)", text: "#059669", label: "已完成" }
    : session?.status === "running"
    ? { bg: "rgba(65,205,82,0.1)", text: "#1d7a2e", label: "运行中" }
    : { bg: "rgba(245,158,11,0.1)", text: "#d97706", label: "已停止" };

  return (
    <div className="flex flex-col gap-6" style={{ height: "calc(100vh - 48px)", overflow: "hidden" }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <Link
            href="/tests"
            className="mt-0.5 w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all hover:opacity-80"
            style={{ background: "rgba(65,205,82,0.08)" }}
          >
            <svg className="w-4 h-4" style={{ color: "#41CD52" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-gray-800 truncate">{session?.hapFile ?? "测试会话"}</h1>
              <span
                className="text-xs px-2.5 py-0.5 rounded-full font-medium shrink-0 flex items-center gap-1.5"
                style={{ background: sessionStatusStyle.bg, color: sessionStatusStyle.text }}
              >
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: sessionStatusStyle.text }} />
                {sessionStatusStyle.label}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {session
                ? `设备: ${session.deviceId} · ${new Date(session.startTime).toLocaleString("zh-CN")}${session.endTime ? ` → ${new Date(session.endTime).toLocaleTimeString("zh-CN")}` : ""}`
                : `会话 ID: ${id}`}
            </p>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {(!session || session.status === "running") ? (
            <button
              onClick={handleStop}
              disabled={stopping || !session}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-80 disabled:opacity-50"
              style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}
            >
              {stopping ? (
                <Spinner size="sm" />
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10h6v4H9z" />
                </svg>
              )}
              停止测试
            </button>
          ) : (
            <>
              <button
                onClick={() => setShowChangeHap((v) => !v)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-80"
                style={{ background: "rgba(99,102,241,0.08)", color: "#6366f1", border: "1px solid rgba(99,102,241,0.2)" }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                更换 HAP
              </button>
              <Link
                href={`/reports/${id}`}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-80"
                style={{ background: "rgba(65,205,82,0.08)", color: "#1d7a2e", border: "1px solid rgba(65,205,82,0.2)" }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                查看报告
              </Link>
            </>
          )}
        </div>
      </div>

      {/* 更换 HAP 面板 */}
      {showChangeHap && session?.status !== "running" && (
        <div className="rounded-2xl p-4 shadow-sm" style={{ background: "rgba(99,102,241,0.06)", border: "1.5px solid rgba(99,102,241,0.18)" }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold" style={{ color: "#6366f1" }}>更换 HAP 包</p>
              <p className="text-xs text-gray-400 mt-0.5">
                当前：{session?.hapFile}
                {session?.hapFilePath && <span className="ml-1 text-gray-300 font-mono text-xs truncate max-w-xs inline-block align-bottom">{session.hapFilePath}</span>}
              </p>
            </div>
            <button onClick={() => { setShowChangeHap(false); setNewHapPath(""); }} className="text-gray-300 hover:text-gray-500">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-3">
            <input ref={newHapFileRef} type="file" accept=".hap" className="hidden" onChange={handleChangeHapFile} />
            <button
              onClick={() => newHapFileRef.current?.click()}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-80"
              style={{ background: "rgba(99,102,241,0.12)", color: "#6366f1", border: "1px solid rgba(99,102,241,0.2)" }}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              选择新 HAP
            </button>
            {newHapPath ? (
              <span className="flex-1 text-xs font-mono text-gray-600 truncate">{newHapPath}</span>
            ) : (
              <span className="flex-1 text-xs text-gray-400">未选择，重跑时将使用原 HAP 包</span>
            )}
            {newHapPath && (
              <button
                onClick={() => setNewHapPath("")}
                className="text-xs text-gray-300 hover:text-red-400"
              >
                清除
              </button>
            )}
          </div>
          {newHapPath && (
            <p className="text-xs mt-2" style={{ color: "#6366f1" }}>
              重跑时将自动重新安装此 HAP 包
            </p>
          )}
        </div>
      )}

      {/* 进度卡片 */}
      {total > 0 && (
        <div className="rounded-2xl p-5 shadow-sm" style={cardStyle}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-gray-700">测试进度</span>
            <span className="text-sm font-bold text-gray-800">{completed} / {total}</span>
          </div>
          {summary ? (
            <>
              <div className="flex rounded-full overflow-hidden h-2.5 mb-3" style={{ background: "rgba(0,0,0,0.06)" }}>
                {[
                  { value: summary.success,     color: "#10b981" },
                  { value: summary.timeout,     color: "#f59e0b" },
                  { value: summary.crash,       color: "#ef4444" },
                  { value: summary.failed,      color: "#dc2626" },
                  { value: summary.interrupted ?? 0, color: "#6366f1" },
                ].map((seg, i) => {
                  const pct = (seg.value / total) * 100;
                  return pct > 0 ? (
                    <div key={i} style={{ width: `${pct}%`, background: seg.color }} />
                  ) : null;
                })}
              </div>
              <div className="flex gap-4 text-xs">
                <span className="font-medium" style={{ color: "#10b981" }}>✓ {summary.success} 通过</span>
                <span style={{ color: "#f59e0b" }}>⏱ {summary.timeout} 超时</span>
                <span style={{ color: "#ef4444" }}>💥 {summary.crash} 崩溃</span>
                <span style={{ color: "#dc2626" }}>✗ {summary.failed} 失败</span>
                {(summary.interrupted ?? 0) > 0 && (
                  <span style={{ color: "#6366f1" }}>■ {summary.interrupted} 中断</span>
                )}
              </div>
            </>
          ) : (
            <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.06)" }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${total > 0 ? (completed / total) * 100 : 0}%`,
                  background: "linear-gradient(90deg, #41CD52, #21a834)",
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* 测试结果列表 - 全宽，复用报告分析列表组件，带单条日志展开 */}
      <TestResultsList
        results={session?.results ?? []}
        sessionStatus={session?.status ?? ""}
        rerunningId={rerunningId}
        onRerun={(resultId) => handleRerun(resultId, newHapPath || undefined)}
        logData={testCmdLogs}
        expandedIds={expandedIds}
        onToggleExpand={(rid) => setExpandedIds((prev) => {
          const next = new Set(prev);
          if (next.has(rid)) { next.delete(rid); } else { next.add(rid); }
          return next;
        })}
        listEndRef={resultsEndRef}
        excludePending
        fillHeight
        loadingLabel={sessionLoading ? "连接中..." : "解析测试库中..."}
      />

      {/* 终端日志 - 全宽，位于结果列表下方 */}
      <div className="rounded-2xl overflow-hidden shadow-sm shrink-0" style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.06)" }}>
        <div
          className="flex items-center justify-between px-4 py-2.5 cursor-pointer select-none"
          style={{ background: "rgba(255,255,255,0.04)", borderBottom: logCollapsed ? "none" : "1px solid rgba(255,255,255,0.06)" }}
          onClick={() => setLogCollapsed((v) => !v)}
        >
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full" style={{ background: "#ef4444" }} />
            <span className="w-3 h-3 rounded-full" style={{ background: "#f59e0b" }} />
            <span className="w-3 h-3 rounded-full" style={{ background: "#10b981" }} />
            <span className="text-xs font-mono ml-2" style={{ color: "#64748b" }}>hdc_shell.log</span>
          </div>
          <div className="flex items-center gap-2">
            {connected && (session?.status === "running" || sessionLoading) && (
              <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "#10b981" }}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#10b981" }} />
                LIVE
              </span>
            )}
            <span className="text-xs" style={{ color: "#475569" }}>{logs.length} 条</span>
            <svg
              className="w-3.5 h-3.5 transition-transform"
              style={{ color: "#475569", transform: logCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        {!logCollapsed && (
        <div className="p-4 h-96 overflow-y-auto font-mono text-xs space-y-0.5">
          {logs.length === 0 ? (
            <p style={{ color: "#475569" }}>等待日志输出...</p>
          ) : (
            logs.filter((log) => {
              const msg = log.message;
              return !(
                msg.startsWith("[CMD]") ||
                msg.startsWith("[HDC]") ||
                msg.startsWith("[WARN]") ||
                msg.startsWith("[FAIL]") ||
                msg.startsWith("[RESULT]") ||
                (msg.startsWith("[INFO]") && (
                  msg.includes("测试完成") ||
                  msg.includes("XML 报告") ||
                  /^\[INFO\] \[\d+\/\d+\] 运行:/.test(msg)
                ))
              );
            }).map((log, i) => {
              const msg = log.message;
              const isCmd    = msg.startsWith("[CMD]");
              const isHdc    = msg.startsWith("[HDC]");
              const isPhase  = msg.includes("── 阶段");
              const isError  = msg.includes("[ERROR]") || msg.includes("[CRASH]");
              const isWarn   = msg.includes("[WARN]")  || msg.includes("[TIMEOUT]");
              const isDone   = msg.includes("[DONE]")  || msg.includes("[PASS]") || msg.includes("[START]");
              const isResult = msg.includes("[RESULT]");
              const isInfo   = msg.includes("[INFO]");

              if (isPhase) {
                return (
                  <div key={i} className="leading-5 mt-2 mb-1">
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(99,102,241,0.2)", color: "#a5b4fc" }}>
                      {msg.replace("[INFO] ", "")}
                    </span>
                  </div>
                );
              }

              if (isCmd) {
                return (
                  <div key={i} className="leading-5 flex gap-2 mt-0.5">
                    <span className="shrink-0" style={{ color: "#475569" }}>
                      {new Date(log.time).toLocaleTimeString("zh-CN")}
                    </span>
                    <span className="flex gap-1 font-mono" style={{ color: "#86efac" }}>
                      <span style={{ color: "#4ade80", userSelect: "none" }}>$</span>
                      <span>{msg.replace("[CMD] ", "")}</span>
                    </span>
                  </div>
                );
              }

              if (isHdc) {
                return (
                  <div key={i} className="leading-5 flex gap-2">
                    <span className="shrink-0" style={{ color: "#475569" }}>
                      {new Date(log.time).toLocaleTimeString("zh-CN")}
                    </span>
                    <span style={{ color: "#67e8f9" }}>{msg}</span>
                  </div>
                );
              }

              const color = isError ? "#f87171" : isWarn ? "#fbbf24" : isDone ? "#34d399" : isResult ? "#c084fc" : isInfo ? "#818cf8" : "#94a3b8";
              return (
                <div key={i} className="leading-5 flex gap-2">
                  <span className="shrink-0" style={{ color: "#475569" }}>
                    {new Date(log.time).toLocaleTimeString("zh-CN")}
                  </span>
                  <span style={{ color }}>{msg}</span>
                </div>
              );
            })
          )}
          <div ref={logEndRef} />
        </div>
        )}
      </div>
    </div>
  );
}
