"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Spinner } from "@heroui/react";
import { formatDateTime } from "@/lib/utils";
import TestResultsList from "@/components/TestResultsList";

interface CrashLog { name: string; content: string; }

interface XmlFunction {
  name: string; type: string; message?: string;
  dataTags: string[]; descriptions: string[];
  durationMs?: number; hasFailed: boolean;
}
interface XmlReport {
  testCaseName: string; qtVersion?: string;
  totalDurationMs?: number; functions: XmlFunction[]; passed: boolean;
}

interface TestResult {
  id: string; name: string; module: string; arch: string; path?: string;
  status: "success" | "timeout" | "crash" | "failed" | "pending" | "running" | "interrupted";
  duration?: number; crashLogs?: CrashLog[]; reportFile?: string;
}

interface Session {
  id: string; hapFile: string; hapFilePath?: string;
  deviceId: string; status: string;
  startTime: string; endTime?: string;
  results: TestResult[];
  summary?: { total: number; success: number; timeout: number; crash: number; failed: number; interrupted?: number };
}

export default function ResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ module?: string }>;
}) {
  const { id } = use(params);
  const { module: moduleParam } = use(searchParams);
  const moduleFilter = moduleParam ? decodeURIComponent(moduleParam) : null;

  const [session, setSession] = useState<Session | null>(null);

  // ---- crash modal ----
  const [selectedCrash, setSelectedCrash] = useState<CrashLog | null>(null);
  const [crashLoading, setCrashLoading] = useState(false);

  // ---- xml modal ----
  const [selectedReport, setSelectedReport] = useState<{ resultId: string; sessionId: string; reportFile?: string } | null>(null);
  const [xmlReport, setXmlReport] = useState<XmlReport | null>(null);
  const [xmlLoading, setXmlLoading] = useState(false);
  const [xmlError, setXmlError] = useState<string | null>(null);
  const [xmlRawContent, setXmlRawContent] = useState<string | null>(null);
  const [xmlTab, setXmlTab] = useState<"visual" | "raw">("visual");
  const [xmlLockedHeight, setXmlLockedHeight] = useState<number | null>(null);
  const xmlDialogRef = useRef<HTMLDivElement>(null);

  // ---- rerun ----
  const [rerunningId, setRerunningId] = useState<string | null>(null);
  const [newHapPath] = useState("");

  useEffect(() => {
    fetch(`/api/tests/${id}`)
      .then((r) => r.json())
      .then((d) => setSession(d.session));
  }, [id]);

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

  const handleRerun = async (resultId: string) => {
    if (rerunningId) return;
    setRerunningId(resultId);
    try {
      const res = await fetch(`/api/tests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resultId, skipInstall: true }),
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

  const openCrash = async (log: CrashLog) => {
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
    setXmlReport(null); setXmlRawContent(null); setXmlError(null);
    setXmlTab("visual"); setXmlLockedHeight(null); setXmlLoading(true);
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
    const filename = selectedReport.reportFile?.split(/[\\/]/).pop() ?? "report.xml";
    if (xmlRawContent) {
      const blob = new Blob([xmlRawContent], { type: "application/xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } else {
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

  const filteredResults = moduleFilter
    ? session.results.filter((r) => (r.module || "未知") === moduleFilter)
    : session.results;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Link
          href={`/reports/${id}`}
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
            {moduleFilter ? (
              <>
                <span style={{ color: "#94a3b8", fontWeight: 400, fontSize: 14 }}>测试结果</span>
                <span style={{ margin: "0 6px", color: "#cbd5e1" }}>·</span>
                <span style={{ fontFamily: "monospace" }}>{moduleFilter}</span>
              </>
            ) : "全部测试结果"}
          </h1>
          <p style={{ fontSize: 12, color: "#94a3b8", margin: "2px 0 0" }}>
            {session.hapFile} · {session.deviceId} · {formatDateTime(session.startTime)}
            <span style={{ marginLeft: 8, color: "#10b981", fontWeight: 600 }}>{filteredResults.length} 条</span>
          </p>
        </div>
      </div>

      {/* 测试结果列表 */}
      <TestResultsList
        results={filteredResults}
        sessionStatus={session.status}
        rerunningId={rerunningId}
        onRerun={(resultId) => handleRerun(newHapPath ? resultId : resultId)}
        onOpenCrash={openCrash}
        onOpenReport={openReport}
      />

      {/* 崩溃日志 Modal */}
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
              <button onClick={() => setSelectedCrash(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 20, lineHeight: 1, padding: "0 4px", flexShrink: 0 }}>✕</button>
            </div>
            <div style={{ overflowY: "auto", padding: 16 }}>
              {crashLoading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "32px 0" }}><Spinner /></div>
              ) : (
                <pre style={{ background: "#0f172a", color: "#cbd5e1", borderRadius: 12, padding: 16, fontSize: 12, fontFamily: "monospace", overflowX: "auto", whiteSpace: "pre-wrap", margin: 0 }}>
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
                  >×</button>
                </div>
              </div>
              <div style={{ display: "flex", gap: 0 }}>
                {(["visual", "raw"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => {
                      if (tab === "raw") {
                        if (xmlDialogRef.current) setXmlLockedHeight(xmlDialogRef.current.offsetHeight);
                        loadXmlRaw();
                      } else {
                        setXmlLockedHeight(null);
                      }
                      setXmlTab(tab);
                    }}
                    style={{
                      padding: "7px 16px", fontSize: 12, fontWeight: 600,
                      border: "none", background: "none", cursor: "pointer",
                      borderBottom: xmlTab === tab ? "2px solid #41CD52" : "2px solid transparent",
                      color: xmlTab === tab ? "#1d7a2e" : "#94a3b8",
                    }}
                  >
                    {tab === "visual" ? "📊 可视化" : "📄 XML 原件"}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px 24px" }}>
              {xmlTab === "raw" ? (
                xmlRawContent === null ? (
                  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 320 }}>
                    <Spinner label="加载中..." />
                  </div>
                ) : (
                  <pre style={{ background: "#0f172a", color: "#94a3b8", borderRadius: 12, padding: 16, fontSize: 11, fontFamily: "monospace", overflowX: "auto", whiteSpace: "pre", margin: 0, lineHeight: 1.6, minHeight: 320 }}>{xmlRawContent}</pre>
                )
              ) : xmlLoading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "32px 0" }}><Spinner label="解析中..." /></div>
              ) : xmlError ? (
                <div style={{ padding: "24px 0", textAlign: "center" }}>
                  <p style={{ color: "#dc2626", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>报告加载失败</p>
                  <p style={{ color: "#94a3b8", fontSize: 12, fontFamily: "monospace" }}>{xmlError}</p>
                </div>
              ) : !xmlReport ? (
                <p style={{ textAlign: "center", color: "#94a3b8", padding: "32px 0" }}>报告加载失败</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {[
                      { label: "总函数", value: xmlReport.functions.length, color: "#1d252c" },
                      { label: "通过", value: xmlReport.functions.filter((f) => !f.hasFailed).length, color: "#059669" },
                      { label: "失败", value: xmlReport.functions.filter((f) => f.hasFailed).length, color: "#dc2626" },
                      { label: "总耗时", value: xmlReport.totalDurationMs != null ? `${(xmlReport.totalDurationMs / 1000).toFixed(2)}s` : "-", color: "#64748b" },
                    ].map((item) => (
                      <div key={item.label} style={{ flex: "1 1 100px", padding: "10px 14px", borderRadius: 12, textAlign: "center", background: "rgba(65,205,82,0.05)", border: "1px solid rgba(65,205,82,0.12)" }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: item.color }}>{item.value}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{item.label}</div>
                      </div>
                    ))}
                    <div style={{ flex: "1 1 100px", padding: "10px 14px", borderRadius: 12, textAlign: "center", background: xmlReport.passed ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)", border: `1px solid ${xmlReport.passed ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)"}` }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: xmlReport.passed ? "#059669" : "#dc2626" }}>{xmlReport.passed ? "✓" : "✗"}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>结果</div>
                    </div>
                  </div>
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
                          <tr key={fn.name + i} style={{ borderTop: i > 0 ? "1px solid rgba(0,0,0,0.04)" : undefined, background: fn.hasFailed ? "rgba(239,68,68,0.03)" : "transparent" }}>
                            <td style={{ padding: "8px 12px", fontFamily: "monospace", color: "#1d252c", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fn.name}</td>
                            <td style={{ padding: "8px 12px" }}>
                              <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: fn.hasFailed ? "rgba(239,68,68,0.12)" : "rgba(16,185,129,0.12)", color: fn.hasFailed ? "#dc2626" : "#059669" }}>
                                {fn.hasFailed ? "失败" : fn.type === "skip" ? "跳过" : "通过"}
                              </span>
                            </td>
                            <td style={{ padding: "8px 12px", textAlign: "right", color: "#94a3b8", fontVariantNumeric: "tabular-nums" }}>{fn.durationMs != null ? `${fn.durationMs.toFixed(1)}ms` : "-"}</td>
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
