"use client";

import { useState } from "react";
import { Spinner } from "@heroui/react";
import { testStatusStyle as statusStyle } from "@/lib/status";

export interface CrashLog {
  name: string;
  content: string;
}

export interface LogEntry {
  time: string;
  message: string;
}

export interface TestResult {
  id: string;
  name: string;
  module: string;
  arch: string;
  path?: string;
  status: "success" | "timeout" | "crash" | "failed" | "pending" | "running" | "interrupted";
  duration?: number;
  crashLogs?: CrashLog[];
  reportFile?: string;
}

interface Props {
  results: TestResult[];
  /** session.status：用于判断是否允许显示重跑按钮 */
  sessionStatus: string;
  rerunningId: string | null;
  onRerun?: (resultId: string) => void;
  onOpenCrash?: (log: CrashLog) => void;
  onOpenReport?: (result: TestResult) => void;
  /** 按测试 ID 存储的日志条目，传入后启用「展开日志」功能 */
  logData?: Record<string, LogEntry[]>;
  /** 当前已展开的测试 ID 集合（受控，由父组件管理） */
  expandedIds?: Set<string>;
  onToggleExpand?: (id: string) => void;
  /** 列表末尾锚点 ref，用于自动滚动 */
  listEndRef?: React.RefObject<HTMLDivElement | null>;
  /** 过滤掉 pending 状态（测试执行页） */
  excludePending?: boolean;
  /**
   * 填满剩余高度模式（测试执行页）：
   * 设为 true 时组件使用 flexbox 填充父容器高度，列表区域内部滚动。
   * 调用方需给父元素设置 `display:flex; flex-direction:column; flex:1; min-height:0`。
   */
  fillHeight?: boolean;
  /** 空列表时的加载提示（测试执行页初始化期间） */
  loadingLabel?: string;
}

const glass: React.CSSProperties = {
  background: "rgba(255,255,255,0.85)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  border: "1px solid rgba(255,255,255,0.9)",
  borderRadius: 16,
  boxShadow: "0 4px 24px rgba(65,205,82,0.05)",
  overflow: "hidden",
};

const STATUS_FILTERS = ["all", "success", "timeout", "crash", "failed", "interrupted"];

