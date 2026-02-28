"use client";

import { useEffect, useState } from "react";
import { Button, Spinner } from "@heroui/react";

interface Device {
  id: string;
  status: string;
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDevices = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch("/api/devices");
      const data = await res.json();
      setDevices(data.devices || []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDevices();
    const timer = setInterval(() => fetchDevices(true), 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="space-y-7">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">设备管理</h1>
          <p className="text-sm text-gray-500 mt-1">已连接的 HarmonyOS 设备 · 每 5 秒自动刷新</p>
        </div>
        <button
          onClick={() => fetchDevices(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all shadow-sm hover:shadow-md"
          style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "white", opacity: refreshing ? 0.7 : 1 }}
        >
          <svg className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {refreshing ? "刷新中..." : "手动刷新"}
        </button>
      </div>

      {/* 状态概览条 */}
      <div className="rounded-2xl p-4 flex items-center gap-4" style={{ background: "rgba(255,255,255,0.8)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.9)" }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}>
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-800">
            已连接 <span className="text-emerald-600">{devices.length}</span> 台设备
          </p>
          <p className="text-xs text-gray-400">通过 hdc list targets 检测</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          实时监控中
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3">
          <Spinner size="lg" />
          <p className="text-sm text-gray-400">检测设备中...</p>
        </div>
      ) : devices.length === 0 ? (
        /* 空状态 */
        <div className="rounded-2xl p-12 flex flex-col items-center gap-4 text-center" style={{ background: "rgba(255,255,255,0.8)", backdropFilter: "blur(12px)", border: "2px dashed rgba(99,102,241,0.2)" }}>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.1))" }}>
            <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
            </svg>
          </div>
          <div>
            <p className="text-base font-semibold text-gray-700">未检测到连接设备</p>
            <p className="text-sm text-gray-400 mt-1 max-w-xs">请通过 USB 连接 HarmonyOS 设备，并确保 hdc 工具已配置在 PATH 中</p>
          </div>
          <button
            onClick={() => fetchDevices(true)}
            className="px-5 py-2 rounded-xl text-sm font-medium text-white shadow-sm"
            style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
          >
            重新检测
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {devices.map((device, i) => (
            <div key={device.id} className="relative overflow-hidden rounded-2xl p-5 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5" style={{ background: "rgba(255,255,255,0.85)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.9)" }}>
              {/* 装饰圆 */}
              <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full opacity-10" style={{ background: "linear-gradient(135deg, #10b981, #059669)" }} />
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-sm" style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}>
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-800 truncate">{device.id}</p>
                    <span className="shrink-0 flex items-center gap-1 text-xs text-emerald-600 font-medium px-2 py-0.5 rounded-full" style={{ background: "rgba(16,185,129,0.1)" }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      在线
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5 font-mono truncate">{device.id}</p>
                </div>
              </div>
              <div className="mt-4 pt-3 flex justify-between text-xs" style={{ borderTop: "1px solid rgba(0,0,0,0.05)" }}>
                <span className="text-gray-400">设备 #{i + 1}</span>
                <span className="text-emerald-600 font-medium">已就绪</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* hdc 使用说明 */}
      <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.7)", backdropFilter: "blur(12px)", border: "1px solid rgba(99,102,241,0.15)" }}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-sm font-semibold text-gray-700">hdc 工具说明</h2>
        </div>
        <div className="rounded-xl p-3 font-mono text-xs space-y-1 mb-2" style={{ background: "rgba(15,23,42,0.04)" }}>
          <p className="text-gray-400"># 列出所有已连接设备</p>
          <p className="text-indigo-600 font-semibold">hdc list targets</p>
        </div>
        <p className="text-xs text-gray-400">确保已将 hdc 工具添加到系统 PATH，或将其放置在项目根目录。设备列表每 5 秒自动刷新。</p>
      </div>
    </div>
  );
}
