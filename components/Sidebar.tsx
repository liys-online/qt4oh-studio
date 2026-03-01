"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  {
    href: "/",
    label: "仪表盘",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 13a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-6z" />
      </svg>
    ),
  },
  {
    href: "/devices",
    label: "设备管理",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
      </svg>
    ),
  },
  {
    href: "/tests",
    label: "测试执行",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    href: "/reports",
    label: "报告分析",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside style={{
      position: "fixed", left: 0, top: 0, height: "100vh", width: 240, minWidth: 240,
      display: "flex", flexDirection: "column", zIndex: 9999,
      background: "linear-gradient(180deg, #1a2433 0%, #1d252c 60%, #1a2433 100%)",
      overflowY: "auto",
    }}>
      {/* 迎光效果 */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse at 50% 0%, rgba(65,205,82,0.08) 0%, transparent 60%)",
      }} />

      {/* Logo */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, padding: "20px 20px 16px" }}>
        <img
          src="/logo.png"
          alt="logo"
          style={{ width: 72, height: 72, borderRadius: 16, objectFit: "contain", flexShrink: 0 }}
        />
        <div>
          <p style={{ fontSize: 14, fontWeight: 700, color: "white", lineHeight: 1.2, margin: 0 }}>Qt4OH Studio</p>
        </div>
      </div>

      {/* 分隔线 */}
      <div style={{ margin: "0 16px", height: 1, background: "linear-gradient(90deg, transparent, rgba(65,205,82,0.25), transparent)" }} />

      {/* Nav Items */}
      <nav style={{ position: "relative", flex: 1, padding: "12px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                position: "relative",
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 14px", borderRadius: 12,
                fontSize: 14, fontWeight: 500, textDecoration: "none",
                transition: "all 0.2s",
                ...(isActive
                  ? { background: "linear-gradient(135deg, rgba(65,205,82,0.85), rgba(33,168,52,0.85))", color: "white", boxShadow: "0 4px 12px rgba(65,205,82,0.3)" }
                  : { color: "rgba(210,240,215,0.75)" }
                ),
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
            >
              {/* 活跃指示器 */}
              {isActive && (
                <span style={{
                  position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
                  width: 4, height: 24, borderRadius: "0 4px 4px 0",
                  background: "linear-gradient(180deg, #41CD52, #21a834)",
                }} />
              )}
              <span style={{ display: "flex", alignItems: "center", color: isActive ? "white" : "rgba(210,240,215,0.75)", flexShrink: 0 }}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{
        position: "relative", margin: "0 12px 16px", borderRadius: 12, padding: 12,
        background: "rgba(65,205,82,0.08)", border: "1px solid rgba(65,205,82,0.2)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#34d399", animation: "pulse 2s infinite" }} />
          <p style={{ fontSize: 12, fontWeight: 500, color: "rgba(210,240,215,0.9)", margin: 0 }}>v1.0.0 运行中</p>
        </div>
        <p style={{ fontSize: 11, color: "rgba(148,163,184,0.6)", margin: "4px 0 0" }}>Qt for OpenHarmony</p>
      </div>
    </aside>
  );
}
