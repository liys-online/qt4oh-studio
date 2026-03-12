"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Spinner } from "@heroui/react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LabelList,
} from "recharts";
import { sessionStatusStyle } from "@/lib/status";
import { formatDateTime } from "@/lib/utils";

// ---------- 模块图表 Tooltip ----------
function ModuleTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; fill: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0);
  return (
    <div style={{
      background: "rgba(255,255,255,0.97)", border: "1px solid rgba(0,0,0,0.08)",
      borderRadius: 10, padding: "10px 14px", fontSize: 12, boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
    }}>
      <p style={{ fontWeight: 700, color: "#1d252c", marginBottom: 6, fontFamily: "monospace" }}>{label}</p>
      {payload.map((p) => (
        <div key={p.name} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.fill, flexShrink: 0 }} />
          <span style={{ color: "#64748b" }}>{p.name}</span>
          <span style={{ marginLeft: "auto", fontWeight: 700, color: "#1d252c" }}>{p.value}</span>
        </div>
      ))}
      {total > 0 && (
        <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", marginTop: 6, paddingTop: 6, display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "#94a3b8" }}>通过率</span>
          <span style={{ fontWeight: 800, color: "#10b981" }}>
            {Math.round(((payload[0]?.value ?? 0) / total) * 100)}%
          </span>
        </div>
      )}
    </div>
  );
}


interface TestResult {
  id: string;
  name: string;
  module: string;
  arch: string;
  path?: string;
  status: "success" | "timeout" | "crash" | "failed" | "pending" | "running" | "interrupted";
  duration?: number;
  crashLogs?: { name: string; content: string }[];
  reportFile?: string;
}

interface XmlFunction {
  name: string;
  type: string;
  message?: string;
  dataTags: string[];
  descriptions: string[];
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
  interrupted?: number;
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

export default function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [selectedCrash, setSelectedCrash] = useState<{ name: string; content: string } | null>(null);
  const [crashLoading, setCrashLoading] = useState(false);
  const [selectedReport, setSelectedReport] = useState<{ resultId: string; sessionId: string; reportFile?: string } | null>(null);
  const [xmlReport, setXmlReport] = useState<XmlReport | null>(null);
  const [xmlLoading, setXmlLoading] = useState(false);
  const [xmlError, setXmlError] = useState<string | null>(null);
  const [xmlRawContent, setXmlRawContent] = useState<string | null>(null);
  const [xmlTab, setXmlTab] = useState<"visual" | "raw">("visual");
  const [xmlLockedHeight, setXmlLockedHeight] = useState<number | null>(null);
  const xmlDialogRef = useRef<HTMLDivElement>(null);
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

  // SSE：接收重跑推送的实时状态更新（快路径）
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

  // 轮询兜底：重跑期间每 2s 检查结果状态，防止 SSE 丢失事件导致按钮永久禁用
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
        let msg = res.statusText;
        try { const t = await res.text(); const d = JSON.parse(t); msg = d.error || msg; } catch { /* non-json */ }
        alert("重跑失败: " + msg);
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

  const openCrash = async (log: { name: string; content: string }) => {
    // 先显示弹窗（内容为空时显示加载状态）
    setSelectedCrash({ name: log.name, content: log.content });
    if (!log.content) {
      setCrashLoading(true);
      try {
        const res = await fetch(`/api/reports/crash/${encodeURIComponent(log.name)}`);
        const data = await res.json();
        setSelectedCrash({ name: log.name, content: data.content || data.error || "" });
      } catch (e) {
        setSelectedCrash({ name: log.name, content: `加载失败: ${(e as Error).message}` });
      } finally {
        setCrashLoading(false);
      }
    }
  };

  const openReport = async (result: TestResult) => {
    if (!result.reportFile) return;
    setSelectedReport({ resultId: result.id, sessionId: id, reportFile: result.reportFile });
    setXmlReport(null);
    setXmlRawContent(null);
    setXmlError(null);
    setXmlTab("visual");
    setXmlLockedHeight(null);
    setXmlLoading(true);
    try {
      const res = await fetch(`/api/reports/xml/${id}/${result.id}`);
      const data = await res.json();
      if (res.ok) setXmlReport(data as XmlReport);
      else setXmlError(data.error ?? `HTTP ${res.status}`);
    } catch (e) {
      setXmlError((e as Error).message);
    } finally {
      setXmlLoading(false);
    }
  };

  const loadXmlRaw = async () => {
    if (xmlRawContent !== null || !selectedReport) return;
    try {
      const res = await fetch(`/api/reports/xml/${selectedReport.sessionId}/${selectedReport.resultId}?raw=1`);
      if (res.ok) setXmlRawContent(await res.text());
      else setXmlRawContent(`加载失败: HTTP ${res.status}`);
    } catch (e) {
      setXmlRawContent(`加载失败: ${(e as Error).message}`);
    }
  };

