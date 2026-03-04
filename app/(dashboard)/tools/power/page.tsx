"use client";

import { useState } from "react";
import { useDevices } from "../../devices-context";

interface LogEntry {
  time: string;
  action: string;
  result: string;
  success: boolean;
}

const POWER_MODES = [
  { value: 600, label: "正常模式",     desc: "标准电源策略",     color: "#22c55e", bg: "rgba(34,197,94,0.1)"  },
  { value: 601, label: "省电模式",     desc: "降低性能，延长续航", color: "#f59e0b", bg: "rgba(245,158,11,0.1)"  },
  { value: 602, label: "性能模式",     desc: "最大性能输出",      color: "#6366f1", bg: "rgba(99,102,241,0.1)"  },
  { value: 603, label: "超级省电模式", desc: "极限续航，限制功能", color: "#64748b", bg: "rgba(100,116,139,0.1)" },
];

const TIMEOUT_PRESETS = [
  { ms: 15000,  label: "15 秒" },
  { ms: 30000,  label: "30 秒" },
  { ms: 60000,  label: "1 分钟" },
  { ms: 120000, label: "2 分钟" },
  { ms: 300000, label: "5 分钟" },
  { ms: 600000, label: "10 分钟" },
];

function now() {
  return new Date().toLocaleTimeString("zh-CN", { hour12: false });
}

