"use client";

import { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { DevicesProvider } from "./devices-context";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <DevicesProvider>
      <div style={{ display: "flex", minHeight: "100vh", background: "#f4f6f8" }}>
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* 主内容区 */}
        <main className="main-with-sidebar" style={{ flex: 1, marginLeft: 250, minHeight: "100vh", minWidth: 0, display: "flex", flexDirection: "column" }}>
          {/* ── 移动端顶部导航栏（仅 <768px 显示）─────────────────────────── */}
          <div
            className="mobile-topbar hidden max-[767px]:flex items-center gap-3"
            style={{
              position: "sticky", top: 0, zIndex: 9997, height: 56,
              padding: "0 16px",
              background: "rgba(29, 37, 44, 0.98)",
              borderBottom: "1px solid rgba(65, 205, 82, 0.15)",
              backdropFilter: "blur(12px)",
              flexShrink: 0,
            }}
          >
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "rgba(210,240,215,0.9)", padding: 6, borderRadius: 8,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Logo & 标题 */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="logo" width={60} height={60} style={{ borderRadius: 10, objectFit: "contain", flexShrink: 0 }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: "white", letterSpacing: "0.01em" }}>Qt4OH Studio</span>
            </div>
          </div>

          {/* ── 页面内容 ─────────────────────────────────────────────────── */}
          {/* 装饰圆 */}
          <div style={{ position: "fixed", top: 0, right: 0, width: 384, height: 384, borderRadius: "50%", pointerEvents: "none", background: "radial-gradient(circle, rgba(65,205,82,0.04) 0%, transparent 70%)", transform: "translate(30%, -30%)" }} />
          <div style={{ position: "fixed", bottom: 0, left: 0, width: 320, height: 320, borderRadius: "50%", pointerEvents: "none", background: "radial-gradient(circle, rgba(65,205,82,0.03) 0%, transparent 70%)", transform: "translate(-20%, 30%)" }} />
          <div className="main-inner-padding" style={{ position: "relative", padding: "24px 32px", flex: 1 }}>
            {children}
          </div>
        </main>
      </div>
    </DevicesProvider>
  );
}
