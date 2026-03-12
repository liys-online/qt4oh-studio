"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "../app/i18n";

interface SessionUser {
  username: string;
  displayName: string;
  role: string;
  isElectron?: boolean;
}

interface SidebarProps {
  /** 移动端抽屉是否打开（桌面端忽略此 prop） */
  isOpen?: boolean;
  /** 关闭抽屉的回调（移动端点击遮罩或导航后调用） */
  onClose?: () => void;
}

// navGroups will be constructed inside component to use translations

export function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const pathname  = usePathname();
  const router    = useRouter();
  const { t, locale, setLocale } = useTranslation();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isElectron, setIsElectron] = useState(false);

  const navGroups = [
    {
      label: null,
      items: [
        { href: "/", label: t("nav.dashboard", "Dashboard"), icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 13a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-6z" />
          </svg>
        )},
        { href: "/devices", label: t("nav.devices", "Devices"), icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
          </svg>
        )},
        { href: "/tests", label: t("nav.tests", "Tests"), icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )},
        { href: "/reports", label: t("nav.reports", "Reports"), icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        )},
      ],
    },
    {
      label: t("nav.tools", "Utilities"),
      items: [
        { href: "/tools/screenshot", label: t("tools.screenshot", "Screenshot"), icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        )},
        { href: "/tools/logs", label: t("tools.logs", "Logs"), icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        )},
        { href: "/tools/shell", label: t("tools.shell", "Shell"), icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        )},
        { href: "/tools/power", label: t("tools.power", "Power"), icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        )},
      ],
    },
  ];

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        if (d.isElectron) {
          setIsElectron(true);
        } else {
          setUser(d);
        }
      })
      .catch(() => {});
  }, []);

  // 路由跳转后在移动端自动关闭侧栏
  useEffect(() => {
    onClose?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <>
      {/* 移动端遮罩 */}
      <div
        className={`sidebar-backdrop${isOpen ? " sidebar-open" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={`sidebar-wrapper${isOpen ? " sidebar-open" : ""}`}
        style={{
          position: "fixed", left: 0, top: 0, height: "100vh", width: 250, minWidth: 250,
          display: "flex", flexDirection: "column", zIndex: 9999,
          background: "linear-gradient(180deg, #1a2433 0%, #1d252c 60%, #1a2433 100%)",
          overflowY: "auto",
        }}
      >
      {/* 迎光效果 */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse at 50% 0%, rgba(65,205,82,0.08) 0%, transparent 60%)",
      }} />

      {/* Logo */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, padding: "20px 20px 16px" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.svg"
          alt="logo"
          width={96}
          height={96}
          style={{ borderRadius: 16, objectFit: "contain", flexShrink: 0 }}
        />
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: "white", lineHeight: 1.2, margin: 0 }}>{t("site.logo", "Qt4OH Studio")}</p>
          </div>
      </div>

      {/* 分隔线 */}
      <div style={{ margin: "0 16px", height: 1, background: "linear-gradient(90deg, transparent, rgba(65,205,82,0.25), transparent)" }} />

      {/* Nav Items */}
      <nav style={{ position: "relative", flex: 1, padding: "12px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
        {navGroups.map((group, groupIdx) => (
          <div key={groupIdx} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {group.label && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: groupIdx > 0 ? "12px 4px 4px" : "4px 4px" }}>
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(148,163,184,0.5)" }}>
                  {group.label}
                </span>
                <div style={{ flex: 1, height: 1, background: "rgba(148,163,184,0.12)" }} />
              </div>
            )}
            {group.items.map((item) => {
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
          </div>
        ))}
      </nav>

      {/* Settings panel */}
      <div style={{ margin: "0 12px 12px" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(148,163,184,0.6)", marginBottom: 8 }}>{t("settings.title", "Settings")}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 12, background: "rgba(255,255,255,0.02)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#34d399" }} />
            <div style={{ fontSize: 13, color: "rgba(210,240,215,0.9)" }}>{t("settings.language", "Language")}</div>
          </div>
          <select
            id="locale-select"
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
            style={{ background: "transparent", color: "white", border: "1px solid rgba(255,255,255,0.06)", padding: "6px 8px", borderRadius: 8 }}
          >
            <option value="en">English</option>
            <option value="zh">中文</option>
          </select>
        </div>
      </div>

      {/* User Info — Web 模式显示登录用户；Electron 本地模式显示离线徽标 */}
          {isElectron ? (
        <div style={{
          position: "relative", margin: "0 12px 8px", borderRadius: 12, padding: "10px 14px",
          background: "rgba(65,205,82,0.08)", border: "1px solid rgba(65,205,82,0.2)",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
            background: "linear-gradient(135deg, #334155, #1e293b)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="rgba(210,240,215,0.8)" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: "white", margin: 0 }}>{t("user.localMode", "Local mode")}</p>
            <p style={{ fontSize: 11, color: "rgba(148,163,184,0.7)", margin: 0 }}>{t("user.localModeDesc", "Offline, no login required")}</p>
          </div>
        </div>
      ) : user ? (
        <div style={{
          position: "relative", margin: "0 12px 8px", borderRadius: 12, padding: "10px 12px",
          background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          {/* 头像 + 名字 → 点击进入个人中心 */}
          <Link href="/profile" style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, textDecoration: "none" }}>
            <div style={{
              width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
              background: "linear-gradient(135deg, #41CD52, #21a834)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, fontWeight: 700, color: "white",
            }}>
              {user.displayName.charAt(0)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "white", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.displayName}
              </p>
              <p style={{ fontSize: 11, color: "rgba(148,163,184,0.7)", margin: 0 }}>
                {user.role === "admin" ? t("user.role.admin", "Administrator") : t("user.role.user", "User")}
              </p>
            </div>
          </Link>
          {/* Logout */}
            <button
            onClick={handleLogout}
            title={t("auth.logout", "Logout")}
            style={{
              flexShrink: 0, background: "none", border: "none", cursor: "pointer",
              color: "rgba(148,163,184,0.6)", padding: 4, borderRadius: 6,
              display: "flex", alignItems: "center",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(148,163,184,0.6)"; }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ width: 16, height: 16 }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      ) : null}

      {/* Footer */}
      <div style={{
        position: "relative", margin: "0 12px 16px", borderRadius: 12, padding: 12,
        background: "rgba(65,205,82,0.08)", border: "1px solid rgba(65,205,82,0.2)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#34d399", animation: "pulse 2s infinite" }} />
          <p style={{ fontSize: 12, fontWeight: 500, color: "rgba(210,240,215,0.9)", margin: 0 }}>{t("footer.running", "v1.0.0 running")}</p>
        </div>
        <p style={{ fontSize: 11, color: "rgba(148,163,184,0.6)", margin: "4px 0 0" }}>{t("footer.brand", "Qt for OpenHarmony")}</p>
      </div>
    </aside>
    </>
  );
}
