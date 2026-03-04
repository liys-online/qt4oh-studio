"use client";

import { useState, useRef, useEffect } from "react";
import { useDevices } from "../../devices-context";

interface HistoryEntry {
  cmd: string;
  output: string;
  error?: boolean;
}

export default function ShellPage() {
  const { devices } = useDevices();
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [bundleName, setBundleName] = useState<string>("");
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [cmdIdx, setCmdIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const runCommand = async () => {
    const cmd = input.trim();
    if (!cmd || !selectedDevice || loading) return;
    setInput("");
    setCmdHistory((prev) => [cmd, ...prev.slice(0, 99)]);
    setCmdIdx(-1);
    setLoading(true);
    try {
      const res = await fetch(`/api/devices/${selectedDevice}/shell`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd, bundleName: bundleName.trim() || undefined }),
      });
      const data = await res.json();
      setHistory((prev) => [...prev, { cmd, output: data.output ?? "", error: data.error || !res.ok }]);
    } catch (e: unknown) {
      setHistory((prev) => [...prev, { cmd, output: e instanceof Error ? e.message : "执行失败", error: true }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { runCommand(); return; }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.min(cmdIdx + 1, cmdHistory.length - 1);
      setCmdIdx(next);
      setInput(cmdHistory[next] ?? "");
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.max(cmdIdx - 1, -1);
      setCmdIdx(next);
      setInput(next === -1 ? "" : cmdHistory[next] ?? "");
    }
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  return (
    <div className="space-y-5" style={{ height: "calc(100vh - 80px)", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Shell 终端</h1>
        <p className="text-sm text-gray-500 mt-1">通过 hdc shell 在设备上执行命令，支持 <code className="text-xs bg-gray-100 px-1 rounded">-b bundlename</code> 访问应用沙箱</p>
      </div>

      {/* 设备选择 */}
      <div
        className="rounded-2xl p-4 flex items-end gap-3 flex-wrap"
        style={{ background: "rgba(255,255,255,0.85)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.9)", boxShadow: "0 2px 16px rgba(0,0,0,0.06)", flexShrink: 0 }}
      >
        <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">目标设备</label>
          <select
            value={selectedDevice}
            onChange={(e) => { setSelectedDevice(e.target.value); setHistory([]); }}
            className="rounded-xl px-3 py-2 text-sm border outline-none focus:ring-2 focus:ring-green-400"
            style={{ background: "#f8fafc", borderColor: "#e2e8f0", color: "#1e293b" }}
          >
            <option value="">-- 请选择设备 --</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>{d.id}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            -b 包名 <span style={{ color: "rgba(148,163,184,0.6)", textTransform: "none", fontWeight: 400 }}>（可选，访问应用沙箱）</span>
          </label>
          <input
            value={bundleName}
            onChange={(e) => setBundleName(e.target.value)}
            placeholder="com.example.myapplication"
            className="rounded-xl px-3 py-2 text-sm border outline-none focus:ring-2 focus:ring-green-400"
            style={{ background: "#f8fafc", borderColor: "#e2e8f0", color: "#1e293b" }}
          />
        </div>
        <button
          onClick={() => setHistory([])}
          className="px-4 py-2 rounded-xl text-sm font-semibold transition-all border hover:bg-gray-50"
          style={{ borderColor: "#e2e8f0", color: "#64748b" }}
        >
          清屏
        </button>
      </div>

      {/* 终端区域 */}
      <div
        className="flex-1 rounded-2xl font-mono text-sm flex flex-col overflow-hidden"
        style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.06)", minHeight: 200 }}
        onClick={() => inputRef.current?.focus()}
      >
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {history.length === 0 && (
            <div style={{ color: "rgba(148,163,184,0.4)" }}>
              {selectedDevice
                ? bundleName.trim()
                  ? `连接到 ${selectedDevice}（-b ${bundleName.trim()}），输入命令开始操作…`
                  : `连接到 ${selectedDevice}，输入命令开始操作…`
                : "请先选择设备"}
            </div>
          )}
          {history.map((entry, i) => (
            <div key={i}>
              <div style={{ color: "#41CD52" }}>
                <span style={{ color: "rgba(148,163,184,0.5)" }}>$ </span>
                {entry.cmd}
              </div>
              {entry.output && (
                <pre style={{ color: entry.error ? "#f87171" : "#cbd5e1", margin: "4px 0 0 12px", whiteSpace: "pre-wrap", wordBreak: "break-all", fontSize: 12 }}>
                  {entry.output}
                </pre>
              )}
            </div>
          ))}
          {loading && (
            <div style={{ color: "rgba(148,163,184,0.5)", fontSize: 12 }}>执行中…</div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* 输入行 */}
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          <span style={{ color: "#41CD52", flexShrink: 0, fontSize: 12 }}>
            {bundleName.trim() ? <span style={{ color: "#7dd3fc" }}>[{bundleName.trim()}]</span> : null}$
          </span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!selectedDevice || loading}
            placeholder={selectedDevice ? "输入命令，Enter 执行…" : "请先选择设备"}
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: "#e2e8f0", caretColor: "#41CD52" }}
          />
          {loading && (
            <svg className="w-4 h-4 animate-spin" style={{ color: "#41CD52" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}