export default function TestResultsList({
  results,
  sessionStatus,
  rerunningId,
  onRerun,
  onOpenCrash,
  onOpenReport,
  logData,
  expandedIds = new Set(),
  onToggleExpand,
  listEndRef,
  excludePending = false,
  fillHeight = false,
  loadingLabel,
}: Props) {
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterModule, setFilterModule] = useState("all");

  const baseResults = excludePending ? results.filter((r) => r.status !== "pending") : results;
  const modules: string[] = ["all", ...Array.from(new Set(results.map((r) => r.module)))];

  const filtered = baseResults.filter((r) => {
    const matchStatus = filterStatus === "all" || r.status === filterStatus;
    const matchModule = filterModule === "all" || r.module === filterModule;
    return matchStatus && matchModule;
  });

  const outerStyle: React.CSSProperties = fillHeight
    ? { ...glass, display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }
    : glass;

  const listStyle: React.CSSProperties = fillHeight
    ? { flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 12px" }
    : { padding: "8px 12px" };

  return (
    <div style={outerStyle}>
      {/* 标题栏 */}
      <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(65,205,82,0.08)", flexShrink: 0 }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, color: "#1d252c", margin: 0 }}>
          测试结果
          <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 500, color: "#94a3b8" }}>
            ({filtered.length})
          </span>
        </h2>
      </div>

      {/* 过滤器 */}
      <div
        style={{
          display: "flex", flexWrap: "wrap", gap: 8,
          padding: "10px 20px",
          borderBottom: "1px solid rgba(65,205,82,0.06)",
          flexShrink: 0,
        }}
      >
        {/* 状态 */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {STATUS_FILTERS.map((s) => {
            const active = filterStatus === s;
            const st = s !== "all" ? statusStyle[s] : null;
            return (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                style={{
                  padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                  border: "none", cursor: "pointer", transition: "all 0.15s",
                  background: active ? (st ? st.bg : "rgba(65,205,82,0.15)") : "rgba(255,255,255,0.7)",
                  color: active ? (st ? st.text : "#1d7a2e") : "#94a3b8",
                  boxShadow: active ? "0 2px 8px rgba(0,0,0,0.08)" : "none",
                }}
              >
                {s === "all" ? "全部" : statusStyle[s]?.label ?? s}
              </button>
            );
          })}
        </div>
        {/* 模块 */}
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

      {/* 列表 */}
      <div style={listStyle}>
        {/* 加载 / 空状态 */}
        {results.length === 0 && loadingLabel && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "40px 0" }}>
            <Spinner size="md" />
            <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>{loadingLabel}</p>
          </div>
        )}
        {results.length > 0 && filtered.length === 0 && (
          <p style={{ textAlign: "center", color: "#94a3b8", fontSize: 13, padding: "32px 0" }}>
            没有符合条件的结果
          </p>
        )}

        {/* 结果行 */}
        {filtered.map((result) => {
          const rs = statusStyle[result.status] ?? { bg: "rgba(148,163,184,0.1)", text: "#64748b", label: result.status, dot: "#94a3b8" };
          const isRunning = result.status === "running";
          const cmdLogs = logData?.[result.id] ?? [];
          const hasCmds = cmdLogs.length > 0;
          const isExpanded = logData != null && (isRunning || expandedIds.has(result.id));

          return (
            <div
              key={result.id}
              style={{
                borderRadius: 12, overflow: "hidden", marginBottom: 2,
                background: isRunning ? "rgba(99,102,241,0.03)" : "transparent",
              }}
            >
              {/* 行 */}
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 12px",
                  cursor: logData != null && !isRunning && hasCmds ? "pointer" : "default",
                  transition: "background 0.15s",
                }}
                onClick={logData != null && !isRunning && hasCmds ? () => onToggleExpand?.(result.id) : undefined}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(65,205,82,0.04)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = isRunning ? "rgba(99,102,241,0.03)" : "transparent")}
              >
                {/* 状态徽章 */}
                <span
                  style={{
                    padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                    background: rs.bg, color: rs.text, flexShrink: 0,
                    minWidth: 52, textAlign: "center",
                    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4,
                  }}
                >
                  {isRunning ? (
                    <>
                      <Spinner size="sm" color="current" style={{ width: 12, height: 12 }} />
                      运行中
                    </>
                  ) : rs.label}
                </span>

                {/* 名称 + 信息 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontSize: 12, fontFamily: "monospace", color: "#1d252c",
                    margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {result.name}
                  </p>
                  <p style={{
                    fontSize: 11, color: "#94a3b8", margin: "2px 0 0",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {result.module} · {result.arch}
                    {result.path ? ` · ${result.path}` : ""}
                    {result.duration !== undefined ? ` · ${result.duration}s` : ""}
                  </p>
                </div>

                {/* 崩溃日志按钮 */}
                {result.crashLogs && result.crashLogs.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {result.crashLogs.map((log) => (
                      <button
                        key={log.name}
                        onClick={(e) => { e.stopPropagation(); onOpenCrash?.(log); }}
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
                    onClick={(e) => { e.stopPropagation(); onOpenReport?.(result); }}
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
                {(result.status === "failed" || result.status === "timeout" || result.status === "crash" || result.status === "interrupted") &&
                  sessionStatus !== "running" && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onRerun?.(result.id); }}
                    disabled={!!rerunningId}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                      border: "none", cursor: rerunningId ? "not-allowed" : "pointer", flexShrink: 0,
                      background: rerunningId === result.id ? "rgba(99,102,241,0.18)" : "rgba(99,102,241,0.1)",
                      color: "#6366f1",
                      opacity: rerunningId && rerunningId !== result.id ? 0.5 : 1,
                      transition: "background 0.15s",
                    }}
                  >
                    {rerunningId === result.id ? (
                      <>
                        <svg
                          style={{ animation: "spin 1s linear infinite" }}
                          width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        重跑中
                      </>
                    ) : "重跑"}
                  </button>
                )}

                {/* 展开箭头（仅有日志时显示） */}
                {logData != null && !isRunning && hasCmds && (
                  <svg
                    style={{
                      width: 14, height: 14, flexShrink: 0, color: "#94a3b8",
                      transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 0.15s",
                    }}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </div>

              {/* 日志展开面板 */}
              {logData != null && isExpanded && hasCmds && (
                <div
                  style={{
                    margin: "0 10px 10px",
                    borderRadius: "0 0 10px 10px",
                    overflow: "hidden",
                    background: "#0f172a",
                  }}
                >
                  <div
                    style={{
                      padding: "6px 12px", display: "flex", alignItems: "center", gap: 6,
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                    }}
                  >
                    <span
                      style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: isRunning ? "#10b981" : "#475569",
                        display: "inline-block",
                        ...(isRunning ? { animation: "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite" } : {}),
                      }}
                    />
                    <span style={{ fontSize: 11, fontFamily: "monospace", color: "#475569" }}>执行命令</span>
                    <span style={{ fontSize: 11, fontFamily: "monospace", color: "#334155", marginLeft: "auto" }}>
                      {cmdLogs.length} 条
                    </span>
                  </div>
                  <div
                    style={{
                      padding: 12, maxHeight: 160, overflowY: "auto",
                      display: "flex", flexDirection: "column", gap: 4,
                    }}
                  >
                    {cmdLogs.map((log, i) => {
                      const msg = log.message;
                      const isCmd    = msg.startsWith("[CMD]");
                      const isHdc    = msg.startsWith("[HDC]");
                      const isWarn   = msg.startsWith("[WARN]");
                      const isFail   = msg.startsWith("[FAIL]");
                      const isResult = msg.startsWith("[RESULT]");
                      const color = isCmd ? "#86efac" : isHdc ? "#67e8f9" : isWarn ? "#fbbf24" : isFail ? "#f87171" : isResult ? "#c084fc" : "#818cf8";
                      return (
                        <div
                          key={i}
                          style={{
                            display: "flex", gap: 8,
                            fontSize: 12, fontFamily: "monospace", lineHeight: 1.5,
                            alignItems: "flex-start",
                          }}
                        >
                          <span style={{ flexShrink: 0, color: "#334155" }}>
                            {new Date(log.time).toLocaleTimeString("zh-CN")}
                          </span>
                          <span style={{ minWidth: 0, wordBreak: "break-all", color }}>
                            {isCmd ? (
                              <><span style={{ color: "#4ade80" }}>$ </span>{msg.replace("[CMD] ", "")}</>
                            ) : msg.replace("[INFO] ", "")}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {listEndRef && <div ref={listEndRef} />}
      </div>
    </div>
  );
}
