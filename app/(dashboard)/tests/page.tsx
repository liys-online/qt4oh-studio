"use client";

import { useEffect, useRef, useState } from "react";
import { Spinner } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useDevices } from "../devices-context";

interface HapInfo {
  fileName: string;
  filePath?: string;
  totalLibs: number;
  modules: string[];
  archs: string[];
}

interface SessionSummary {
  id: string;
  hapFile: string;
  deviceId: string;
  status: "running" | "completed" | "stopped";
  startTime: string;
  endTime?: string;
  summary?: { total: number; success: number; failed: number; timeout: number; crash: number };
  results: { status: string }[];
}

const TIMEOUT_OPTIONS = [60, 120, 300, 600];

function StepBadge({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  return (
    <span
      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all"
      style={
        done
          ? { background: "linear-gradient(135deg, #10b981, #059669)", color: "white" }
          : active
          ? { background: "linear-gradient(135deg, #41CD52, #21a834)", color: "white" }
          : { background: "rgba(0,0,0,0.06)", color: "#94a3b8" }
      }
    >
      {done ? (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        n
      )}
    </span>
  );
}

export default function TestsPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { devices, loading: devicesLoading, deviceInfoMap } = useDevices();
  const [selectedDevice, setSelectedDevice] = useState("");
  const [hapInfo, setHapInfo] = useState<HapInfo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [dragging, setDragging] = useState(false);

  const [filterArch, setFilterArch] = useState("");
  const [filterModule, setFilterModule] = useState("");
  const [filterPattern, setFilterPattern] = useState("");
  const [timeout, setTimeout_] = useState(300);
  const [skipInstall, setSkipInstall] = useState(false);
  const [starting, setStarting] = useState(false);

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);

  const selectDevice = (id: string) => setSelectedDevice(id);

  const handleDeleteAll = async () => {
    if (!confirm(`确认删除全部 ${historySessions.length} 条历史记录？此操作不可撤销。`)) return;    setDeletingAll(true);
    try {
      const res = await fetch("/api/tests", { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); alert(d.error || "删除失败"); return; }
      setSessions((prev) => prev.filter((s) => s.status === "running"));
    } finally {
      setDeletingAll(false);
    }
  };

  useEffect(() => {
    fetch("/api/tests")
      .then((r) => r.json())
      .then((d) => setSessions(d.sessions || []));
  }, []);

  // 有运行中的会话时每 3s 刷新一次列表以更新进度
  useEffect(() => {
    const hasRunning = sessions.some((s) => s.status === "running");
    if (!hasRunning) return;
    const timer = setInterval(() => {
      fetch("/api/tests")
        .then((r) => r.json())
        .then((d) => setSessions(d.sessions || []));
    }, 3000);
    return () => clearInterval(timer);
  }, [sessions]);

  // 设备列表就绪后若只有一台则自动选中
  useEffect(() => {
    if (!devicesLoading && devices.length === 1 && !selectedDevice) {
      selectDevice(devices[0].id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devicesLoading]);

  const uploadFile = async (file: File) => {
    if (!file.name.endsWith(".hap")) {
      setUploadError("请上传 .hap 格式的文件");
      return;
    }
    setUploadError("");
    setUploading(true);
    setHapInfo(null);
    try {
      // Electron 环境：file.path 是本地绝对路径，避免将大文件读入内存
      const localPath = (file as unknown as { path?: string }).path;
      let res: Response;
      if (localPath) {
        res = await fetch("/api/hap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ localPath, fileName: file.name }),
        });
      } else {
        const formData = new FormData();
        formData.append("file", file);
        res = await fetch("/api/hap", { method: "POST", body: formData });
      }
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const text = await res.text();
        throw new Error(`服务器错误 (${res.status}): ${text.slice(0, 300)}`);
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "上传失败");
      setHapInfo(data);
    } catch (e: unknown) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("确认删除这条历史记录？")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/tests/${id}?action=delete`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json();
        alert(d.error || "删除失败");
        return;
      }
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } finally {
      setDeletingId(null);
    }
  };

  const handleStart = async () => {
    if (!hapInfo || !selectedDevice) return;
    setStarting(true);
    try {
      const res = await fetch("/api/tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // filePath 优先（Electron 路径模式），否则回退到 fileName
          ...(hapInfo.filePath ? { hapFilePath: hapInfo.filePath } : { fileName: hapInfo.fileName }),
          deviceId: selectedDevice,
          filterArch: filterArch || undefined,
          filterModule: filterModule || undefined,
          filterPattern: filterPattern || undefined,
          timeout,
          skipInstall,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/tests/${data.sessionId}`);
    } catch (e: unknown) {
      alert("启动失败: " + (e as Error).message);
    } finally {
      setStarting(false);
    }
  };

  const step1Done = !!selectedDevice;
  const step2Done = !!hapInfo;
  const step3Active = step1Done && step2Done;

  const runningSessions = sessions.filter((s) => s.status === "running");
  const historySessions = sessions.filter((s) => s.status !== "running");

  const cardStyle = {
    background: "rgba(255,255,255,0.85)",
    backdropFilter: "blur(12px)",
    border: "1px solid rgba(255,255,255,0.9)",
  };

  function SessionStatusBadge({ status }: { status: "running" | "completed" | "stopped" }) {
    if (status === "running") return (
              <span className="flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(65,205,82,0.12)", color: "#1d7a2e" }}>
        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#41CD52" }} />
        运行中
      </span>
    );
    if (status === "completed") return (
      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(16,185,129,0.1)", color: "#059669" }}>已完成</span>
    );
    return (
      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(245,158,11,0.1)", color: "#d97706" }}>已停止</span>
    );
  }

  function formatTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  function SessionCard({ s }: { s: SessionSummary }) {
    const total = s.summary?.total ?? s.results.length;
    const success = s.summary?.success ?? s.results.filter((r) => r.status === "success").length;
    const percent = total > 0 ? Math.round((success / total) * 100) : 0;
    return (
      <button
        onClick={() => router.push(`/tests/${s.id}`)}
        className="w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl transition-all hover:scale-[1.01]"
        style={{ background: s.status === "running" ? "linear-gradient(135deg,rgba(65,205,82,0.07),rgba(33,168,52,0.06))" : "rgba(0,0,0,0.03)", border: s.status === "running" ? "1.5px solid rgba(65,205,82,0.25)" : "1.5px solid rgba(0,0,0,0.07)" }}
      >
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: s.status === "running" ? "linear-gradient(135deg,#41CD52,#21a834)" : s.status === "completed" ? "linear-gradient(135deg,#10b981,#059669)" : "rgba(0,0,0,0.1)" }}>
          {s.status === "running" ? (
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : s.status === "completed" ? (
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-xs font-semibold text-gray-800 truncate">{s.hapFile}</p>
            <SessionStatusBadge status={s.status} />
          </div>
          <div className="flex items-center gap-3">
            <p className="text-xs text-gray-400 truncate">设备: {s.deviceId}</p>
            <p className="text-xs text-gray-400">{formatTime(s.startTime)}</p>
            {total > 0 && (
              <p className="text-xs" style={{ color: "#1d7a2e" }}>{success}/{total} ({percent}%)</p>
            )}
          </div>
        </div>
        {s.status !== "running" && (
          <button
            onClick={(e) => handleDelete(e, s.id)}
            disabled={deletingId === s.id}
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all hover:bg-red-50 text-gray-300 hover:text-red-400 disabled:opacity-50"
            title="删除记录"
          >
            {deletingId === s.id ? (
              <Spinner size="sm" />
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            )}
          </button>
        )}
        <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    );
  }

  return (
    <div className="space-y-7 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">测试执行</h1>
        <p className="text-sm text-gray-500 mt-1">按步骤配置并启动 Qt 单元测试</p>
      </div>

      {/* 运行中的会话 */}
      {runningSessions.length > 0 && (
        <div className="rounded-2xl p-4 shadow-sm" style={{ background: "linear-gradient(135deg,rgba(65,205,82,0.08),rgba(33,168,52,0.05))", border: "1.5px solid rgba(65,205,82,0.25)", backdropFilter: "blur(12px)" }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#41CD52" }} />
            <h2 className="text-sm font-semibold" style={{ color: "#1a6628" }}>进行中的测试</h2>
            <span className="text-xs px-1.5 py-0.5 rounded-full font-bold ml-auto" style={{ background: "rgba(65,205,82,0.15)", color: "#1d7a2e" }}>{runningSessions.length}</span>
          </div>
          <div className="space-y-2">
            {runningSessions.map((s) => <SessionCard key={s.id} s={s} />)}
          </div>
        </div>
      )}

      {/* 历史记录 */}
      {historySessions.length > 0 && (
        <div className="rounded-2xl shadow-sm overflow-hidden" style={cardStyle}>
          <div className="flex items-center gap-2 px-4 py-3 hover:bg-black/[0.02] transition-colors">
            <div
              className="flex items-center gap-2 flex-1 cursor-pointer"
              onClick={() => setShowHistory(!showHistory)}
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-semibold text-gray-600">历史记录</span>
              <span className="text-xs px-1.5 py-0.5 rounded-full ml-1" style={{ background: "rgba(0,0,0,0.06)", color: "#94a3b8" }}>{historySessions.length}</span>
            </div>
            <div className="flex items-center gap-2">
              {historySessions.length > 0 && (
                <button
                  onClick={handleDeleteAll}
                  disabled={deletingAll}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all hover:bg-red-50 text-gray-400 hover:text-red-500 disabled:opacity-50"
                  title="全部删除"
                >
                  {deletingAll ? (
                    <Spinner size="sm" />
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      全部删除
                    </>
                  )}
                </button>
              )}
              <div
                className="cursor-pointer"
                onClick={() => setShowHistory(!showHistory)}
              >
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${showHistory ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
          {showHistory && (
            <div className="px-4 pb-4 space-y-2">
              {historySessions.slice(0, 10).map((s) => <SessionCard key={s.id} s={s} />)}
              {historySessions.length > 10 && (
                <p className="text-xs text-center text-gray-400 pt-1">仅显示最近 10 条</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* 步骤进度条 */}
      <div className="flex items-center gap-2">
        {[
          { n: 1, label: "选择设备", done: step1Done, active: !step1Done },
          { n: 2, label: "上传 HAP", done: step2Done, active: step1Done && !step2Done },
          { n: 3, label: "配置参数", done: false, active: step3Active },
        ].map((s, i) => (
          <div key={s.n} className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <StepBadge n={s.n} active={s.active} done={s.done} />
              <span className={`text-xs font-medium ${s.done ? "text-emerald-600" : s.active ? "" : "text-gray-400"}`}
                style={s.active && !s.done ? { color: "#1d7a2e" } : {}}>
                {s.label}
              </span>
            </div>
            {i < 2 && <div className="w-8 h-px" style={{ background: "rgba(0,0,0,0.1)" }} />}
          </div>
        ))}
      </div>

      {/* Step 1: 选择设备 */}
      <div className="rounded-2xl p-5 shadow-sm" style={cardStyle}>
        <div className="flex items-center gap-3 mb-4">
          <StepBadge n={1} active={!step1Done} done={step1Done} />
          <h2 className="text-sm font-semibold text-gray-800">选择目标设备</h2>
        </div>
        {devicesLoading ? (
          <div className="flex items-center gap-2 p-3">
            <Spinner size="sm" />
            <span className="text-xs text-gray-400">检测设备中...</span>
          </div>
        ) : devices.length === 0 ? (
          <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
            <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-xs text-amber-700">未检测到设备，请前往设备管理页面检查连接</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {devices.map((d) => {
              const isSelected = selectedDevice === d.id;
              const info = deviceInfoMap[d.id];
              const loadingInfo = info === undefined;
              return (
                <div key={d.id} className="flex flex-col">
                  <button
                    onClick={() => selectDevice(d.id)}
                    className="flex items-center gap-3 p-3 rounded-xl text-left transition-all hover:scale-[1.01]"
                    style={
                      isSelected
                        ? { background: "linear-gradient(135deg, rgba(65,205,82,0.1), rgba(33,168,52,0.08))", border: "2px solid rgba(65,205,82,0.4)", borderRadius: info !== undefined ? "12px 12px 0 0" : undefined }
                        : { background: "rgba(0,0,0,0.03)", border: "2px solid transparent" }
                    }
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}>
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-gray-800 truncate">{d.id}</p>
                      <p className="text-xs text-emerald-600">在线</p>
                    </div>
                    {isSelected && (
                      <svg className="w-4 h-4 ml-auto shrink-0" style={{ color: "#41CD52" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                  {isSelected && (
                    <div className="px-3 py-2.5 rounded-b-xl" style={{ background: "rgba(65,205,82,0.03)", border: "2px solid rgba(65,205,82,0.4)", borderTop: "none" }}>
                      {loadingInfo ? (
                        <div className="flex items-center gap-2">
                          <Spinner size="sm" />
                          <span className="text-xs text-gray-400">获取设备信息...</span>
                        </div>
                      ) : info ? (
                        <div className="flex flex-col gap-1">
                          {([
                            ["名称", info.name],
                            ["品牌", info.brand],
                            ["型号", info.model],
                            ["API 版本", info.apiVersion],
                            ["CPU 架构", info.cpuAbiList],
                            ["系统版本", info.softwareVersion],
                          ] as [string, string | null][]).map(([label, val]) => (
                            <div key={label} className="flex items-start gap-2">
                              <span className="text-xs text-gray-400 shrink-0 w-14">{label}</span>
                              <span className="text-xs text-gray-700 font-medium break-all">{val || "—"}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Step 2: 上传 HAP */}
      <div className="rounded-2xl p-5 shadow-sm" style={cardStyle}>
        <div className="flex items-center gap-3 mb-4">
          <StepBadge n={2} active={step1Done && !step2Done} done={step2Done} />
          <h2 className="text-sm font-semibold text-gray-800">上传 HAP 包</h2>
        </div>
        <input ref={fileInputRef} type="file" accept=".hap" className="hidden" onChange={handleFileChange} />
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className="rounded-xl p-8 text-center cursor-pointer transition-all"
          style={
            dragging
              ? { border: "2px dashed #41CD52", background: "rgba(65,205,82,0.06)" }
              : hapInfo
              ? { border: "2px dashed rgba(16,185,129,0.4)", background: "rgba(16,185,129,0.04)" }
              : { border: "2px dashed rgba(65,205,82,0.3)", background: "rgba(65,205,82,0.02)" }
          }
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-3">
              <Spinner size="md" />
              <p className="text-sm text-gray-500">解析 HAP 中，请稍候...</p>
            </div>
          ) : hapInfo ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}>
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-800">{hapInfo.fileName}</p>
              <p className="text-xs text-gray-400">找到 <span style={{ color: "#1d7a2e" }} className="font-bold">{hapInfo.totalLibs}</span> 个测试库 · 点击重新上传</p>
              <div className="flex flex-wrap gap-1.5 justify-center mt-1">
                {hapInfo.archs.map((a) => (
                  <span key={a} className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(65,205,82,0.12)", color: "#1d7a2e" }}>{a}</span>
                ))}
                {hapInfo.modules.slice(0, 4).map((m) => (
                  <span key={m} className="text-xs px-2 py-0.5 rounded-full font-mono" style={{ background: "rgba(0,0,0,0.05)", color: "#64748b" }}>{m}</span>
                ))}
                {hapInfo.modules.length > 4 && (
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(0,0,0,0.05)", color: "#94a3b8" }}>+{hapInfo.modules.length - 4} 个模块</span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, rgba(65,205,82,0.12), rgba(33,168,52,0.1))" }}>
                <svg className="w-6 h-6" style={{ color: "#41CD52" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-gray-600">拖放或 <span style={{ color: "#1d7a2e" }} className="font-semibold">点击上传</span> HAP 文件</p>
                <p className="text-xs text-gray-400 mt-1">支持 entry-default-signed.hap</p>
              </div>
            </div>
          )}
        </div>
        {uploadError && (
          <p className="mt-2 text-xs text-red-500 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            {uploadError}
          </p>
        )}
      </div>

      {/* Step 3: 配置参数 */}
      {hapInfo && (
        <div className="rounded-2xl p-5 shadow-sm" style={cardStyle}>
          <div className="flex items-center gap-3 mb-5">
            <StepBadge n={3} active={step3Active} done={false} />
            <h2 className="text-sm font-semibold text-gray-800">测试配置</h2>
            <span className="text-xs text-gray-400 ml-auto">均为可选项</span>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">架构过滤</label>
                <select
                  value={filterArch}
                  onChange={(e) => setFilterArch(e.target.value)}
                  className="w-full text-sm rounded-xl px-3 py-2.5 outline-none transition-all"
                  style={{ background: "rgba(0,0,0,0.04)", border: "1.5px solid rgba(0,0,0,0.1)" }}
                >
                  <option value="">全部架构</option>
                  {hapInfo.archs.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">模块过滤</label>
                <select
                  value={filterModule}
                  onChange={(e) => setFilterModule(e.target.value)}
                  className="w-full text-sm rounded-xl px-3 py-2.5 outline-none transition-all"
                  style={{ background: "rgba(0,0,0,0.04)", border: "1.5px solid rgba(0,0,0,0.1)" }}
                >
                  <option value="">全部模块</option>
                  {hapInfo.modules.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">名称过滤（可选）</label>
              <input
                type="text"
                placeholder="如: qatomic"
                value={filterPattern}
                onChange={(e) => setFilterPattern(e.target.value)}
                className="w-full text-sm rounded-xl px-3 py-2.5 outline-none transition-all"
                style={{ background: "rgba(0,0,0,0.04)", border: "1.5px solid rgba(0,0,0,0.1)" }}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">单个测试超时</label>
              <div className="flex gap-2">
                {TIMEOUT_OPTIONS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTimeout_(t)}
                    className="flex-1 py-2 rounded-xl text-xs font-medium transition-all"
                    style={
                      timeout === t
                        ? { background: "linear-gradient(135deg, #41CD52, #21a834)", color: "white" }
                        : { background: "rgba(0,0,0,0.04)", color: "#64748b", border: "1.5px solid rgba(0,0,0,0.08)" }
                    }
                  >
                    {t}s
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.06)" }}>
              <div>
                <p className="text-sm font-medium text-gray-700">跳过安装步骤</p>
                <p className="text-xs text-gray-400">HAP 已安装时可跳过以节省时间</p>
              </div>
              <button
                onClick={() => setSkipInstall(!skipInstall)}
                className="w-11 h-6 rounded-full transition-all relative"
                style={{ background: skipInstall ? "linear-gradient(135deg, #41CD52, #21a834)" : "rgba(0,0,0,0.15)" }}
              >
                <span
                  className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
                  style={{ left: skipInstall ? "calc(100% - 22px)" : "2px" }}
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 启动按钮 */}
      <button
        onClick={handleStart}
        disabled={!hapInfo || !selectedDevice || starting}
        className="w-full py-3.5 rounded-2xl text-sm font-bold text-white shadow-lg transition-all hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
        style={{ background: "linear-gradient(135deg, #41CD52 0%, #21a834 100%)" }}
      >
        {starting ? (
          <span className="flex items-center justify-center gap-2">
            <Spinner size="sm" color="white" />
            正在启动测试...
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            开始执行测试
          </span>
        )}
      </button>
    </div>
  );
}
