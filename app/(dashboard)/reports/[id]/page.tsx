"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Spinner } from "@heroui/react";

interface TestResult {
  id: string;
  name: string;
  module: string;
  arch: string;
  path: string;
  status: "success" | "timeout" | "crash" | "failed" | "pending" | "running";
  duration?: number;
  crashLogs?: string[];
  reportFile?: string;
}

interface XmlFunction {
  name: string;
  type: string;
  message?: string;
  dataTags: string[];
  durationMs?: number;
  hasFailed: boolean;
}

interface XmlReport {
  testCaseName: string;
  qtVersion?: string;
  totalDurationMs?: number;
  functions: XmlFunction[];
  passed: boolean;
}

interface Summary {
  total: number;
  success: number;
  timeout: number;
  crash: number;
  failed: number;
}

interface Session {
  id: string;
  hapFile: string;
  hapFilePath?: string;
  deviceId: string;
  status: string;
  startTime: string;
  endTime?: string;
  results: TestResult[];
  summary?: Summary;
}

const statusStyle: Record<string, { bg: string; text: string; label: string; dot: string }> = {
  success: { bg: "rgba(16,185,129,0.12)", text: "#059669", label: "通过", dot: "#10b981" },
  timeout: { bg: "rgba(245,158,11,0.12)", text: "#d97706", label: "超时", dot: "#f59e0b" },
  crash:   { bg: "rgba(239,68,68,0.12)",  text: "#dc2626", label: "崩溃", dot: "#ef4444" },
  failed:  { bg: "rgba(239,68,68,0.12)",  text: "#dc2626", label: "失败", dot: "#ef4444" },
  running: { bg: "rgba(65,205,82,0.12)", text: "#1d7a2e", label: "运行中", dot: "#41CD52" },
  pending: { bg: "rgba(148,163,184,0.12)", text: "#64748b", label: "等待", dot: "#94a3b8" },
};

const sessionStatusStyle: Record<string, { bg: string; text: string; label: string }> = {
  completed: { bg: "rgba(16,185,129,0.15)", text: "#059669", label: "已完成" },
  running:   { bg: "rgba(65,205,82,0.15)", text: "#1d7a2e", label: "运行中" },
  stopped:   { bg: "rgba(148,163,184,0.15)", text: "#64748b", label: "已停止" },
};

