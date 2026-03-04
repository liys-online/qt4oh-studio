"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useDevices } from "../../devices-context";

// HiLog 日志格式：MM-DD HH:MM:SS.mmm  PID  TID L domain/proc/tag: msg
// 级别字符在第 5 个空格分隔字段（index 4）
const LEVEL_COLORS: Record<string, string> = {
  D: "rgba(148,163,184,0.65)",
  I: "#86efac",
  W: "#fbbf24",
  E: "#f87171",
  F: "#ff4444",
};

function getLineColor(line: string): string {
  const parts = line.trimStart().split(/\s+/);
  if (parts.length >= 5) {
    const lvl = parts[4]?.replace(/[^A-Z]/g, "").toUpperCase();
    if (lvl && LEVEL_COLORS[lvl]) return LEVEL_COLORS[lvl];
  }
  const l = line.toUpperCase();
  if (l.includes(" F ") || l.includes("FATAL")) return LEVEL_COLORS["F"];
  if (l.includes(" E ") || l.includes("ERROR")) return LEVEL_COLORS["E"];
  if (l.includes(" W ") || l.includes("WARN"))  return LEVEL_COLORS["W"];
  if (l.includes(" D ") || l.includes("DEBUG")) return LEVEL_COLORS["D"];
  return LEVEL_COLORS["I"];
}

const LOG_LEVELS = ["D", "I", "W", "E", "F"];
const LOG_TYPES = [
  { value: "", label: "全部" },
  { value: "app",  label: "App"  },
  { value: "core", label: "Core" },
  { value: "init", label: "Init" },
  { value: "kmsg", label: "Kmsg" },
];
const LEVEL_BADGE_COLORS: Record<string, string> = {
  D: "#94a3b8", I: "#22c55e", W: "#f59e0b", E: "#ef4444", F: "#dc2626",
};