  const downloadXml = () => {
    if (!selectedReport) return;
    const filename = selectedReport.reportFile
      ? selectedReport.reportFile.split(/[\\/]/).pop() ?? "report.xml"
      : "report.xml";
    if (xmlRawContent) {
      const blob = new Blob([xmlRawContent], { type: "application/xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } else {
      // 直接跳转 API，让浏览器下载
      const a = document.createElement("a");
      a.href = `/api/reports/xml/${selectedReport.sessionId}/${selectedReport.resultId}?raw=1`;
      a.download = filename; a.click();
    }
  };

  if (!session) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 256 }}>
        <Spinner label="加载中..." />
      </div>
    );
  }

  const summary = session.summary;
  const passRate = summary && summary.total > 0
    ? Math.round((summary.success / summary.total) * 100)
    : 0;

  // 按模块聚合
  const byModule: Record<string, { total: number; success: number; failed: number; timeout: number; crash: number }> = {};
  for (const r of session.results) {
    const m = r.module || "未知";
    byModule[m] ??= { total: 0, success: 0, failed: 0, timeout: 0, crash: 0 };
    byModule[m].total++;
    if (r.status === "success") byModule[m].success++;
    else if (r.status === "failed" || r.status === "interrupted") byModule[m].failed++;
    else if (r.status === "timeout") byModule[m].timeout++;
    else if (r.status === "crash") byModule[m].crash++;
  }
  const moduleStats = Object.entries(byModule).map(([module, stats]) => ({ module, ...stats }));
  const chartHeight = Math.max(180, moduleStats.length * 40 + 40);

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
              {session.deviceId} · {formatDateTime(session.startTime)}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {/* 导出 Excel 按钮 */}
          <a
            href={`/api/reports/${id}/export`}
            download
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "6px 14px", borderRadius: 10, fontSize: 12, fontWeight: 600,
              background: "rgba(16,185,129,0.08)", color: "#059669",
              border: "1px solid rgba(16,185,129,0.25)", textDecoration: "none",
            }}
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            导出 Excel
          </a>
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
          {[
            { label: "总计", value: summary.total, color: "#1d252c", accent: "#41CD52" },
            { label: "通过", value: summary.success, color: "#059669", accent: "#10b981" },
            { label: "超时", value: summary.timeout, color: "#d97706", accent: "#f59e0b" },
            { label: "崩溃", value: summary.crash, color: "#dc2626", accent: "#ef4444" },
            { label: "失败", value: summary.failed, color: "#dc2626", accent: "#ef4444" },
            { label: "中断", value: summary.interrupted ?? 0, color: "#b45309", accent: "#f59e0b" },
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
              { label: "中断", value: summary.interrupted ?? 0, color: "#b45309" },
            ].map((seg) => (
              <div key={seg.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#64748b" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: seg.color, display: "inline-block" }} />
                {seg.label} {seg.value}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 各模块测试结果图表 */}
      {moduleStats.length > 0 && (
        <div style={{ ...glass, padding: "16px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#1d252c" }}>各模块测试结果</span>
              <span style={{ fontSize: 11, color: "#94a3b8" }}>点击模块查看测试用例</span>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              {[
                { label: "通过", color: "#10b981" },
                { label: "超时", color: "#f59e0b" },
                { label: "崩溃", color: "#ef4444" },
                { label: "失败", color: "#94a3b8" },
              ].map((l) => (
                <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#94a3b8" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: l.color, display: "inline-block" }} />
                  {l.label}
                </div>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart
              data={moduleStats}
              layout="vertical"
              margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
              barSize={16}
              style={{ cursor: "pointer" }}
              onClick={(data) => {
                const mod = data?.activeLabel as string | undefined;
                if (mod) router.push(`/reports/${id}/results?module=${encodeURIComponent(mod)}`);
              }}
            >
              <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <YAxis
                type="category"
                dataKey="module"
                width={120}
                tick={{ fontSize: 11, fill: "#374151", fontFamily: "monospace" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<ModuleTooltip />} cursor={{ fill: "rgba(65,205,82,0.04)" }} />
              <Bar dataKey="success" name="通过" stackId="a" fill="#10b981">
                <LabelList
                  dataKey="success"
                  position="insideRight"
                  style={{ fontSize: 10, fill: "#fff", fontWeight: 700 }}
                  formatter={(v: unknown) => (typeof v === "number" && v > 0) ? v : ""}
                />
              </Bar>
              <Bar dataKey="timeout" name="超时" stackId="a" fill="#f59e0b" />
              <Bar dataKey="crash"   name="崩溃" stackId="a" fill="#ef4444" />
              <Bar dataKey="failed"  name="失败" stackId="a" fill="#94a3b8" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}



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
              <span style={{ fontFamily: "monospace", fontSize: 13, color: "#1e1b4b", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedCrash.name}</span>
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
                  {selectedCrash?.content || "（内容为空）"}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* XML 报告可视化 Modal */}
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
          <div ref={xmlDialogRef} style={{
            background: "#fff", borderRadius: 20, boxShadow: "0 24px 80px rgba(0,0,0,0.18)",
            width: "100%", maxWidth: 800,
            ...(xmlLockedHeight ? { height: xmlLockedHeight } : { maxHeight: "85vh" }),
            display: "flex", flexDirection: "column", overflow: "hidden",
          }}>
            {/* Header */}
            <div style={{ padding: "16px 24px 0", borderBottom: "1px solid rgba(0,0,0,0.06)", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#1d252c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {xmlReport?.testCaseName ?? "测试报告"}
                  </div>
                  {xmlReport?.qtVersion && (
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>Qt {xmlReport.qtVersion}</div>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: 12 }}>
                  {/* 下载按鈕 */}
                  <button
                    onClick={downloadXml}
                    title="下载 XML 原件"
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      padding: "5px 11px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                      border: "1px solid rgba(65,205,82,0.3)", cursor: "pointer",
                      background: "rgba(65,205,82,0.08)", color: "#1d7a2e",
                    }}
                  >
                    <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    下载 XML
                  </button>
                  <button
                    onClick={() => { setSelectedReport(null); setXmlReport(null); }}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#94a3b8", lineHeight: 1, padding: "2px 6px" }}
                  >
                    ×
                  </button>
                </div>
              </div>
              {/* Tab 切换 */}
              <div style={{ display: "flex", gap: 0 }}>
                {(["visual", "raw"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => {
                      if (tab === "raw") {
                        // 切到原件前先快照当前高度并锁定
                        if (xmlDialogRef.current) {
                          setXmlLockedHeight(xmlDialogRef.current.offsetHeight);
                        }
                        loadXmlRaw();
                      } else {
                        // 切回可视化，释放高度锁定
                        setXmlLockedHeight(null);
                      }
                      setXmlTab(tab);
                    }}
                    style={{
                      padding: "7px 16px", fontSize: 12, fontWeight: 600,
                      border: "none", background: "none", cursor: "pointer",
                      borderBottom: xmlTab === tab ? "2px solid #41CD52" : "2px solid transparent",
                      color: xmlTab === tab ? "#1d7a2e" : "#94a3b8",
                      transition: "color 0.15s",
                    }}
                  >
                    {tab === "visual" ? "📊 可视化" : "📄 XML 原件"}
                  </button>
                ))}
              </div>
            </div>
            {/* Body */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px 24px" }}>
            {xmlTab === "raw" ? (
              xmlRawContent === null ? (
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 320, padding: "32px 0" }}>
                  <Spinner label="加载中..." />
                </div>
              ) : (
                <pre style={{
                  background: "#0f172a", color: "#94a3b8",
                  borderRadius: 12, padding: 16, fontSize: 11,
                  fontFamily: "monospace", overflowX: "auto",
                  whiteSpace: "pre", margin: 0, lineHeight: 1.6,
                  minHeight: 320,
                }}>{xmlRawContent}</pre>
              )
            ) : xmlLoading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "32px 0" }}>
                <Spinner label="解析中..." />
              </div>
            ) : xmlError ? (
              <div style={{ padding: "24px 0", textAlign: "center" }}>
                <p style={{ color: "#dc2626", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>报告加载失败</p>
                <p style={{ color: "#94a3b8", fontSize: 12, fontFamily: "monospace" }}>{xmlError}</p>
                <p style={{ color: "#cbd5e1", fontSize: 11, marginTop: 8 }}>
                  result #{selectedReport?.resultId?.slice(0, 8)}
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
                          <td style={{ padding: "8px 12px", color: "#64748b", maxWidth: 300 }}>
                            {fn.message ? (
                              <span title={fn.message} style={{ fontFamily: "monospace", fontSize: 11, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fn.message}</span>
                            ) : fn.descriptions.length > 0 ? (
                              <span style={{ color: "#94a3b8", fontSize: 11, display: "block", wordBreak: "break-word", whiteSpace: "pre-wrap", lineHeight: 1.4 }}>{fn.descriptions.join("\n")}</span>
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