export default function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [session, setSession] = useState<Session | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterModule, setFilterModule] = useState<string>("all");
  const [selectedCrash, setSelectedCrash] = useState<string | null>(null);
  const [crashContent, setCrashContent] = useState("");
  const [crashLoading, setCrashLoading] = useState(false);
  const [selectedReport, setSelectedReport] = useState<{ resultId: string; sessionId: string; file: string } | null>(null);
  const [xmlReport, setXmlReport] = useState<XmlReport | null>(null);
  const [xmlLoading, setXmlLoading] = useState(false);
  const [xmlError, setXmlError] = useState<string | null>(null);
  // 重跑相关
  const [rerunningId, setRerunningId] = useState<string | null>(null);
  const [showChangeHap, setShowChangeHap] = useState(false);
  const [newHapPath, setNewHapPath] = useState("");
  const newHapFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/tests/${id}`)
      .then((r) => r.json())
      .then((d) => setSession(d.session));
  }, [id]);

  // SSE：接收重跑推送的实时状态更新
  useEffect(() => {
    const es = new EventSource(`/api/tests/${id}/stream`);
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "status" || data.type === "done") {
        setSession(data.session);
        const running = (data.session.results as TestResult[]).find((r: TestResult) => r.status === "running");
        if (!running) setRerunningId(null);
      }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [id]);

  const handleRerun = async (resultId: string, hapFilePath?: string) => {
    if (rerunningId) return;
    setRerunningId(resultId);
    try {
      const res = await fetch(`/api/tests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resultId,
          ...(hapFilePath ? { hapFilePath } : {}),
          skipInstall: !hapFilePath,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        alert("重跑失败: " + (d.error || res.statusText));
        setRerunningId(null);
      }
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

  const openCrash = async (filename: string) => {
    setSelectedCrash(filename);
    setCrashLoading(true);
    setCrashContent("");
    const res = await fetch(`/api/reports/crash/${filename}`);
    const data = await res.json();
    setCrashContent(data.content || data.error || "");
    setCrashLoading(false);
  };

  const openReport = async (result: TestResult) => {
    if (!result.reportFile || !session) return;
    setSelectedReport({ resultId: result.id, sessionId: session.id, file: result.reportFile });
    setXmlReport(null);
    setXmlError(null);
    setXmlLoading(true);
    const urlPath = result.reportFile.replace(/\\/g, "/");
    const url = `/api/reports/xml/${session.id}/${urlPath}`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok) {
        setXmlReport(data);
      } else {
        setXmlError(data.error ?? `HTTP ${res.status}`);
      }
    } catch (e) {
      setXmlError((e as Error).message);
    } finally {
      setXmlLoading(false);
    }
  };

  if (!session) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 256 }}>
        <Spinner label="加载中..." />
      </div>
    );
  }

  const modules = ["all", ...Array.from(new Set(session.results.map((r) => r.module)))];
  const statusFilters = ["all", "success", "timeout", "crash", "failed"];

  const filtered = session.results.filter((r) => {
    const matchStatus = filterStatus === "all" || r.status === filterStatus;
    const matchModule = filterModule === "all" || r.module === filterModule;
    return matchStatus && matchModule;
  });

  const summary = session.summary;
  const passRate = summary && summary.total > 0
    ? Math.round((summary.success / summary.total) * 100)
    : 0;

  const sStyle = sessionStatusStyle[session.status] ?? { bg: "rgba(148,163,184,0.15)", text: "#64748b", label: session.status };

  const glass = {
    background: "rgba(255,255,255,0.85)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border: "1px solid rgba(255,255,255,0.9)",
    borderRadius: 16,
    boxShadow: "0 4px 24px rgba(65,205,82,0.05)",
  } as React.CSSProperties;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Link
          href="/reports"
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 34, height: 34, borderRadius: 10,
            background: "rgba(65,205,82,0.08)", color: "#1d7a2e",
            textDecoration: "none", flexShrink: 0,
          }}
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "#1d252c", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {session.hapFile}
          </h1>
          <p style={{ fontSize: 12, color: "#94a3b8", margin: "2px 0 0" }}>
            {session.deviceId} · {new Date(session.startTime).toLocaleString("zh-CN")}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {session.status !== "running" && (
            <button
              onClick={() => setShowChangeHap((v) => !v)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "6px 14px", borderRadius: 10, fontSize: 12, fontWeight: 600,
                background: showChangeHap ? "rgba(99,102,241,0.15)" : "rgba(99,102,241,0.08)",
                color: "#6366f1", border: "1px solid rgba(99,102,241,0.2)", cursor: "pointer",
              }}
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              更换 HAP
            </button>
          )}
          <span style={{
            padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
            background: sStyle.bg, color: sStyle.text,
          }}>
            {sStyle.label}
          </span>
        </div>
      </div>

      {/* 更换 HAP 面板 */}
      {showChangeHap && session.status !== "running" && (
        <div style={{
          padding: 16, borderRadius: 14,
          background: "rgba(99,102,241,0.06)", border: "1.5px solid rgba(99,102,241,0.18)",
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#6366f1", margin: 0 }}>更换 HAP 包</p>
              <p style={{ fontSize: 11, color: "#94a3b8", margin: "3px 0 0" }}>
                当前：{session.hapFile}
                {session.hapFilePath && (
                  <span style={{ marginLeft: 6, fontFamily: "monospace", fontSize: 11, color: "#c7d2fe" }}>{session.hapFilePath}</span>
                )}
              </p>
            </div>
            <button
              onClick={() => { setShowChangeHap(false); setNewHapPath(""); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 18, lineHeight: 1, padding: "0 4px" }}
            >✕</button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input ref={newHapFileRef} type="file" accept=".hap" style={{ display: "none" }} onChange={handleChangeHapFile} />
            <button
              onClick={() => newHapFileRef.current?.click()}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: "rgba(99,102,241,0.12)", color: "#6366f1",
                border: "1px solid rgba(99,102,241,0.2)", cursor: "pointer",
              }}
            >
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              选择新 HAP
            </button>
            {newHapPath ? (
              <>
                <span style={{ flex: 1, fontSize: 12, fontFamily: "monospace", color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{newHapPath}</span>
                <button onClick={() => setNewHapPath("")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "#94a3b8" }}>清除</button>
              </>
            ) : (
              <span style={{ flex: 1, fontSize: 12, color: "#94a3b8" }}>未选择，重跑时将使用原 HAP 包</span>
            )}
          </div>
          {newHapPath && (
            <p style={{ fontSize: 11, color: "#6366f1", margin: "8px 0 0" }}>重跑时将自动重新安装此 HAP 包</p>
          )}
        </div>
      )}

      {/* 统计卡片 */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
          {[
            { label: "总计", value: summary.total, color: "#1d252c", accent: "#41CD52" },
            { label: "通过", value: summary.success, color: "#059669", accent: "#10b981" },
            { label: "超时", value: summary.timeout, color: "#d97706", accent: "#f59e0b" },
            { label: "崩溃", value: summary.crash, color: "#dc2626", accent: "#ef4444" },
            { label: "失败", value: summary.failed, color: "#dc2626", accent: "#ef4444" },
          ].map((item) => (
            <div key={item.label} style={{ ...glass, padding: "14px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: item.color, lineHeight: 1 }}>{item.value}</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>{item.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* 通过率 */}
      {summary && (
        <div style={{ ...glass, padding: "16px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: "#64748b" }}>通过率</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: "#1e1b4b" }}>{passRate}%</span>
          </div>
          <div style={{ width: "100%", height: 8, borderRadius: 4, background: "rgba(65,205,82,0.12)", overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 4,
              width: `${passRate}%`,
              background: "linear-gradient(90deg, #10b981, #059669)",
              transition: "width 0.6s ease",
            }} />
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
            {[
              { label: "通过", value: summary.success, color: "#10b981" },
              { label: "超时", value: summary.timeout, color: "#f59e0b" },
              { label: "崩溃", value: summary.crash, color: "#ef4444" },
              { label: "失败", value: summary.failed, color: "#ef4444" },
            ].map((seg) => (
              <div key={seg.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#64748b" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: seg.color, display: "inline-block" }} />
                {seg.label} {seg.value}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 过滤器 */}
      <div style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        paddingTop: 10,
        paddingBottom: 10,
        paddingLeft: 32,
        paddingRight: 32,
        margin: "0 -32px",
        background: "rgba(244,246,248,0.98)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        boxShadow: "0 2px 16px rgba(0,0,0,0.06), 0 1px 0 rgba(65,205,82,0.10)",
      }}>
        {/* 状态过滤 */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {statusFilters.map((s) => {
            const active = filterStatus === s;
            const style = s !== "all" ? statusStyle[s] : null;
            return (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                style={{
                  padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                  border: "none", cursor: "pointer", transition: "all 0.15s",
                  background: active
                    ? (style ? style.bg : "rgba(65,205,82,0.15)")
                    : "rgba(255,255,255,0.7)",
                  color: active
                    ? (style ? style.text : "#1d7a2e")
                    : "#94a3b8",
                  boxShadow: active ? "0 2px 8px rgba(0,0,0,0.08)" : "none",
                }}
              >
                {s === "all" ? "全部" : statusStyle[s]?.label ?? s}
              </button>
            );
          })}
        </div>
        {/* 模块过滤 */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {modules.map((m) => {
            const active = filterModule === m;
            return (
              <button
                key={m}
                onClick={() => setFilterModule(m)}
                style={{
                  padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 500,
                  border: "none", cursor: "pointer", transition: "all 0.15s",
                  background: active ? "rgba(65,205,82,0.15)" : "rgba(255,255,255,0.7)",
                  color: active ? "#1d7a2e" : "#94a3b8",
                  boxShadow: active ? "0 2px 8px rgba(0,0,0,0.08)" : "none",
                }}
              >
                {m === "all" ? "全部模块" : m}
              </button>
            );
          })}
        </div>
      </div>

      {/* 结果列表 */}
      <div style={{ ...glass, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(65,205,82,0.08)" }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: "#1d252c", margin: 0 }}>
            测试结果
            <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 500, color: "#94a3b8" }}>({filtered.length})</span>
          </h2>
        </div>
        <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
          {filtered.length === 0 && (
            <p style={{ textAlign: "center", color: "#94a3b8", fontSize: 13, padding: "32px 0" }}>
              没有符合条件的结果
            </p>
          )}
          {filtered.map((result) => {
            const rs = statusStyle[result.status] ?? { bg: "rgba(148,163,184,0.1)", text: "#64748b", label: result.status, dot: "#94a3b8" };
            return (
              <div
                key={result.id}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 12px", borderRadius: 12,
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(65,205,82,0.04)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {/* 状态徽章 */}
                <span style={{
                  padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                  background: rs.bg, color: rs.text, flexShrink: 0, minWidth: 48, textAlign: "center",
                }}>
                  {rs.label}
                </span>
                {/* 信息 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontFamily: "monospace", color: "#1d252c", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {result.name}
                  </p>
                  <p style={{ fontSize: 11, color: "#94a3b8", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {result.module} · {result.arch} · {result.path}
                  </p>
                </div>
                {/* 崩溃日志按钮 */}
                {result.crashLogs && result.crashLogs.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {result.crashLogs.map((f) => (
                      <button
                        key={f}
                        onClick={() => openCrash(f)}
                        style={{
                          padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                          border: "none", cursor: "pointer",
                          background: "rgba(239,68,68,0.12)", color: "#dc2626",
                          transition: "background 0.15s",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(239,68,68,0.2)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(239,68,68,0.12)")}
                      >
                        崩溃日志
                      </button>
                    ))}
                  </div>
                )}
                {/* XML 报告按钮 */}
                {result.reportFile && (
                  <button
                    onClick={() => openReport(result)}
                    style={{
                      padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                      border: "none", cursor: "pointer", flexShrink: 0,
                      background: "rgba(65,205,82,0.1)", color: "#1d7a2e",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(65,205,82,0.2)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(65,205,82,0.1)")}
                  >
                    查看报告
                  </button>
                )}
                {/* 重跑按钮 */}
                {(result.status === "failed" || result.status === "timeout" || result.status === "crash") &&
                  session.status !== "running" && (
                  <button
                    onClick={() => handleRerun(result.id, newHapPath || undefined)}
                    disabled={!!rerunningId}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                      border: "none", cursor: rerunningId ? "not-allowed" : "pointer", flexShrink: 0,
                      background: rerunningId === result.id ? "rgba(99,102,241,0.18)" : "rgba(99,102,241,0.1)",
                      color: "#6366f1", opacity: rerunningId && rerunningId !== result.id ? 0.5 : 1,
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => { if (!rerunningId) e.currentTarget.style.background = "rgba(99,102,241,0.2)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = rerunningId === result.id ? "rgba(99,102,241,0.18)" : "rgba(99,102,241,0.1)"; }}
                  >
                    {rerunningId === result.id ? (
                      <>
                        <svg style={{ animation: "spin 1s linear infinite" }} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        重跑中
                      </>
                    ) : "重跑"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 崩溃日志 Modal（原生实现，避免 HeroUI portal 问题） */}
      {!!selectedCrash && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "24px 16px",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedCrash(null); }}
        >
          <div style={{
            background: "#fff", borderRadius: 20, boxShadow: "0 24px 80px rgba(0,0,0,0.18)",
            width: "100%", maxWidth: 800, maxHeight: "85vh",
            display: "flex", flexDirection: "column", overflow: "hidden",
          }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid rgba(0,0,0,0.06)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontFamily: "monospace", fontSize: 13, color: "#1e1b4b", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedCrash}</span>
              <button
                onClick={() => setSelectedCrash(null)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 20, lineHeight: 1, padding: "0 4px", flexShrink: 0 }}
              >✕</button>
            </div>
            <div style={{ overflowY: "auto", padding: 16 }}>
              {crashLoading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "32px 0" }}>
                  <Spinner />
                </div>
              ) : (
                <pre style={{
                  background: "#0f172a", color: "#cbd5e1",
                  borderRadius: 12, padding: 16, fontSize: 12,
                  fontFamily: "monospace", overflowX: "auto",
                  whiteSpace: "pre-wrap", margin: 0,
                }}>
                  {crashContent || "（文件为空）"}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* XML 报告可视化 Modal（原生实现，避免 HeroUI portal 问题） */}
      {!!selectedReport && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "24px 16px",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) { setSelectedReport(null); setXmlReport(null); } }}
        >
          <div style={{
            background: "#fff", borderRadius: 20, boxShadow: "0 24px 80px rgba(0,0,0,0.18)",
            width: "100%", maxWidth: 800, maxHeight: "85vh",
            display: "flex", flexDirection: "column", overflow: "hidden",
          }}>
            {/* Header */}
            <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid rgba(0,0,0,0.06)", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#1d252c" }}>
                    {xmlReport?.testCaseName ?? selectedReport?.file ?? "测试报告"}
                  </div>
                  {xmlReport?.qtVersion && (
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>Qt {xmlReport.qtVersion}</div>
                  )}
                </div>
                <button
                  onClick={() => { setSelectedReport(null); setXmlReport(null); }}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#94a3b8", lineHeight: 1, padding: "2px 6px" }}
                >
                  ×
                </button>
              </div>
            </div>
            {/* Body */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px 24px" }}>
            {xmlLoading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "32px 0" }}>
                <Spinner label="解析中..." />
              </div>
            ) : xmlError ? (
              <div style={{ padding: "24px 0", textAlign: "center" }}>
                <p style={{ color: "#dc2626", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>报告加载失败</p>
                <p style={{ color: "#94a3b8", fontSize: 12, fontFamily: "monospace" }}>{xmlError}</p>
                <p style={{ color: "#cbd5e1", fontSize: 11, marginTop: 8 }}>
                  {`/api/reports/xml/${selectedReport?.sessionId}/${selectedReport?.file?.replace(/\\/g, "/")}`}
                </p>
              </div>
            ) : !xmlReport ? (
              <p style={{ textAlign: "center", color: "#94a3b8", padding: "32px 0" }}>报告加载失败</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* 概要卡片 */}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {[
                      { label: "总函数", value: xmlReport.functions.length, color: "#1d252c" },
                    { label: "通过", value: xmlReport.functions.filter((f) => !f.hasFailed).length, color: "#059669" },
                    { label: "失败", value: xmlReport.functions.filter((f) => f.hasFailed).length, color: "#dc2626" },
                    { label: "总耗时", value: xmlReport.totalDurationMs != null ? `${(xmlReport.totalDurationMs / 1000).toFixed(2)}s` : "-", color: "#64748b" },
                  ].map((item) => (
                    <div key={item.label} style={{
                      flex: "1 1 100px", padding: "10px 14px", borderRadius: 12, textAlign: "center",
                      background: "rgba(65,205,82,0.05)", border: "1px solid rgba(65,205,82,0.12)",
                    }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: item.color }}>{item.value}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{item.label}</div>
                    </div>
                  ))}
                  <div style={{
                    flex: "1 1 100px", padding: "10px 14px", borderRadius: 12, textAlign: "center",
                    background: xmlReport.passed ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
                    border: `1px solid ${xmlReport.passed ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)"}`,
                  }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: xmlReport.passed ? "#059669" : "#dc2626" }}>
                      {xmlReport.passed ? "✓" : "✗"}
                    </div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>结果</div>
                  </div>
                </div>

                {/* 函数列表表格 */}
                <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid rgba(65,205,82,0.12)" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "rgba(65,205,82,0.06)" }}>
                        <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>函数名</th>
                        <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#64748b", width: 70 }}>结果</th>
                        <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: "#64748b", width: 80 }}>耗时</th>
                        <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>详情</th>
                      </tr>
                    </thead>
                    <tbody>
                      {xmlReport.functions.map((fn, i) => (
                        <tr
                          key={fn.name + i}
                          style={{
                            borderTop: i > 0 ? "1px solid rgba(0,0,0,0.04)" : undefined,
                            background: fn.hasFailed ? "rgba(239,68,68,0.03)" : "transparent",
                          }}
                        >
                          <td style={{ padding: "8px 12px", fontFamily: "monospace", color: "#1d252c", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {fn.name}
                          </td>
                          <td style={{ padding: "8px 12px" }}>
                            <span style={{
                              padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700,
                              background: fn.hasFailed ? "rgba(239,68,68,0.12)" : "rgba(16,185,129,0.12)",
                              color: fn.hasFailed ? "#dc2626" : "#059669",
                            }}>
                              {fn.hasFailed ? "失败" : fn.type === "skip" ? "跳过" : "通过"}
                            </span>
                          </td>
                          <td style={{ padding: "8px 12px", textAlign: "right", color: "#94a3b8", fontVariantNumeric: "tabular-nums" }}>
                            {fn.durationMs != null ? `${fn.durationMs.toFixed(1)}ms` : "-"}
                          </td>
                          <td style={{ padding: "8px 12px", color: "#64748b", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {fn.message ? (
                              <span title={fn.message} style={{ fontFamily: "monospace", fontSize: 11 }}>{fn.message.slice(0, 120)}</span>
                            ) : fn.dataTags.length > 0 ? (
                              <span style={{ color: "#94a3b8", fontSize: 11 }}>{fn.dataTags.slice(0, 2).join(", ")}{fn.dataTags.length > 2 ? ` +${fn.dataTags.length - 2}` : ""}</span>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
