"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Spinner } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useDevices } from "../devices-context";
import { SessionCard } from "@/components/SessionCard";
import { cardStyle } from "@/lib/status";

interface HapInfo {
  fileName: string;
  filePath?: string;
  totalLibs: number;
  modules: string[];
  archs: string[];
  testLibs?: { module: string; name: string; path: string; arch?: string }[];
  /** HAP 内 resources/resfile/gitignore 列出的忽略模块 */
  ignoreList?: string[];
}

interface SessionSummary {
  id: string;
  hapFile: string;
  deviceId: string;
  status: "running" | "completed" | "stopped";
  startTime: string;
  endTime?: string;
  summary?: { total: number; success: number; failed: number; timeout: number; crash: number; interrupted: number };
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

  const [filterModule, setFilterModule] = useState<string[]>([]);
  const [packageName, setPackageName] = useState("com.qtsig.qtest");
  const [abilityName, setAbilityName] = useState("EntryAbility");
  const [timeout, setTimeout_] = useState(300);
  const [skipInstall, setSkipInstall] = useState(false);
  const [disableIgnoreList, setDisableIgnoreList] = useState(false);
  const [starting, setStarting] = useState(false);

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);

  // GitCode Releases
  const [hapSource, setHapSource] = useState<"local" | "gitcode">("gitcode");
  interface GcRelease {
    tag_name: string;
    name: string;
    body: string;
    created_at: string;
    prerelease: boolean;
    hapAssets: { name: string; browser_download_url: string; type: string }[];
  }
  interface GcCachedFile { name: string; size: number; mtime: string; }
  const [gcReleases, setGcReleases] = useState<GcRelease[]>([]);
  const [gcLoading, setGcLoading] = useState(false);
  const [gcError, setGcError] = useState("");
  const [gcExpanded, setGcExpanded] = useState<string | null>(null);
  const [gcDownloadProgress, setGcDownloadProgress] = useState<{ fileName: string; p: number; dl: number; total: number } | null>(null);
  const [gcCachedFiles, setGcCachedFiles] = useState<GcCachedFile[]>([]);
  const [gcDeletingFile, setGcDeletingFile] = useState("");
  const [showCachedModal, setShowCachedModal] = useState(false);

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

  const refreshSessions = () =>
    fetch("/api/tests")
      .then((r) => r.json())
      .then((d) => setSessions(d.sessions || []));

  useEffect(() => {
    refreshSessions();
    // 默认展示 GitCode 选项卡，提前加载数据
    fetchGcReleases();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 监听 BroadcastChannel — 详情页重跑完成后实时通知列表刷新
  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("qt4oh_sessions");
      bc.onmessage = () => refreshSessions();
    } catch { /* 环境不支持时忽略 */ }
    return () => { try { bc?.close(); } catch { /* ignore */ } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 页面可见/获焦时立即刷新（从详情页返回列表页时触发）
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") refreshSessions(); };
    const onFocus = () => refreshSessions();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 有运行中的会话、或有任意结果正在重跑时，每 3s 快速轮询
  const hasRunning = sessions.some(
    (s) => s.status === "running" || s.results.some((r) => r.status === "running" || r.status === "pending")
  );
  useEffect(() => {
    const interval = hasRunning ? 3000 : 10000;
    const timer = setInterval(refreshSessions, interval);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRunning]);

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

  const fmtBytes = (n: number) => {
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
    return `${(n / 1024 ** 3).toFixed(2)} GB`;
  };

  const fetchGcCachedFiles = async () => {
    try {
      const res = await fetch("/api/gitcode-releases/download");
      const data = await res.json();
      if (res.ok) setGcCachedFiles(data.files || []);
    } catch { /* ignore */ }
  };

  const fetchGcReleases = async () => {
    setGcLoading(true);
    setGcError("");
    try {
      const [relRes] = await Promise.all([
        fetch("/api/gitcode-releases"),
        fetchGcCachedFiles(),
      ]);
      const data = await relRes.json();
      if (!relRes.ok) throw new Error(data.error || "获取 releases 失败");
      setGcReleases(data.releases || []);
      if (data.releases?.length > 0) setGcExpanded(data.releases[0].tag_name);
    } catch (e: unknown) {
      setGcError((e as Error).message);
    } finally {
      setGcLoading(false);
    }
  };

  const handleGcDownload = async (url: string, fileName: string) => {
    setUploadError("");
    setGcDownloadProgress({ fileName, p: 0, dl: 0, total: 0 });
    try {
      const res = await fetch("/api/gitcode-releases/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, fileName }),
      });
      if (!res.body) throw new Error("无响应流");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const evt = JSON.parse(line.slice(6)) as {
            status: string; p?: number; dl?: number; total?: number;
            data?: HapInfo & { size?: number }; message?: string;
          };
          if (evt.status === "progress") {
            setGcDownloadProgress({ fileName, p: evt.p ?? 0, dl: evt.dl ?? 0, total: evt.total ?? 0 });
          } else if (evt.status === "done" || evt.status === "exists") {
            if (evt.data) setHapInfo(evt.data);
            setGcDownloadProgress(null);
            await fetchGcCachedFiles();
          } else if (evt.status === "error") {
            throw new Error(evt.message || "下载失败");
          }
        }
      }
    } catch (e: unknown) {
      setUploadError((e as Error).message);
      setGcDownloadProgress(null);
    }
  };

  const handleGcDeleteFile = async (fileName: string) => {
    if (!confirm(`确认删除已下载的 ${fileName}？`)) return;
    setGcDeletingFile(fileName);
    try {
      const res = await fetch(`/api/gitcode-releases/download?file=${encodeURIComponent(fileName)}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); alert(d.error || "删除失败"); return; }
      setGcCachedFiles((prev) => prev.filter((f) => f.name !== fileName));
      if (hapInfo?.fileName === fileName) setHapInfo(null);
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setGcDeletingFile("");
    }
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
          packageName,
          abilityName,
          filterArch: filterArch || undefined,
          filterModule: filterModule.length > 0 ? filterModule : undefined,
          timeout,
          skipInstall,
          disableIgnoreList: disableIgnoreList || undefined,
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

  // 有效库列表：disableIgnoreList=false（默认）时要剔除 ignoreList 中的库
  const effectiveTestLibs = useMemo(() => {
    const libs = hapInfo?.testLibs ?? [];
    if (!hapInfo || disableIgnoreList || !hapInfo.ignoreList?.length) return libs;
    const ignoreSet = hapInfo.ignoreList;
    return libs.filter((lib) => {
      const nameNoSo = lib.name.replace(/\.so$/, '');
      const shortName = nameNoSo.replace(/^libtst_/, '');
      return !ignoreSet.some(
        (entry) => entry === lib.path || entry === lib.module || entry === lib.name || entry === nameNoSo || entry === shortName
      );
    });
  }, [hapInfo, disableIgnoreList]);

  const moduleCounts = useMemo(() =>
    effectiveTestLibs.reduce<Record<string, number>>((acc, lib) => {
      if (lib.module && lib.module !== "unknown") {
        acc[lib.module] = (acc[lib.module] || 0) + 1;
      }
      return acc;
    }, {})
  , [effectiveTestLibs]);

  // 从选中设备的 CPU ABI 列表中取主架构作为架构过滤
  const filterArch = useMemo(() => {
    if (!selectedDevice) return undefined;
    const info = deviceInfoMap[selectedDevice];
    if (!info?.cpuAbiList) return undefined;
    return info.cpuAbiList.split(',')[0].trim() || undefined;
  }, [selectedDevice, deviceInfoMap]);

  const sortedModules = useMemo(() =>
    Object.keys(moduleCounts).sort((a, b) => (moduleCounts[b] || 0) - (moduleCounts[a] || 0))
  , [moduleCounts]);

  const effectiveTotal = effectiveTestLibs.length;

  const runningSessions = sessions.filter((s) => s.status === "running");
  const historySessions = sessions.filter((s) => s.status !== "running");

  return (
    <div className="w-full px-2 lg:px-4 2xl:px-6">
      <div className="space-y-7">
        {/* Header */}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800">测试执行</h1>
          <p className="text-sm text-gray-500 mt-1">按步骤配置并启动 Qt 单元测试</p>
        </div>

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

        {/* 设置区：左设备+上传，右配置 */}
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(520px,42%)] gap-6">
          <div className="space-y-7">
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
              {/* 标题 + Tab 切换 */}
              <div className="flex items-center gap-3 mb-4">
                <StepBadge n={2} active={step1Done && !step2Done} done={step2Done} />
                <h2 className="text-sm font-semibold text-gray-800">选择 HAP 包</h2>
                <div className="ml-auto flex rounded-lg overflow-hidden" style={{ border: "1.5px solid rgba(0,0,0,0.1)" }}>
                  {(["gitcode", "local"] as const).map((src) => (
                    <button
                      key={src}
                      onClick={() => {
                        setHapSource(src);
                        if (src === "gitcode") {
                          fetchGcCachedFiles();
                          if (gcReleases.length === 0 && !gcLoading) fetchGcReleases();
                        }
                      }}
                      className="px-3 py-1 text-xs font-medium transition-all"
                      style={
                        hapSource === src
                          ? { background: "linear-gradient(135deg, #41CD52, #21a834)", color: "white" }
                          : { background: "transparent", color: "#64748b" }
                      }
                    >
                      {src === "local" ? "本地上传" : "GitCode"}
                    </button>
                  ))}
                </div>
              </div>

              {hapSource === "local" ? (
                <>
                  <input ref={fileInputRef} type="file" accept=".hap" className="hidden" onChange={handleFileChange} />
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={handleDrop}
                    className="rounded-xl p-6 cursor-pointer transition-all"
                    style={
                      dragging
                        ? { border: "2px dashed #41CD52", background: "rgba(65,205,82,0.06)" }
                        : hapInfo
                        ? { border: "2px dashed rgba(16,185,129,0.4)", background: "rgba(16,185,129,0.04)" }
                        : { border: "2px dashed rgba(65,205,82,0.3)", background: "rgba(65,205,82,0.02)" }
                    }
                  >
                    {uploading ? (
                      <div className="flex flex-col sm:flex-row items-center gap-4">
                        <Spinner size="md" />
                        <p className="text-sm text-gray-500">解析 HAP 中，请稍候...</p>
                      </div>
                    ) : hapInfo ? (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}>
                          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{hapInfo.fileName}</p>
                          <p className="text-xs text-gray-400">找到 <span style={{ color: "#1d7a2e" }} className="font-bold">{effectiveTotal}</span> 个测试库{!disableIgnoreList && hapInfo.ignoreList?.length ? <span style={{ color: "#b45309" }}>（已忽略 {hapInfo.totalLibs - effectiveTotal} 个）</span> : ""} · 点击重新上传</p>
                        </div>
                        <div className="flex flex-wrap gap-1.5 sm:ml-auto">
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
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, rgba(65,205,82,0.12), rgba(33,168,52,0.1))" }}>
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
                </>
              ) : (
                /* GitCode Releases 面板 */
                <div className="space-y-3">
                  {/* ── 下载进度条 ─────────────────────────────────────── */}
                  {gcDownloadProgress && (
                    <div className="rounded-xl p-3 space-y-2" style={{ background: "rgba(65,205,82,0.05)", border: "1.5px solid rgba(65,205,82,0.25)" }}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-700 truncate max-w-[60%]">{gcDownloadProgress.fileName}</span>
                        <span className="text-xs font-bold" style={{ color: "#1d7a2e" }}>{gcDownloadProgress.p}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full" style={{ background: "rgba(0,0,0,0.08)" }}>
                        <div className="h-1.5 rounded-full transition-all" style={{ width: `${gcDownloadProgress.p}%`, background: "linear-gradient(90deg, #41CD52, #21a834)" }} />
                      </div>
                      <p className="text-xs text-gray-400">
                        {gcDownloadProgress.total > 0
                          ? `${fmtBytes(gcDownloadProgress.dl)} / ${fmtBytes(gcDownloadProgress.total)}`
                          : `已下载 ${fmtBytes(gcDownloadProgress.dl)}`}
                      </p>
                    </div>
                  )}

                  {/* ── 已下载缓存文件列表 ──────────────────────────────── */}
                  {gcCachedFiles.length > 0 && (
                    <button
                      onClick={() => setShowCachedModal(true)}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-left transition-all hover:opacity-80"
                      style={{ background: "rgba(16,185,129,0.07)", border: "1.5px solid rgba(16,185,129,0.25)" }}
                    >
                      <svg className="w-3.5 h-3.5 shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                      </svg>
                      <span className="text-xs font-semibold text-emerald-700">已下载缓存</span>
                      <span className="text-xs text-gray-400 ml-0.5">{gcCachedFiles.length} 个文件</span>
                      {hapInfo && gcCachedFiles.some((f) => f.name === hapInfo.fileName) && (
                        <span className="text-xs px-1.5 py-0.5 rounded-md ml-auto shrink-0" style={{ background: "rgba(16,185,129,0.12)", color: "#10b981" }}>已选中</span>
                      )}
                      <svg className="w-3.5 h-3.5 text-gray-400 ml-auto shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  )}

                  {/* ── Releases 列表 ────────────────────────────────────── */}
                  {gcLoading ? (
                    <div className="flex items-center gap-3 py-4 justify-center">
                      <Spinner size="sm" />
                      <span className="text-xs text-gray-400">加载 releases 列表...</span>
                    </div>
                  ) : gcError ? (
                    <div className="rounded-xl p-4" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
                      <p className="text-xs text-red-500">{gcError}</p>
                      <button onClick={fetchGcReleases} className="mt-2 text-xs font-medium" style={{ color: "#41CD52" }}>重试</button>
                    </div>
                  ) : gcReleases.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-8 text-gray-400">
                      <svg className="w-8 h-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                      <p className="text-xs">暂无可用的 HAP 发布包</p>
                    </div>
                  ) : (
                    gcReleases.map((release) => (
                      <div key={release.tag_name} className="rounded-xl overflow-hidden" style={{ border: "1.5px solid rgba(0,0,0,0.08)" }}>
                        <button
                          className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
                          style={{ background: gcExpanded === release.tag_name ? "rgba(65,205,82,0.06)" : "rgba(0,0,0,0.02)" }}
                          onClick={() => setGcExpanded(gcExpanded === release.tag_name ? null : release.tag_name)}
                        >
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, #41CD52, #21a834)" }}>
                            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-gray-800">{release.name || release.tag_name}</p>
                            <p className="text-xs text-gray-400">{new Date(release.created_at).toLocaleDateString("zh-CN")} · {release.hapAssets.length} 个 HAP</p>
                          </div>
                          <svg
                            className="w-4 h-4 text-gray-400 shrink-0 transition-transform"
                            style={{ transform: gcExpanded === release.tag_name ? "rotate(180deg)" : "none" }}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {gcExpanded === release.tag_name && (
                          <div className="px-4 pb-3 pt-2 space-y-2" style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                            {release.body && (
                              <p className="text-xs text-gray-500 whitespace-pre-wrap mb-1">{release.body}</p>
                            )}
                            {release.hapAssets.map((asset) => {
                              const isCached = gcCachedFiles.some((f) => f.name === asset.name);
                              const isActiveDownload = gcDownloadProgress?.fileName === asset.name;
                              const isSelected = hapInfo?.fileName === asset.name;
                              return (
                                <div key={asset.name} className="flex items-center gap-3 rounded-lg px-3 py-2.5"
                                  style={{ background: isSelected ? "rgba(16,185,129,0.06)" : isCached ? "rgba(65,205,82,0.03)" : "rgba(0,0,0,0.03)", border: isSelected ? "1px solid rgba(16,185,129,0.3)" : isCached ? "1px solid rgba(65,205,82,0.2)" : "1px solid rgba(0,0,0,0.06)" }}
                                >
                                  <svg className="w-4 h-4 shrink-0" style={{ color: isSelected ? "#10b981" : isCached ? "#41CD52" : "#64748b" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                  <span className="flex-1 text-xs font-mono text-gray-700 truncate">{asset.name}</span>
                                  {isCached && !isSelected && (
                                    <span className="text-xs px-1.5 py-0.5 rounded-md shrink-0" style={{ background: "rgba(65,205,82,0.1)", color: "#1d7a2e" }}>已缓存</span>
                                  )}
                                  {isSelected ? (
                                    <span className="text-xs font-medium shrink-0" style={{ color: "#10b981" }}>已选中</span>
                                  ) : isActiveDownload ? (
                                    <span className="text-xs text-gray-400 shrink-0">{gcDownloadProgress!.p}%</span>
                                  ) : (
                                    <button
                                      onClick={() => handleGcDownload(isCached ? "" : asset.browser_download_url, asset.name)}
                                      disabled={!!gcDownloadProgress}
                                      className="text-xs font-medium px-2.5 py-1 rounded-lg transition-all disabled:opacity-40 shrink-0"
                                      style={{ background: "linear-gradient(135deg, rgba(65,205,82,0.12), rgba(33,168,52,0.1))", color: "#1d7a2e", border: "1px solid rgba(65,205,82,0.3)" }}
                                    >
                                      {isCached ? "选择" : "下载"}
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {uploadError && (
                <p className="mt-2 text-xs text-red-500 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  {uploadError}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {/* Step 3: 配置参数 */}
            <div
              className="rounded-2xl p-5 shadow-sm"
              style={{
                ...cardStyle,
                opacity: hapInfo ? 1 : 0.45,
                pointerEvents: hapInfo ? "auto" : "none",
                transition: "opacity 0.2s",
              }}
            >
                <div className="flex items-center gap-3 mb-5">
                  <StepBadge n={3} active={step3Active} done={false} />
                  <h2 className="text-sm font-semibold text-gray-800">测试配置</h2>
                  <span className="text-xs text-gray-400 ml-auto">均为可选项</span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1.5 block">包名</label>
                      <input
                        type="text"
                        placeholder="com.qtsig.qtest"
                        value={packageName}
                        onChange={(e) => setPackageName(e.target.value)}
                        className="w-full text-sm rounded-xl px-3 py-2.5 outline-none transition-all"
                        style={{ background: "rgba(0,0,0,0.04)", border: "1.5px solid rgba(0,0,0,0.1)" }}
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1.5 block">Ability</label>
                      <input
                        type="text"
                        placeholder="EntryAbility"
                        value={abilityName}
                        onChange={(e) => setAbilityName(e.target.value)}
                        className="w-full text-sm rounded-xl px-3 py-2.5 outline-none transition-all"
                        style={{ background: "rgba(0,0,0,0.04)", border: "1.5px solid rgba(0,0,0,0.1)" }}
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-medium text-gray-500">模块过滤（可多选）</label>
                        {!disableIgnoreList && (hapInfo?.ignoreList ?? []).length > 0 && (hapInfo?.totalLibs ?? 0) > effectiveTotal && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: "rgba(245,158,11,0.12)", color: "#b45309" }}>
                            已忽略 {(hapInfo?.totalLibs ?? 0) - effectiveTotal} 个库
                          </span>
                        )}
                      </div>
                      <div className="rounded-xl p-2" style={{ background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.06)" }}>
                        <label
                          className="w-full flex items-center justify-between text-xs px-3 py-2 rounded-lg font-medium transition-all"
                          style={{
                            cursor: "pointer",
                            background: filterModule.length === 0 ? "rgba(65,205,82,0.15)" : "transparent",
                            color: filterModule.length === 0 ? "#1d7a2e" : "#64748b",
                          }}
                        >
                          <span className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={filterModule.length === 0}
                              onChange={() => setFilterModule([])}
                            />
                            <span>全部模块</span>
                          </span>
                          <span className="text-[11px]" style={{ color: "#94a3b8" }}>{effectiveTotal}</span>
                        </label>
                        <div className="mt-1 max-h-44 overflow-y-auto space-y-1 pr-1">
                          {sortedModules.map((m) => {
                            const active = filterModule.includes(m);
                            const count = moduleCounts[m] || 0;
                            return (
                              <label
                                key={m}
                                className="w-full flex items-center justify-between text-xs px-3 py-2 rounded-lg font-medium transition-all"
                                style={{
                                  cursor: "pointer",
                                  background: active ? "rgba(65,205,82,0.15)" : "transparent",
                                  color: active ? "#1d7a2e" : "#64748b",
                                }}
                              >
                                <span className="flex items-center gap-2 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={active}
                                    onChange={() =>
                                      setFilterModule((prev) =>
                                        prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]
                                      )
                                    }
                                  />
                                  <span className="truncate">{m}</span>
                                </span>
                                <span className="text-[11px]" style={{ color: active ? "#1d7a2e" : "#94a3b8" }}>{count}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1.5 block">单个测试超时</label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {TIMEOUT_OPTIONS.map((t) => (
                          <button
                            key={t}
                            onClick={() => setTimeout_(t)}
                            className="py-2 rounded-xl text-xs font-medium transition-all"
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

                    <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.06)" }}>
                      <div>
                        <p className="text-sm font-medium text-gray-700">忽略列表（gitignore）</p>
                        <p className="text-xs text-gray-400">开启后不跟随 HAP 内置忽略列表过滤测试库</p>
                      </div>
                      <button
                        onClick={() => setDisableIgnoreList(!disableIgnoreList)}
                        className="w-11 h-6 rounded-full transition-all relative"
                        style={{ background: disableIgnoreList ? "linear-gradient(135deg, #f59e0b, #d97706)" : "rgba(0,0,0,0.15)" }}
                      >
                        <span
                          className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
                          style={{ left: disableIgnoreList ? "calc(100% - 22px)" : "2px" }}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

            {/* 启动按钮 */}
            <div className="mt-5">
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
          </div>
        </div>

        {/* 会话区（全宽） */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* 运行中的会话 */}
          <div className="rounded-2xl p-4 shadow-sm" style={{ background: "linear-gradient(135deg,rgba(65,205,82,0.08),rgba(33,168,52,0.05))", border: "1.5px solid rgba(65,205,82,0.25)", backdropFilter: "blur(12px)" }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#41CD52" }} />
              <h2 className="text-sm font-semibold" style={{ color: "#1a6628" }}>进行中的测试</h2>
              <span className="text-xs px-1.5 py-0.5 rounded-full font-bold ml-auto" style={{ background: "rgba(65,205,82,0.15)", color: "#1d7a2e" }}>{runningSessions.length}</span>
            </div>
            {runningSessions.length > 0 ? (
              <div className="space-y-2">
                {runningSessions.map((s) => (
                  <SessionCard key={s.id} session={s} href={`/tests/${s.id}`} onDelete={handleDelete} deletingId={deletingId} />
                ))}
              </div>
            ) : (
              <div className="rounded-xl p-6 text-center" style={{ background: "rgba(255,255,255,0.7)", border: "1px dashed rgba(65,205,82,0.2)" }}>
                <p className="text-sm text-gray-500">暂无运行中的测试</p>
                <p className="text-xs text-gray-400 mt-1">配置参数后点击开始执行测试</p>
              </div>
            )}
          </div>

          {/* 历史记录 */}
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
            {historySessions.length === 0 ? (
              <div className="px-4 pb-5">
                <div className="rounded-xl p-6 text-center" style={{ background: "rgba(0,0,0,0.02)", border: "1px dashed rgba(0,0,0,0.08)" }}>
                  <p className="text-sm text-gray-500">暂无历史记录</p>
                  <p className="text-xs text-gray-400 mt-1">完成测试后会显示在这里</p>
                </div>
              </div>
            ) : showHistory ? (
              <div className="px-4 pb-4 space-y-2">
                {historySessions.slice(0, 10).map((s) => (
                  <SessionCard key={s.id} session={s} href={`/tests/${s.id}`} onDelete={handleDelete} deletingId={deletingId} />
                ))}
                {historySessions.length > 10 && (
                  <p className="text-xs text-center text-gray-400 pt-1">仅显示最近 10 条</p>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── 已下载缓存弹窗 ────────────────────────────────────────────────── */}
      {showCachedModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}
          onClick={() => setShowCachedModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
            style={{ background: "white" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 弹窗标题 */}
            <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
              <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              <h3 className="text-sm font-semibold text-gray-800 flex-1">已下载缓存</h3>
              <span className="text-xs text-gray-400">{gcCachedFiles.length} 个文件</span>
              <button
                onClick={() => setShowCachedModal(false)}
                className="ml-2 p-1 rounded-lg hover:bg-gray-100 transition-all"
              >
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* 文件列表 */}
            <div className="divide-y divide-black/5 max-h-[60vh] overflow-y-auto">
              {gcCachedFiles.map((f) => {
                const isSelected = hapInfo?.fileName === f.name;
                const isDeleting = gcDeletingFile === f.name;
                return (
                  <div key={f.name} className="flex items-center gap-3 px-5 py-3" style={{ background: isSelected ? "rgba(16,185,129,0.04)" : "white" }}>
                    <svg className="w-4 h-4 shrink-0" style={{ color: isSelected ? "#10b981" : "#64748b" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono text-gray-800 truncate">{f.name}</p>
                      <p className="text-xs text-gray-400">{fmtBytes(f.size)}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isSelected ? (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-md" style={{ background: "rgba(16,185,129,0.12)", color: "#10b981" }}>已选中</span>
                      ) : (
                        <button
                          onClick={() => { handleGcDownload("", f.name); setShowCachedModal(false); }}
                          disabled={!!gcDownloadProgress || isDeleting}
                          className="text-xs font-medium px-2 py-1 rounded-lg transition-all disabled:opacity-40"
                          style={{ background: "rgba(65,205,82,0.1)", color: "#1d7a2e", border: "1px solid rgba(65,205,82,0.3)" }}
                        >
                          选择
                        </button>
                      )}
                      <button
                        onClick={() => handleGcDeleteFile(f.name)}
                        disabled={isDeleting || !!gcDownloadProgress}
                        className="p-1 rounded-lg transition-all disabled:opacity-40 hover:bg-red-50"
                        title="删除"
                      >
                        {isDeleting ? <Spinner size="sm" /> : (
                          <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