export default function PowerPage() {
  const { devices } = useDevices();
  const [selectedDevice, setSelectedDevice] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [customTimeoutMs, setCustomTimeoutMs] = useState("");

  const exec = async (action: string, label: string, body: object) => {
    if (!selectedDevice || loading) return;
    setLoading(action);
    try {
      const res = await fetch(`/api/devices/${selectedDevice}/power`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setLogs((prev) => [
        { time: now(), action: label, result: data.output ?? "", success: data.success !== false },
        ...prev.slice(0, 49),
      ]);
    } catch (e: unknown) {
      setLogs((prev) => [
        { time: now(), action: label, result: e instanceof Error ? e.message : "请求失败", success: false },
        ...prev.slice(0, 49),
      ]);
    } finally {
      setLoading(null);
    }
  };

  const disabled = !selectedDevice || !!loading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">电源管理</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          通过 <code className="text-xs bg-gray-100 px-1 rounded">power-shell</code> 控制设备电源状态：亮屏、熄屏、电源模式、自动熄屏时间
        </p>
      </div>

      {/* 设备选择 */}
      <div
        className="rounded-2xl p-4"
        style={{ background: "rgba(255,255,255,0.88)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.9)", boxShadow: "0 2px 16px rgba(0,0,0,0.06)" }}
      >
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">目标设备</label>
        <select
          value={selectedDevice}
          onChange={(e) => setSelectedDevice(e.target.value)}
          className="rounded-xl px-3 py-2.5 text-sm border outline-none focus:ring-2 focus:ring-green-400 w-full max-w-xs"
          style={{ background: "#f8fafc", borderColor: "#e2e8f0", color: "#1e293b" }}
        >
          <option value="">-- 请选择设备 --</option>
          {devices.map((d) => <option key={d.id} value={d.id}>{d.id}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>
        {/* 屏幕控制 */}
        <section
          className="rounded-2xl p-5 flex flex-col gap-4"
          style={{ background: "rgba(255,255,255,0.88)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.9)", boxShadow: "0 2px 16px rgba(0,0,0,0.06)" }}
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#41CD52,#21a834)" }}>
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <h2 className="text-sm font-bold text-gray-700">屏幕控制</h2>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => exec("wakeup", "亮屏 (wakeup)", { action: "wakeup" })}
              disabled={disabled}
              className="flex-1 flex flex-col items-center gap-2 py-4 rounded-xl font-semibold text-sm transition-all disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,#fef3c7,#fde68a)", color: "#92400e", border: "1px solid rgba(245,158,11,0.3)" }}
            >
              {loading === "wakeup"
                ? <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                : <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
              }
              亮屏
            </button>
            <button
              onClick={() => exec("suspend", "熄屏 (suspend)", { action: "suspend" })}
              disabled={disabled}
              className="flex-1 flex flex-col items-center gap-2 py-4 rounded-xl font-semibold text-sm transition-all disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,#e2e8f0,#cbd5e1)", color: "#334155", border: "1px solid rgba(100,116,139,0.2)" }}
            >
              {loading === "suspend"
                ? <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                : <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
              }
              熄屏
            </button>
          </div>
        </section>

        {/* 电源模式 */}
        <section
          className="rounded-2xl p-5 flex flex-col gap-4"
          style={{ background: "rgba(255,255,255,0.88)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.9)", boxShadow: "0 2px 16px rgba(0,0,0,0.06)" }}
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}>
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h2 className="text-sm font-bold text-gray-700">电源模式 (setmode)</h2>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {POWER_MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => exec(`setmode_${m.value}`, `${m.label} (setmode ${m.value})`, { action: "setmode", mode: m.value })}
                disabled={disabled}
                className="flex flex-col gap-0.5 items-start px-3 py-3 rounded-xl text-left transition-all disabled:opacity-50"
                style={{ background: m.bg, border: `1px solid ${m.color}33` }}
              >
                {loading === `setmode_${m.value}`
                  ? <svg className="w-4 h-4 animate-spin mb-0.5" style={{ color: m.color }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  : <span className="text-xs font-bold mb-0.5" style={{ color: m.color }}>{m.value}</span>
                }
                <span className="text-xs font-bold" style={{ color: "#1e293b" }}>{m.label}</span>
                <span className="text-xs" style={{ color: "#64748b" }}>{m.desc}</span>
              </button>
            ))}
          </div>
        </section>

        {/* 自动熄屏时间 */}
        <section
          className="rounded-2xl p-5 flex flex-col gap-4"
          style={{ background: "rgba(255,255,255,0.88)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.9)", boxShadow: "0 2px 16px rgba(0,0,0,0.06)" }}
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#0ea5e9,#0284c7)" }}>
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-sm font-bold text-gray-700">自动熄屏时间 (timeout)</h2>
          </div>

          {/* 预设时长 */}
          <div className="flex flex-wrap gap-2">
            {TIMEOUT_PRESETS.map((t) => (
              <button
                key={t.ms}
                onClick={() => exec(`timeout_${t.ms}`, `自动熄屏 ${t.label} (timeout -o ${t.ms})`, { action: "timeout", timeoutMs: t.ms })}
                disabled={disabled}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                style={{ background: "rgba(14,165,233,0.1)", color: "#0284c7", border: "1px solid rgba(14,165,233,0.25)" }}
              >
                {loading === `timeout_${t.ms}`
                  ? <span className="flex items-center gap-1"><svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>{t.label}</span>
                  : t.label
                }
              </button>
            ))}
          </div>

          {/* 自定义时长 */}
          <div className="flex gap-2 items-center">
            <input
              value={customTimeoutMs}
              onChange={(e) => setCustomTimeoutMs(e.target.value.replace(/\D/g, ""))}
              placeholder="自定义毫秒数"
              className="flex-1 rounded-xl px-3 py-2 text-sm border outline-none focus:ring-2 focus:ring-blue-400"
              style={{ background: "#f8fafc", borderColor: "#e2e8f0", color: "#1e293b" }}
            />
            <button
              onClick={() => {
                const ms = parseInt(customTimeoutMs);
                if (ms > 0) exec(`timeout_custom`, `自动熄屏 ${ms}ms (timeout -o ${ms})`, { action: "timeout", timeoutMs: ms });
              }}
              disabled={disabled || !customTimeoutMs}
              className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,#0ea5e9,#0284c7)", color: "white" }}
            >设置</button>
          </div>

          {/* 恢复系统默认 */}
          <button
            onClick={() => exec("timeout_restore", "恢复自动熄屏时间 (timeout -r)", { action: "timeout", restore: true })}
            disabled={disabled}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
            style={{ background: "rgba(241,245,249,1)", color: "#64748b", border: "1px solid #e2e8f0" }}
          >
            {loading === "timeout_restore"
              ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            }
            恢复系统默认熄屏时间 (-r)
          </button>
        </section>
      </div>

      {/* 操作日志 */}
      {logs.length > 0 && (
        <section
          className="rounded-2xl p-5 flex flex-col gap-3"
          style={{ background: "rgba(255,255,255,0.88)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.9)", boxShadow: "0 2px 16px rgba(0,0,0,0.06)" }}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-700">操作记录</h2>
            <button onClick={() => setLogs([])} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">清空</button>
          </div>
          <div className="flex flex-col gap-2">
            {logs.map((l, i) => (
              <div key={i} className="flex items-start gap-3 text-xs rounded-xl px-3 py-2.5" style={{ background: l.success ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)", border: `1px solid ${l.success ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)"}` }}>
                <span style={{ color: "rgba(148,163,184,0.7)", flexShrink: 0, fontFamily: "monospace" }}>{l.time}</span>
                <div className="flex-1 min-w-0">
                  <span style={{ fontWeight: 600, color: l.success ? "#15803d" : "#dc2626" }}>{l.action}</span>
                  {l.result && <span style={{ color: "#64748b", marginLeft: 8 }}>{l.result}</span>}
                </div>
                <span style={{ flexShrink: 0, color: l.success ? "#22c55e" : "#ef4444" }}>{l.success ? "✓" : "✗"}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