export default function LogsPage() {
  const { devices } = useDevices();
  const [selectedDevice, setSelectedDevice] = useState("");

  // hilog 过滤参数
  const [level, setLevel]     = useState("");
  const [logType, setLogType] = useState("");
  const [tag, setTag]         = useState("");
  const [domain, setDomain]   = useState("");
  const [pid, setPid]         = useState("");
  const [regex, setRegex]     = useState("");
  const [exitMode, setExitMode] = useState(false); // -x 非阻塞模式

  // 前端二次过滤（不影响 hilog 命令）
  const [frontFilter, setFrontFilter] = useState("");

  const [logs, setLogs]           = useState<string[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const abortRef  = useRef<AbortController | null>(null);
  const logBoxRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const filteredLogs = frontFilter
    ? logs.filter((l) => l.toLowerCase().includes(frontFilter.toLowerCase()))
    : logs;

  const buildQuery = useCallback(() => {
    const p = new URLSearchParams();
    if (level)        p.set("level",  level);
    if (logType)      p.set("type",   logType);
    if (tag.trim())   p.set("tag",    tag.trim());
    if (domain.trim()) p.set("domain", domain.trim());
    if (pid.trim())   p.set("pid",    pid.trim());
    if (regex.trim()) p.set("regex",  regex.trim());
    if (exitMode)     p.set("exit",   "1");
    return p.toString();
  }, [level, logType, tag, domain, pid, regex, exitMode]);

  const startStream = async () => {
    if (!selectedDevice) return;
    setLogs([]);
    setStreaming(true);
    setAutoScroll(true);
    abortRef.current = new AbortController();
    const qs = buildQuery();
    try {
      const res = await fetch(
        `/api/devices/${selectedDevice}/logs${qs ? `?${qs}` : ""}`,
        { signal: abortRef.current.signal }
      );
      if (!res.body) throw new Error("No stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        const newLines = lines.filter(Boolean);
        if (newLines.length > 0) {
          setLogs((prev) => {
            const next = [...prev, ...newLines];
            return next.length > 5000 ? next.slice(-5000) : next;
          });
        }
      }
    } catch {
      // aborted or network error
    } finally {
      setStreaming(false);
    }
  };

  const stopStream = () => {
    abortRef.current?.abort();
    setStreaming(false);
  };

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [filteredLogs.length, autoScroll]);

  const handleScroll = () => {
    const el = logBoxRef.current;
    if (!el) return;
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 60);
  };

  return (
    <div style={{ height: "calc(100vh - 80px)", display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Header */}
      <div style={{ flexShrink: 0 }}>
        <h1 className="text-2xl font-bold text-gray-800">HiLog 日志</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          实时查看 HarmonyOS 设备 hilog 输出，支持级别、类型、Tag、Domain、PID、正则过滤
        </p>
      </div>

      {/* 过滤控制区 */}
      <div style={{
        background: "rgba(255,255,255,0.88)", backdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,0.9)", boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
        borderRadius: 20, padding: "14px 16px", flexShrink: 0,
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        {/* Row 1：设备 + 日志类型 + 级别 + 模式 */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          {/* 设备 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 160px" }}>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">设备</label>
            <select
              value={selectedDevice}
              onChange={(e) => setSelectedDevice(e.target.value)}
              className="rounded-xl px-3 py-2 text-sm border outline-none focus:ring-2 focus:ring-green-400"
              style={{ background: "#f8fafc", borderColor: "#e2e8f0", color: "#1e293b" }}
            >
              <option value="">-- 请选择 --</option>
              {devices.map((d) => <option key={d.id} value={d.id}>{d.id}</option>)}
            </select>
          </div>

          {/* 日志类型 -t */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">类型 -t</label>
            <div style={{ display: "flex", gap: 4 }}>
              {LOG_TYPES.map((t) => (
                <button key={t.value} onClick={() => setLogType(t.value)} style={{
                  padding: "5px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                  cursor: "pointer", border: "none", transition: "all 0.15s",
                  background: logType === t.value ? "linear-gradient(135deg,#41CD52,#21a834)" : "rgba(241,245,249,1)",
                  color: logType === t.value ? "white" : "#64748b",
                }}>{t.label}</button>
              ))}
            </div>
          </div>

          {/* 日志级别 -L */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">级别 -L</label>
            <div style={{ display: "flex", gap: 4 }}>
              {LOG_LEVELS.map((lv) => (
                <button key={lv} onClick={() => setLevel(level === lv ? "" : lv)} style={{
                  width: 32, height: 32, borderRadius: 8, fontSize: 12, fontWeight: 700,
                  cursor: "pointer", border: "none", transition: "all 0.15s",
                  background: level === lv ? LEVEL_BADGE_COLORS[lv] : "rgba(241,245,249,1)",
                  color: level === lv ? "white" : LEVEL_BADGE_COLORS[lv],
                }}>{lv}</button>
              ))}
            </div>
          </div>

          {/* 模式 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">模式</label>
            <div style={{ display: "flex", gap: 4 }}>
              {[{ v: false, l: "流式" }, { v: true, l: "一次性 -x" }].map(({ v, l }) => (
                <button key={String(v)} onClick={() => setExitMode(v)} style={{
                  padding: "5px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                  cursor: "pointer", border: "none", transition: "all 0.15s",
                  background: exitMode === v ? "linear-gradient(135deg,#6366f1,#4f46e5)" : "rgba(241,245,249,1)",
                  color: exitMode === v ? "white" : "#64748b",
                }}>{l}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Row 2：Tag / Domain / PID / Regex / 前端过滤 + 操作按钮 */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          {[
            { label: "Tag  -T",   val: tag,         set: setTag,         ph: "例：SAMGR" },
            { label: "Domain -D", val: domain,       set: setDomain,      ph: "例：01B06" },
            { label: "PID   -P",  val: pid,          set: setPid,         ph: "例：618" },
            { label: "正则  -e",  val: regex,        set: setRegex,       ph: "例：start|stop" },
            { label: "客户端过滤", val: frontFilter, set: setFrontFilter, ph: "本地关键词搜索…" },
          ].map(({ label, val, set, ph }) => (
            <div key={label} style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 120px" }}>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</label>
              <input value={val} onChange={(e) => set(e.target.value)} placeholder={ph}
                className="rounded-xl px-3 py-2 text-sm border outline-none focus:ring-2 focus:ring-green-400"
                style={{ background: "#f8fafc", borderColor: "#e2e8f0", color: "#1e293b" }}
              />
            </div>
          ))}

          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <button
              onClick={streaming ? stopStream : startStream}
              disabled={!selectedDevice}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 16px", borderRadius: 12, fontSize: 13, fontWeight: 600,
                border: "none", cursor: selectedDevice ? "pointer" : "not-allowed",
                background: streaming ? "linear-gradient(135deg,#f87171,#ef4444)" : "linear-gradient(135deg,#41CD52,#21a834)",
                color: "white", opacity: selectedDevice ? 1 : 0.5,
                boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
              }}
            >
              {streaming
                ? <><span style={{ width: 10, height: 10, borderRadius: 2, background: "white", display: "inline-block" }} />停止</>
                : <><svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>开始</>
              }
            </button>
            <button onClick={() => setLogs([])} style={{
              padding: "8px 14px", borderRadius: 12, fontSize: 13, fontWeight: 600,
              border: "1px solid #e2e8f0", background: "white", color: "#64748b", cursor: "pointer",
            }}>清空</button>
          </div>
        </div>
      </div>

      {/* 状态栏 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, padding: "0 4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: "rgba(100,116,139,0.8)" }}>
          {streaming && (
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#41CD52", display: "inline-block" }} />
              实时接收中
            </span>
          )}
          <span>
            {filteredLogs.length.toLocaleString()} 行
            {frontFilter ? `（过滤自 ${logs.length.toLocaleString()} 行）` : ""}
          </span>
        </div>
        <button
          onClick={() => { setAutoScroll(true); bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }}
          style={{
            fontSize: 11, padding: "3px 10px", borderRadius: 8,
            border: "1px solid #e2e8f0",
            background: autoScroll ? "rgba(65,205,82,0.1)" : "white",
            color: autoScroll ? "#21a834" : "#94a3b8",
            cursor: "pointer", fontWeight: 600,
          }}
        >{autoScroll ? "▼ 自动滚动" : "▼ 跳至底部"}</button>
      </div>

      {/* 日志输出区 */}
      <div
        ref={logBoxRef}
        onScroll={handleScroll}
        style={{
          flex: 1, overflowY: "auto", borderRadius: 16, minHeight: 0,
          background: "#0b1120", border: "1px solid rgba(255,255,255,0.06)",
          padding: "12px 14px",
          fontFamily: "'JetBrains Mono','Fira Code','Cascadia Code',monospace",
          fontSize: 12, lineHeight: 1.65,
        }}
      >
        {filteredLogs.length === 0 ? (
          <div style={{ color: "rgba(148,163,184,0.35)", textAlign: "center", paddingTop: 48 }}>
            {streaming ? "等待 hilog 输出…" : "暂无日志，配置过滤条件后点击「开始」"}
          </div>
        ) : (
          filteredLogs.map((line, i) => (
            <div key={i} style={{ color: getLineColor(line), whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              {line}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* 级别图例 */}
      <div style={{ display: "flex", gap: 14, alignItems: "center", flexShrink: 0, padding: "0 4px 2px", fontSize: 11 }}>
        {(["D","I","W","E","F"] as const).map((k) => (
          <span key={k} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: LEVEL_COLORS[k], display: "inline-block" }} />
            <span style={{ color: "#94a3b8" }}>{k} · {{ D:"DEBUG", I:"INFO", W:"WARN", E:"ERROR", F:"FATAL" }[k]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

