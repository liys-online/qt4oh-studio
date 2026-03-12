"use client";

import { useEffect, useState } from "react";
import { NewTestButton } from "@/components/NewTestButton";
import { useTranslation } from "../../i18n";
import { LoadingState } from "@/components/LoadingState";
import { SessionCard } from "@/components/SessionCard";
import { cardStyle } from "@/lib/status";

interface Session {
  id: string;
  hapFile: string;
  deviceId: string;
  status: string;
  startTime: string;
  endTime?: string;
  summary?: { total: number; success: number; failed: number; timeout: number; crash: number };
}

export default function ReportsPage() {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/reports")
      .then((r) => r.json())
      .then((d) => setSessions(d.sessions ?? []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <LoadingState />;
  }

  return (
    <div className="space-y-7">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800">{t("reports.title", "Reports")}</h1>
          <p className="text-sm text-gray-500 mt-1">{t("reports.subtitle", "Historical test statistics")}</p>
        </div>
        <NewTestButton />
      </div>

      {/* 历史会话 */}
      <div className="rounded-2xl p-5 shadow-sm" style={cardStyle}>
        <h2 className="text-sm font-semibold text-gray-800 mb-4">{t("reports.history", "History sessions")}</h2>
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "rgba(99,102,241,0.08)" }}>
              <svg className="w-6 h-6 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-sm text-gray-400">{t("reports.noRecords", "No test records yet")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                href={`/reports/${s.id}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

