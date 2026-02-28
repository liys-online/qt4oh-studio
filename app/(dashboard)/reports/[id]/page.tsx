"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Spinner, Modal, ModalContent, ModalHeader, ModalBody } from "@heroui/react";

interface TestResult {
  id: string;
  name: string;
  module: string;
  arch: string;
  path: string;
  status: "success" | "timeout" | "crash" | "failed" | "pending" | "running";
  duration?: number;
  crashLogs?: string[];
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
  running: { bg: "rgba(99,102,241,0.12)", text: "#6366f1", label: "运行中", dot: "#6366f1" },
  pending: { bg: "rgba(148,163,184,0.12)", text: "#64748b", label: "等待", dot: "#94a3b8" },
};

const sessionStatusStyle: Record<string, { bg: string; text: string; label: string }> = {
  completed: { bg: "rgba(16,185,129,0.15)", text: "#059669", label: "已完成" },
  running:   { bg: "rgba(99,102,241,0.15)", text: "#6366f1", label: "运行中" },
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

  useEffect(() => {
    fetch(`/api/tests/${id}`)
      .then((r) => r.json())
      .then((d) => setSession(d.session));
  }, [id]);

  const openCrash = async (filename: string) => {
    setSelectedCrash(filename);
    setCrashLoading(true);
    setCrashContent("");
    const res = await fetch(`/api/reports/crash/${filename}`);
    const data = await res.json();
    setCrashContent(data.content || data.error || "");
    setCrashLoading(false);
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
    boxShadow: "0 4px 24px rgba(99,102,241,0.06)",
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
            background: "rgba(99,102,241,0.08)", color: "#6366f1",
            textDecoration: "none", flexShrink: 0,
          }}
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "#1e1b4b", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {session.hapFile}
          </h1>
          <p style={{ fontSize: 12, color: "#94a3b8", margin: "2px 0 0" }}>
            {session.deviceId} · {new Date(session.startTime).toLocaleString("zh-CN")}
          </p>
        </div>
        <span style={{
          padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
          background: sStyle.bg, color: sStyle.text, flexShrink: 0,
        }}>
          {sStyle.label}
        </span>
      </div>

      {/* 统计卡片 */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
          {[
            { label: "总计", value: summary.total, color: "#1e1b4b", accent: "#6366f1" },
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
          <div style={{ width: "100%", height: 8, borderRadius: 4, background: "rgba(99,102,241,0.1)", overflow: "hidden" }}>
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
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
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
                    ? (style ? style.bg : "rgba(99,102,241,0.15)")
                    : "rgba(255,255,255,0.7)",
                  color: active
                    ? (style ? style.text : "#6366f1")
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
                  background: active ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.7)",
                  color: active ? "#6366f1" : "#94a3b8",
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
        <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(99,102,241,0.08)" }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: "#1e1b4b", margin: 0 }}>
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
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(99,102,241,0.04)")}
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
                  <p style={{ fontSize: 12, fontFamily: "monospace", color: "#1e1b4b", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
              </div>
            );
          })}
        </div>
      </div>

      {/* 崩溃日志 Modal */}
      <Modal
        isOpen={!!selectedCrash}
        onClose={() => setSelectedCrash(null)}
        size="3xl"
        scrollBehavior="inside"
      >
        <ModalContent>
          <ModalHeader style={{ fontFamily: "monospace", fontSize: 13 }}>{selectedCrash}</ModalHeader>
          <ModalBody style={{ paddingBottom: 24 }}>
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
          </ModalBody>
        </ModalContent>
      </Modal>
    </div>
  );
}
