"use client";

import { useState, useEffect, FormEvent } from "react";
import { useTranslation } from "../../i18n";

interface ProfileData {
  id: number;
  username: string;
  displayName: string;
  role: string;
  createdAt: string;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl p-6 ${className}`}
      style={{
        background: "rgba(255,255,255,0.85)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,0.9)",
        boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
      }}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 flex items-center gap-2">
      <span className="inline-block w-1 h-4 rounded-full" style={{ background: "linear-gradient(180deg,#41CD52,#21a834)" }} />
      {children}
    </h2>
  );
}

export default function ProfilePage() {
  const { t, locale } = useTranslation();
  const [profile, setProfile]     = useState<ProfileData | null>(null);
  const [loading, setLoading]     = useState(true);

  // 昵称修改
  const [displayName, setDisplayName]     = useState("");
  const [nameLoading, setNameLoading]     = useState(false);
  const [nameMsg, setNameMsg]             = useState<{ ok: boolean; text: string } | null>(null);

  // 密码修改
  const [currentPwd, setCurrentPwd]       = useState("");
  const [newPwd, setNewPwd]               = useState("");
  const [confirmPwd, setConfirmPwd]       = useState("");
  const [pwdLoading, setPwdLoading]       = useState(false);
  const [pwdMsg, setPwdMsg]               = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/auth/profile")
      .then(r => r.json())
      .then(d => {
        setProfile(d);
        setDisplayName(d.displayName ?? "");
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleNameSave(e: FormEvent) {
    e.preventDefault();
    setNameMsg(null);
    setNameLoading(true);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      });
      const d = await res.json();
      if (!res.ok) setNameMsg({ ok: false, text: d.error ?? t("profile.saveFailed", "Save failed") });
      else {
        setProfile(prev => prev ? { ...prev, displayName: d.displayName } : prev);
        setNameMsg({ ok: true, text: t("profile.displayNameUpdated", "Display name updated") });
      }
    } catch {
      setNameMsg({ ok: false, text: t("error.network", "Network error") });
    } finally {
      setNameLoading(false);
    }
  }

  async function handlePwdSave(e: FormEvent) {
    e.preventDefault();
    setPwdMsg(null);
    if (newPwd !== confirmPwd) {
      setPwdMsg({ ok: false, text: t("error.passwordMismatch", "Passwords do not match") });
      return;
    }
    setPwdLoading(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd }),
      });
      const d = await res.json();
      if (!res.ok) setPwdMsg({ ok: false, text: d.error ?? t("profile.changePwdFailed", "Change failed") });
      else {
        setPwdMsg({ ok: true, text: t("profile.passwordUpdated", "Password updated") });
        setCurrentPwd(""); setNewPwd(""); setConfirmPwd("");
      }
    } catch {
      setPwdMsg({ ok: false, text: t("error.network", "Network error") });
    } finally {
      setPwdLoading(false);
    }
  }

  const roleLabel = (r?: string) => r === "admin" ? t("user.role.admin", "Administrator") : t("user.role.user", "User");
  const roleColor = (r?: string) => r === "admin"
    ? { background: "rgba(65,205,82,0.12)", color: "#21a834", border: "1px solid rgba(65,205,82,0.3)" }
    : { background: "rgba(99,102,241,0.1)", color: "#6366f1", border: "1px solid rgba(99,102,241,0.25)" };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full border-2 border-green-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-7 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800">{t("profile.title", "Profile")}</h1>
        <p className="text-sm text-gray-500 mt-1">{t("profile.subtitle", "View and edit your account")}</p>
      </div>

      {/* 账户概览 */}
      <Card>
        <SectionTitle>{t("profile.overview", "Account Overview")}</SectionTitle>
        <div className="flex items-center gap-5">
          {/* Avatar */}
          <div
            className="flex-shrink-0 w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-white shadow-md"
            style={{ background: "linear-gradient(135deg,#41CD52,#21a834)" }}
          >
            {profile?.displayName?.charAt(0) ?? "?"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xl font-bold text-gray-800">{profile?.displayName}</span>
              <span
                className="px-2 py-0.5 rounded-full text-xs font-semibold"
                style={roleColor(profile?.role)}
              >
                {roleLabel(profile?.role)}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">@{profile?.username}</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          {[
            { label: "Username",   value: profile?.username },
            { label: "Role",     value: roleLabel(profile?.role) },
            { label: "Account ID",  value: `#${profile?.id}` },
            { label: "Registered", value: profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString(locale || undefined) : "—" },
          ].map(item => (
            <div key={item.label} className="rounded-xl px-4 py-3" style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                <p className="text-xs text-gray-400 mb-0.5">{item.label}</p>
              <p className="text-sm font-medium text-gray-700">{item.value}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* 修改昵称 */}
      <Card>
        <SectionTitle>{t("profile.changeDisplayName", "Change display name")}</SectionTitle>
        <form onSubmit={handleNameSave} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t("profile.displayNameLabel", "Display name")}</label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm border outline-none focus:ring-2 focus:ring-green-400 transition-all"
              style={{ background: "#f8fafc", borderColor: "#e2e8f0", color: "#1e293b" }}
              placeholder={t("profile.displayNamePlaceholder", "Enter new display name")}
              required
            />
          </div>

          {nameMsg && (
            <div
              className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm"
              style={nameMsg.ok
                ? { background: "rgba(65,205,82,0.08)", border: "1px solid rgba(65,205,82,0.3)", color: "#21a834" }
                : { background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#ef4444" }
              }
            >
              {nameMsg.ok
                ? <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
                : <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              }
              {nameMsg.text}
            </div>
          )}

            <button
            type="submit"
            disabled={nameLoading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all shadow hover:shadow-md disabled:opacity-50"
            style={{ background: "linear-gradient(135deg,#41CD52,#21a834)" }}
          >
            {nameLoading && <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>}
            {t("profile.saveDisplayName", "Save name")}
          </button>
        </form>
      </Card>

      {/* Change password */}
      <Card>
        <SectionTitle>{t("profile.changePassword", "Change password")}</SectionTitle>
        <form onSubmit={handlePwdSave} className="space-y-4">
          {[
            { label: t("profile.currentPassword", "Current password"), value: currentPwd, setter: setCurrentPwd, placeholder: t("profile.currentPasswordPlaceholder", "Enter current password"),  auto: "current-password" },
            { label: t("profile.newPassword", "New password"),   value: newPwd,     setter: setNewPwd,     placeholder: t("profile.newPasswordPlaceholder", "At least 6 chars"),      auto: "new-password" },
            { label: t("profile.confirmNewPassword", "Confirm new password"), value: confirmPwd, setter: setConfirmPwd, placeholder: t("profile.confirmNewPasswordPlaceholder", "Confirm new password"), auto: "new-password" },
          ].map(field => (
            <div key={field.label}>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{field.label}</label>
              <input
                type="password"
                autoComplete={field.auto}
                value={field.value}
                onChange={e => field.setter(e.target.value)}
                className="w-full rounded-xl px-3 py-2.5 text-sm border outline-none focus:ring-2 focus:ring-green-400 transition-all"
                style={{ background: "#f8fafc", borderColor: "#e2e8f0", color: "#1e293b" }}
                placeholder={field.placeholder as string}
                required
              />
            </div>
          ))}

          {pwdMsg && (
            <div
              className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm"
              style={pwdMsg.ok
                ? { background: "rgba(65,205,82,0.08)", border: "1px solid rgba(65,205,82,0.3)", color: "#21a834" }
                : { background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#ef4444" }
              }
            >
              {pwdMsg.ok
                ? <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
                : <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              }
              {pwdMsg.text}
            </div>
          )}

          <button
            type="submit"
            disabled={pwdLoading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all shadow hover:shadow-md disabled:opacity-50"
            style={{ background: "linear-gradient(135deg,#41CD52,#21a834)" }}
          >
            {pwdLoading && <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>}
            {t("profile.updatePassword", "Update password")}
          </button>
        </form>
      </Card>
    </div>
  );
}
