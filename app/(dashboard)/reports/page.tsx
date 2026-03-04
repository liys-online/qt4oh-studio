"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@heroui/react";
import { NewTestButton } from "@/components/NewTestButton";
import { LoadingState } from "@/components/LoadingState";
import { SessionCard } from "@/components/SessionCard";
import { cardStyle } from "@/lib/status";

interface Session {
  id: string;
  hapFile: string;
  deviceId: string;
  status: string;
  startTime: string;
  endTime?: string;
  summary?: { total: number; success: number; failed: number; timeout: number; crash: number };
}

interface Overview {
  totalSessions: number;
  completedSessions: number;
  runningSessions: number;
  totalTests: number;
  totalSuccess: number;
  totalFailed: number;
  totalTimeout: number;
  totalCrash: number;
}

export default function ReportsPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [crashFiles, setCrashFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCrash, setSelectedCrash] = useState<string | null>(null);
  const [crashContent, setCrashContent] = useState("");
  const [crashLoading, setCrashLoading] = useState(false);

  useEffect(() => {
    fetch("/api/reports")
      .then((r) => r.json())
      .then((d) => {
        setOverview(d.overview);
        setSessions(d.sessions);
        setCrashFiles(d.crashFiles || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const openCrashLog = async (filename: string) => {
    setSelectedCrash(filename);
    setCrashLoading(true);
    setCrashContent("");
    try {
      const res = await fetch(`/api/reports/crash/${filename}`);
      const data = await res.json();
      setCrashContent(data.content || data.error || "");
    } finally {
      setCrashLoading(false);
    }
  };

  if (loading) {
    return <LoadingState />;
  }

  const passRate =
    overview && overview.totalTests > 0
      ? Math.round((overview.totalSuccess / overview.totalTests) * 100)
      : 0;

  const statItems = overview
    ? [
        { label: "总会话数", value: overview.totalSessions, sub: `${overview.completedSessions} 已完成`, emoji: "📋", color: "#6366f1", bg: "rgba(99,102,241,0.1)" },
        { label: "总测试数", value: overview.totalTests, sub: `通过率 ${passRate}%`, emoji: "🧪", color: "#8b5cf6", bg: "rgba(139,92,246,0.1)" },
        { label: "超时次数", value: overview.totalTimeout, sub: "单项超时", emoji: "⏱", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
        { label: "崩溃次数", value: overview.totalCrash, sub: "应用崩溃", emoji: "💥", color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
      ]
    : [];

  return (
    <div className="space-y-7">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800">报告分析</h1>
          <p className="text-sm text-gray-500 mt-1">历史测试统计与崩溃日志</p>
        </div>
        <NewTestButton />
      </div>

      {/* 统计卡片 */}
      {overview && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statItems.map((item) => (
            <div key={item.label} className="rounded-2xl p-5 shadow-sm relative overflow-hidden" style={cardStyle}>
              <div className="absolute top-0 right-0 w-20 h-20 rounded-full opacity-30 -translate-y-6 translate-x-6"
                style={{ background: `radial-gradient(circle, ${item.color}, transparent)` }} />
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-3" style={{ background: item.bg }}>
                {item.emoji}
              </div>
              <p className="text-3xl font-black text-gray-800">{item.value}</p>
              <p className="text-xs font-semibold text-gray-600 mt-0.5">{item.label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{item.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* 测试结果分布 */}
      {overview && overview.totalTests > 0 && (
        <div className="rounded-2xl p-5 shadow-sm" style={cardStyle}>
          <h2 className="text-sm font-semibold text-gray-800 mb-4">测试结果分布</h2>
          {/* 堆叠条形图 */}
          <div className="flex rounded-full overflow-hidden h-3 mb-4">
            {[
              { value: overview.totalSuccess, color: "#10b981" },
              { value: overview.totalTimeout, color: "#f59e0b" },
              { value: overview.totalCrash,   color: "#ef4444" },
              { value: overview.totalFailed,  color: "#94a3b8" },
            ].map((seg, i) => {
              const pct = (seg.value / overview.totalTests) * 100;
              return pct > 0 ? (
                <div key={i} style={{ width: `${pct}%`, background: seg.color }} />
              ) : null;
            })}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "通过", value: overview.totalSuccess, color: "#10b981", bg: "rgba(16,185,129,0.1)" },
              { label: "超时", value: overview.totalTimeout, color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
              { label: "崩溃", value: overview.totalCrash,   color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
              { label: "失败", value: overview.totalFailed,  color: "#94a3b8", bg: "rgba(148,163,184,0.1)" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2 p-2 rounded-xl" style={{ background: item.bg }}>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: item.color }} />
                <span className="text-xs text-gray-600">{item.label}</span>
                <span className="text-xs font-bold ml-auto" style={{ color: item.color }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 崩溃日志 */}
      {crashFiles.length > 0 && (
        <div className="rounded-2xl p-5 shadow-sm" style={cardStyle}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #ef4444, #dc2626)" }}>
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-sm font-semibold text-gray-800">崩溃日志文件</h2>
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>
              {crashFiles.length} 个文件
            </span>
          </div>
          <div className="space-y-2">
            {crashFiles.map((f) => (
              <div key={f} className="flex items-center justify-between p-3 rounded-xl transition-all hover:-translate-y-0.5"
                style={{ background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.15)" }}>
                <div className="flex items-center gap-2 min-w-0">
                  <svg className="w-3.5 h-3.5 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-xs font-mono text-gray-700 truncate">{f}</span>
                </div>
                <button
                  onClick={() => openCrashLog(f)}
                  className="text-xs font-medium px-3 py-1 rounded-lg transition-all hover:opacity-80"
                  style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}
                >
                  查看
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 历史会话 */}
      <div className="rounded-2xl p-5 shadow-sm" style={cardStyle}>
        <h2 className="text-sm font-semibold text-gray-800 mb-4">历史会话</h2>
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "rgba(99,102,241,0.08)" }}>
              <svg className="w-6 h-6 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-sm text-gray-400">暂无测试记录</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <SessionCard key={s.id} session={s} href={`/reports/${s.id}`} />
            ))}
          </div>
        )}
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
                <div className="flex justify-center py-8"><Spinner /></div>
              ) : (
                <pre className="rounded-xl p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap" style={{ background: "#0f172a", color: "#94a3b8" }}>
                  {crashContent || "（文件内容为空）"}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
