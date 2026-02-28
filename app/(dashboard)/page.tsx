"use client";

import { useEffect, useState } from "react";
import { Card, CardBody, CardHeader, Chip, Button, Spinner } from "@heroui/react";
import Link from "next/link";

interface Overview {
  totalSessions: number;
  completedSessions: number;
  runningSessions: number;
  totalTests: number;
  totalSuccess: number;
  totalFailed: number;
  totalTimeout: number;
  totalCrash: number;
}

interface Session {
  id: string;
  hapFile: string;
  deviceId: string;
  status: string;
  startTime: string;
  endTime?: string;
  summary?: {
    total: number;
    success: number;
    failed: number;
    timeout: number;
    crash: number;
  };
}

function StatCard({
  label,
  value,
  gradient,
  icon,
  sub,
}: {
  label: string;
  value: number;
  gradient: string;
  icon: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl p-5 shadow-sm hover:shadow-md transition-all" style={{ background: "rgba(255,255,255,0.8)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.9)" }}>
      {/* 较大装饰圆 */}
      <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full opacity-10" style={{ background: gradient }} />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-3xl font-bold text-gray-800">{value}</p>
          <p className="text-sm text-gray-500 mt-1">{label}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        <div className="w-11 h-11 rounded-xl flex items-center justify-center shadow-sm" style={{ background: gradient }}>
          {icon}
        </div>
      </div>
    </div>
  );
}

const statusColorMap: Record<string, "success" | "warning" | "danger" | "primary" | "default"> = {
  completed: "success",
  running: "primary",
  stopped: "warning",
};

const statusLabelMap: Record<string, string> = {
  completed: "已完成",
  running: "运行中",
  stopped: "已停止",
};

