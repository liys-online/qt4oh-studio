"use client";

import { use, useEffect, useRef, useState } from "react";
import { Spinner } from "@heroui/react";
import Link from "next/link";

interface TestResult {
  id: string;
  name: string;
  arch: string;
  module: string;
  status: "pending" | "running" | "success" | "failed" | "timeout" | "crash";
  duration?: number;
  output?: string;
}

interface Session {
  id: string;
  hapFile: string;
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
  };
}

interface LogEntry {
  time: string;
  message: string;
}

const statusStyle: Record<string, { bg: string; text: string; label: string }> = {
  pending:   { bg: "rgba(148,163,184,0.15)", text: "#94a3b8", label: "等待" },
  running:   { bg: "rgba(99,102,241,0.12)",  text: "#6366f1",  label: "运行中" },
  success:   { bg: "rgba(16,185,129,0.12)",  text: "#059669",  label: "通过" },
  failed:    { bg: "rgba(239,68,68,0.12)",   text: "#dc2626",  label: "失败" },
  timeout:   { bg: "rgba(245,158,11,0.12)",  text: "#d97706",  label: "超时" },
  crash:     { bg: "rgba(239,68,68,0.15)",   text: "#b91c1c",  label: "崩溃" },
};

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [session, setSession] = useState<Session | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [stopping, setStopping] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/tests/${id}`)
      .then((r) => r.json())
      .then((d) => setSession(d.session));

    const es = new EventSource(`/api/tests/${id}/stream`);
    setConnected(true);

    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "log") {
        setLogs((prev) => [...prev, { time: data.time, message: data.message }]);
      } else if (data.type === "status" || data.type === "done") {
        setSession(data.session);
        if (data.type === "done") {
          es.close();
          setConnected(false);
        }
      }
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
    };

    return () => es.close();
  }, [id]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleStop = async () => {
    setStopping(true);
    await fetch(`/api/tests/${id}`, { method: "DELETE" });
    setStopping(false);
  };

  if (!session) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  const summary = session.summary;
  const completed = session.results.filter(
    (r) => r.status !== "pending" && r.status !== "running"
  ).length;
  const total = session.results.length;

  const cardStyle = {
    background: "rgba(255,255,255,0.85)",
    backdropFilter: "blur(12px)",
    border: "1px solid rgba(255,255,255,0.9)",
  };

  const sessionStatusStyle =
    session.status === "completed"
      ? { bg: "rgba(16,185,129,0.1)", text: "#059669", label: "已完成" }
      : session.status === "running"
      ? { bg: "rgba(99,102,241,0.1)", text: "#6366f1", label: "运行中" }
      : { bg: "rgba(245,158,11,0.1)", text: "#d97706", label: "已停止" };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <Link
            href="/tests"
            className="mt-0.5 w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all hover:opacity-80"
            style={{ background: "rgba(99,102,241,0.1)" }}
          >
            <svg className="w-4 h-4" style={{ color: "#6366f1" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-gray-800 truncate">{session.hapFile}</h1>
              <span
                className="text-xs px-2.5 py-0.5 rounded-full font-medium shrink-0 flex items-center gap-1.5"
                style={{ background: sessionStatusStyle.bg, color: sessionStatusStyle.text }}
              >
                {session.status === "running" && (
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: sessionStatusStyle.text }} />
                )}
                {sessionStatusStyle.label}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              设备: {session.deviceId} · {new Date(session.startTime).toLocaleString("zh-CN")}
              {session.endTime && ` → ${new Date(session.endTime).toLocaleTimeString("zh-CN")}`}
            </p>
          </div>
        </div>
        <div className="shrink-0">
          {session.status === "running" ? (
            <button
              onClick={handleStop}
              disabled={stopping}
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
            <Link
              href={`/reports/${id}`}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-80"
              style={{ background: "rgba(99,102,241,0.1)", color: "#6366f1", border: "1px solid rgba(99,102,241,0.2)" }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              查看报告
            </Link>
          )}
        </div>
      </div>

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
                  { value: summary.success, color: "#10b981" },
                  { value: summary.timeout, color: "#f59e0b" },
                  { value: summary.crash,   color: "#ef4444" },
                  { value: summary.failed,  color: "#dc2626" },
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
              </div>
            </>
          ) : (
            <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.06)" }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${total > 0 ? (completed / total) * 100 : 0}%`,
                  background: "linear-gradient(90deg, #6366f1, #8b5cf6)",
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* 日志 + 结果 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 终端日志 */}
        <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center justify-between px-4 py-2.5" style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full" style={{ background: "#ef4444" }} />
              <span className="w-3 h-3 rounded-full" style={{ background: "#f59e0b" }} />
              <span className="w-3 h-3 rounded-full" style={{ background: "#10b981" }} />
              <span className="text-xs font-mono ml-2" style={{ color: "#64748b" }}>hdc_shell.log</span>
            </div>
            <div className="flex items-center gap-2">
              {connected && session.status === "running" && (
                <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "#10b981" }}>
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#10b981" }} />
                  LIVE
                </span>
              )}
              <span className="text-xs" style={{ color: "#475569" }}>{logs.length} 条</span>
            </div>
          </div>
          <div className="p-4 h-80 overflow-y-auto font-mono text-xs space-y-0.5">
            {logs.length === 0 ? (
              <p style={{ color: "#475569" }}>等待日志输出...</p>
            ) : (
              logs.map((log, i) => {
                const msg = log.message;
                const isError = msg.includes("[ERROR]") || msg.includes("[CRASH]");
                const isWarn  = msg.includes("[WARN]")  || msg.includes("[TIMEOUT]");
                const isDone  = msg.includes("[DONE]")  || msg.includes("[PASS]") || msg.includes("[START]");
                const isInfo  = msg.includes("[INFO]");
                const color = isError ? "#f87171" : isWarn ? "#fbbf24" : isDone ? "#34d399" : isInfo ? "#818cf8" : "#94a3b8";
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
        </div>

        {/* 测试结果列表 */}
        <div className="rounded-2xl p-5 shadow-sm" style={cardStyle}>
          <h2 className="text-sm font-semibold text-gray-800 mb-3">
            测试结果
            {total > 0 && <span className="text-gray-400 font-normal ml-1">({total})</span>}
          </h2>
          <div className="h-80 overflow-y-auto space-y-1.5 pr-1">
            {session.results.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10">
                <Spinner size="md" />
                <p className="text-xs text-gray-400">解析测试库中...</p>
              </div>
            ) : (
              session.results.map((result) => {
                const st = statusStyle[result.status] ?? statusStyle.pending;
                return (
                  <div
                    key={result.id}
                    className="flex items-center gap-2.5 p-2.5 rounded-xl"
                    style={{ background: "rgba(0,0,0,0.02)" }}
                  >
                    <span
                      className="shrink-0 text-xs px-2 py-0.5 rounded-full font-medium min-w-12 text-center inline-flex items-center justify-center gap-1"
                      style={{ background: st.bg, color: st.text }}
                    >
                      {result.status === "running" ? (
                        <>
                          <Spinner size="sm" color="current" className="w-3 h-3" />
                          运行
                        </>
                      ) : (
                        st.label
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono text-gray-700 truncate">{result.name}</p>
                      <p className="text-xs text-gray-400 truncate">{result.module} · {result.arch}</p>
                    </div>
                    {result.duration !== undefined && (
                      <span className="text-xs text-gray-400 shrink-0">{result.duration}s</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
