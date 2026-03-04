"use client";

import { useState } from "react";
import { useDevices } from "../../devices-context";

export default function ScreenshotPage() {
  const { devices } = useDevices();
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCapture = async () => {
    if (!selectedDevice) return;
    setLoading(true);
    setError(null);
    setScreenshotUrl(null);
    try {
      const res = await fetch(`/api/devices/${selectedDevice}/screenshot`);
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      setScreenshotUrl(URL.createObjectURL(blob));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "截图失败");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!screenshotUrl) return;
    const a = document.createElement("a");
    a.href = screenshotUrl;
    a.download = `screenshot-${selectedDevice}-${Date.now()}.png`;
    a.click();
  };

  return (
    <div className="space-y-7">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800">截图工具</h1>
        <p className="text-sm text-gray-500 mt-1">对已连接的 HarmonyOS 设备进行实时截图</p>
      </div>

      {/* 控制区 */}
      <div
        className="rounded-2xl p-5 flex flex-wrap items-end gap-4"
        style={{ background: "rgba(255,255,255,0.85)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.9)", boxShadow: "0 2px 16px rgba(0,0,0,0.06)" }}
      >
        <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">选择设备</label>
          <select
            value={selectedDevice}
            onChange={(e) => setSelectedDevice(e.target.value)}
            className="rounded-xl px-3 py-2.5 text-sm border outline-none focus:ring-2 focus:ring-green-400"
            style={{ background: "#f8fafc", borderColor: "#e2e8f0", color: "#1e293b" }}
          >
            <option value="">-- 请选择设备 --</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>{d.id}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleCapture}
          disabled={!selectedDevice || loading}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow hover:shadow-md disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #41CD52, #21a834)", color: "white" }}
        >
          <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {loading
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              : <>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </>
            }
          </svg>
          {loading ? "截图中…" : "立即截图"}
        </button>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="rounded-xl px-4 py-3 text-sm text-red-600" style={{ background: "rgba(254,226,226,0.8)", border: "1px solid rgba(252,165,165,0.5)" }}>
          {error}
        </div>
      )}

      {/* 截图预览 */}
      {screenshotUrl && (
        <div
          className="rounded-2xl p-5 flex flex-col items-center gap-4"
          style={{ background: "rgba(255,255,255,0.85)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.9)", boxShadow: "0 2px 16px rgba(0,0,0,0.06)" }}
        >
          <div className="flex w-full items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">预览</span>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:shadow"
              style={{ background: "linear-gradient(135deg, #41CD52, #21a834)", color: "white" }}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              下载
            </button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={screenshotUrl} alt="screenshot" className="max-w-full rounded-xl shadow-lg" style={{ maxHeight: 600, objectFit: "contain" }} />
        </div>
      )}

      {/* 空状态 */}
      {!screenshotUrl && !loading && !error && (
        <div
          className="rounded-2xl flex flex-col items-center justify-center gap-3 py-16"
          style={{ background: "rgba(255,255,255,0.6)", border: "1px dashed rgba(65,205,82,0.3)" }}
        >
          <svg className="w-12 h-12" style={{ color: "rgba(65,205,82,0.4)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-sm text-gray-400">选择设备后点击「立即截图」</p>
        </div>
      )}
    </div>
  );
}