export default function DashboardPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [devices, setDevices] = useState<{ id: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [reportRes, deviceRes] = await Promise.all([
        fetch("/api/reports"),
        fetch("/api/devices"),
      ]);
      const reportData = await reportRes.json();
      const deviceData = await deviceRes.json();
      setOverview(reportData.overview);
      setSessions(reportData.sessions.slice(0, 5));
      setDevices(deviceData.devices || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" label="加载中..." />
      </div>
    );
  }

  const passRate =
    overview && overview.totalTests > 0
      ? Math.round((overview.totalSuccess / overview.totalTests) * 100)
      : 0;

  return (
    <div className="space-y-7">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl p-7" style={{ background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #6d28d9 100%)" }}>
        {/* 装饰圆 */}
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-10" style={{ background: "white", transform: "translate(30%, -30%)" }} />
        <div className="absolute bottom-0 right-40 w-32 h-32 rounded-full opacity-10" style={{ background: "white", transform: "translate(0, 40%)" }} />
        <div className="absolute top-4 right-56 w-16 h-16 rounded-full opacity-5" style={{ background: "white" }} />
        <div className="relative flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium px-2.5 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.9)" }}>
                ✨ Qt for OpenHarmony
              </span>
            </div>
            <h1 className="text-2xl font-bold text-white">单元测试平台</h1>
            <p className="text-sm mt-1" style={{ color: "rgba(199,210,254,0.85)" }}>
              管理 HarmonyOS 设备、执行 Qt 测试并分析结果
            </p>
            {/* 设备状态内嵌 */}
            <div className="mt-4 flex items-center gap-3 flex-wrap">
              {devices.length === 0 ? (
                <div className="flex items-center gap-2 text-xs" style={{ color: "rgba(254,202,202,0.9)" }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  未检测到设备
                </div>
              ) : (
                devices.map((d) => (
                  <span key={d.id} className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.15)", color: "white" }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    {d.id}
                  </span>
                ))
              )}
            </div>
          </div>
          <Button
            as={Link}
            href="/tests"
            className="font-semibold shadow-lg"
            style={{ background: "rgba(255,255,255,0.15)", color: "white", border: "1px solid rgba(255,255,255,0.3)", backdropFilter: "blur(8px)" }}
          >
            <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新建测试
          </Button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="总测试数"
          value={overview?.totalTests ?? 0}
          sub={`${overview?.completedSessions ?? 0} 个会话`}
          gradient="linear-gradient(135deg, #6366f1, #8b5cf6)"
          icon={
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          }
        />
        <StatCard
          label="通过"
          value={overview?.totalSuccess ?? 0}
          sub={`通过率 ${passRate}%`}
          gradient="linear-gradient(135deg, #10b981, #059669)"
          icon={
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="超时"
          value={overview?.totalTimeout ?? 0}
          gradient="linear-gradient(135deg, #f59e0b, #d97706)"
          icon={
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="崩溃"
          value={overview?.totalCrash ?? 0}
          gradient="linear-gradient(135deg, #ef4444, #dc2626)"
          icon={
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          }
        />
      </div>

      {/* 中间行：通过率 + 快捷入口 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 通过率卡片 */}
        <div className="lg:col-span-2 rounded-2xl p-5 shadow-sm" style={{ background: "rgba(255,255,255,0.8)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.9)" }}>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-gray-700">整体通过率</p>
            <span className="text-2xl font-bold" style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              {passRate}%
            </span>
          </div>
          {/* 分段进度条 */}
          <div className="w-full h-3 rounded-full overflow-hidden" style={{ background: "#f1f5f9" }}>
            <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${passRate}%`, background: "linear-gradient(90deg, #10b981, #34d399)" }} />
          </div>
          <div className="flex gap-5 mt-4">
            {[
              { label: "成功", value: overview?.totalSuccess ?? 0, color: "#10b981" },
              { label: "超时", value: overview?.totalTimeout ?? 0, color: "#f59e0b" },
              { label: "崩溃", value: overview?.totalCrash ?? 0, color: "#ef4444" },
              { label: "失败", value: overview?.totalFailed ?? 0, color: "#94a3b8" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: item.color }} />
                <span className="text-xs text-gray-500">{item.label}</span>
                <span className="text-xs font-semibold text-gray-700">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 快捷操作 */}
        <div className="rounded-2xl p-5 shadow-sm" style={{ background: "rgba(255,255,255,0.8)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.9)" }}>
          <p className="text-sm font-semibold text-gray-700 mb-3">快捷操作</p>
          <div className="space-y-2">
            {[
              { href: "/tests", label: "执行新测试", icon: "▶", gradient: "linear-gradient(135deg, #6366f1, #8b5cf6)" },
              { href: "/devices", label: "查看设备", icon: "📱", gradient: "linear-gradient(135deg, #0ea5e9, #0284c7)" },
              { href: "/reports", label: "分析报告", icon: "📊", gradient: "linear-gradient(135deg, #10b981, #059669)" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 p-2.5 rounded-xl hover:scale-[1.02] transition-transform"
                style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.05), rgba(139,92,246,0.05))", border: "1px solid rgba(99,102,241,0.1)" }}
              >
                <span className="w-8 h-8 rounded-lg flex items-center justify-center text-sm" style={{ background: item.gradient }}>
                  {item.icon}
                </span>
                <span className="text-sm font-medium text-gray-700">{item.label}</span>
                <svg className="w-4 h-4 text-gray-400 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* 最近测试会话 */}
      <div className="rounded-2xl shadow-sm overflow-hidden" style={{ background: "rgba(255,255,255,0.8)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.9)" }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
          <h2 className="text-sm font-semibold text-gray-700">最近测试会话</h2>
          <Button size="sm" variant="light" as={Link} href="/reports" className="text-indigo-500">
            查看全部 →
          </Button>
        </div>
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.1))" }}>
              <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-sm text-gray-400">暂无测试记录</p>
            <Button size="sm" color="primary" variant="flat" as={Link} href="/tests">开始测试</Button>
          </div>
        ) : (
          <div>
            {sessions.map((s, i) => (
              <div
                key={s.id}
                className="flex items-center justify-between px-5 py-3.5 hover:bg-indigo-50/50 transition-colors"
                style={{ borderBottom: i < sessions.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none" }}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: s.status === "completed" ? "linear-gradient(135deg, #10b981, #059669)" : s.status === "running" ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : "linear-gradient(135deg, #f59e0b, #d97706)" }}>
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{s.hapFile}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {s.deviceId} · {new Date(s.startTime).toLocaleString("zh-CN")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 ml-4 shrink-0">
                  {s.summary && (
                    <div className="hidden sm:flex items-center gap-1 text-xs">
                      <span className="font-semibold text-emerald-600">{s.summary.success}</span>
                      <span className="text-gray-300">/</span>
                      <span className="text-gray-500">{s.summary.total}</span>
                    </div>
                  )}
                  <Chip color={statusColorMap[s.status] ?? "default"} variant="flat" size="sm">
                    {statusLabelMap[s.status] ?? s.status}
                  </Chip>
                  <Button size="sm" variant="light" as={Link} href={`/reports/${s.id}`} className="text-indigo-500 font-medium">
                    详情
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
