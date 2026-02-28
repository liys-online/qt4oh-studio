"use client";

import { useEffect, useRef, useState } from "react";
import { Spinner } from "@heroui/react";
import { useRouter } from "next/navigation";

interface Device { id: string }
interface HapInfo {
  fileName: string;
  totalLibs: number;
  modules: string[];
  archs: string[];
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
          ? { background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "white" }
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

  const [devices, setDevices] = useState<Device[]>([]);
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

  useEffect(() => {
    fetch("/api/devices")
      .then((r) => r.json())
      .then((d) => {
        setDevices(d.devices || []);
        if (d.devices?.length === 1) setSelectedDevice(d.devices[0].id);
      });
  }, []);

  const uploadFile = async (file: File) => {
    if (!file.name.endsWith(".hap")) {
      setUploadError("请上传 .hap 格式的文件");
      return;
    }
    setUploadError("");
    setUploading(true);
    setHapInfo(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/hap", { method: "POST", body: formData });
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

  const handleStart = async () => {
    if (!hapInfo || !selectedDevice) return;
    setStarting(true);
    try {
      const res = await fetch("/api/tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: hapInfo.fileName,
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

  const cardStyle = {
    background: "rgba(255,255,255,0.85)",
    backdropFilter: "blur(12px)",
    border: "1px solid rgba(255,255,255,0.9)",
  };

  return (
    <div className="space-y-7 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">测试执行</h1>
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
              <span className={`text-xs font-medium ${s.done ? "text-emerald-600" : s.active ? "text-indigo-600" : "text-gray-400"}`}>
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
        {devices.length === 0 ? (
          <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
            <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-xs text-amber-700">未检测到设备，请前往设备管理页面检查连接</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {devices.map((d) => (
              <button
                key={d.id}
                onClick={() => setSelectedDevice(d.id)}
                className="flex items-center gap-3 p-3 rounded-xl text-left transition-all hover:scale-[1.01]"
                style={
                  selectedDevice === d.id
                    ? { background: "linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.1))", border: "2px solid rgba(99,102,241,0.4)" }
                    : { background: "rgba(0,0,0,0.03)", border: "2px solid transparent" }
                }
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}>
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-800 truncate">{d.id}</p>
                  <p className="text-xs text-emerald-600">在线</p>
                </div>
                {selectedDevice === d.id && (
                  <svg className="w-4 h-4 text-indigo-500 ml-auto shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            ))}
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
              ? { border: "2px dashed #6366f1", background: "rgba(99,102,241,0.06)" }
              : hapInfo
              ? { border: "2px dashed rgba(16,185,129,0.4)", background: "rgba(16,185,129,0.04)" }
              : { border: "2px dashed rgba(99,102,241,0.25)", background: "rgba(99,102,241,0.02)" }
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
              <p className="text-xs text-gray-400">找到 <span className="text-indigo-600 font-bold">{hapInfo.totalLibs}</span> 个测试库 · 点击重新上传</p>
              <div className="flex flex-wrap gap-1.5 justify-center mt-1">
                {hapInfo.archs.map((a) => (
                  <span key={a} className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(99,102,241,0.1)", color: "#6366f1" }}>{a}</span>
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
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.1))" }}>
                <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-gray-600">拖放或 <span className="text-indigo-600 font-semibold">点击上传</span> HAP 文件</p>
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
                        ? { background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "white" }
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
                style={{ background: skipInstall ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : "rgba(0,0,0,0.15)" }}
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
        style={{ background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)" }}
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
