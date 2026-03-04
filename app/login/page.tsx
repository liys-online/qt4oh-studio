"use client";

import { useState, FormEvent, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function LoginContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error,       setError]       = useState("");
  const [loading,     setLoading]     = useState(false);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);

  useEffect(() => {
    const e = searchParams.get("error");
    if (e) setError(decodeURIComponent(e));
  }, [searchParams]);

  function handleOAuth(provider: string) {
    setOauthLoading(provider);
    window.location.href = `/api/auth/oauth/${provider}`;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "登录失败");
      } else {
        router.push("/");
      }
    } catch {
      setError("请求失败，请检查网络");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#f4f6f8" }}>
      {/* 同 dashboard 的背景装饰圆 */}
      <div style={{ position: "fixed", top: 0, right: 0, width: 480, height: 480, borderRadius: "50%", pointerEvents: "none", background: "radial-gradient(circle, rgba(65,205,82,0.06) 0%, transparent 70%)", transform: "translate(30%, -30%)" }} />
      <div style={{ position: "fixed", bottom: 0, left: 0, width: 400, height: 400, borderRadius: "50%", pointerEvents: "none", background: "radial-gradient(circle, rgba(65,205,82,0.04) 0%, transparent 70%)", transform: "translate(-20%, 30%)" }} />

      <div className="relative w-full max-w-sm mx-4">
        {/* Logo + title 横向布局 */}
        <div className="mb-8 flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.svg"
            alt="Qt4OH Studio"
            width={72}
            height={72}
            style={{ borderRadius: 16, objectFit: "contain", flexShrink: 0 }}
          />
          <div>
            <h1 className="text-2xl font-bold text-gray-800 leading-tight">Qt4OH Studio</h1>
            <p className="text-sm text-gray-500 mt-0.5">HarmonyOS 设备测试平台</p>
          </div>
        </div>

        {/* Card — 与 tools 页卡片样式完全一致 */}
        <div
          className="rounded-2xl p-8"
          style={{
            background: "rgba(255,255,255,0.85)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.9)",
            boxShadow: "0 2px 24px rgba(0,0,0,0.08)",
          }}
        >
          <h2 className="text-base font-semibold text-gray-800 mb-6">登录账户</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                用户名
              </label>
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full rounded-xl px-3 py-2.5 text-sm border outline-none focus:ring-2 focus:ring-green-400 transition-all"
                style={{ background: "#f8fafc", borderColor: "#e2e8f0", color: "#1e293b" }}
                placeholder="请输入用户名"
                disabled={loading}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                密码
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full rounded-xl px-3 py-2.5 text-sm border outline-none focus:ring-2 focus:ring-green-400 transition-all"
                style={{ background: "#f8fafc", borderColor: "#e2e8f0", color: "#1e293b" }}
                placeholder="请输入密码"
                disabled={loading}
                required
              />
            </div>

            {error && (
              <div
                className="flex items-center gap-2 rounded-xl px-3 py-2.5"
                style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}
              >
                <svg className="w-4 h-4 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm text-red-500">{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition-all shadow hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              style={{ background: "linear-gradient(135deg, #41CD52, #21a834)" }}
            >
              {loading && (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              {loading ? "登录中…" : "登 录"}
            </button>
          </form>
        </div>

        {/* OAuth 登录 */}
        <div className="mt-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px" style={{ background: "#e2e8f0" }} />
            <span className="text-xs text-gray-400 whitespace-nowrap">或使用第三方账号登录</span>
            <div className="flex-1 h-px" style={{ background: "#e2e8f0" }} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            {/* GitHub */}
            <button
              onClick={() => handleOAuth("github")}
              disabled={!!oauthLoading}
              className="flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-medium transition-all hover:shadow-sm disabled:opacity-50"
              style={{ background: "rgba(255,255,255,0.85)", borderColor: "#e2e8f0", color: "#374151" }}
            >
              {oauthLoading === "github"
                ? <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                : <img src="/github.svg" alt="GitHub" className="w-5 h-5 object-contain" />
              }
              GitHub
            </button>

            {/* Gitcode */}
            <button
              onClick={() => handleOAuth("gitcode")}
              disabled={!!oauthLoading}
              className="flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-medium transition-all hover:shadow-sm disabled:opacity-50"
              style={{ background: "rgba(255,255,255,0.85)", borderColor: "#e2e8f0", color: "#374151" }}
            >
              {oauthLoading === "gitcode"
                ? <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                : <img src="/gitcode.png" alt="Gitcode" className="w-5 h-5 object-contain" />
              }
              Gitcode
            </button>

            {/* 华为 */}
            <button
              onClick={() => handleOAuth("huawei")}
              disabled={!!oauthLoading}
              className="flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-medium transition-all hover:shadow-sm disabled:opacity-50"
              style={{ background: "rgba(255,255,255,0.85)", borderColor: "#e2e8f0", color: "#374151" }}
            >
              {oauthLoading === "huawei"
                ? <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                : <img src="/huawei.svg" alt="HuaWei" className="w-5 h-5 object-contain" />
              }
              华为账号
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-5">
          还没有账户？{" "}
          <Link href="/register" className="text-green-600 hover:text-green-700 font-medium transition-colors">
            立即注册
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
