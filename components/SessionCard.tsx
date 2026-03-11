"use client";

import { useRouter } from "next/navigation";
import { Spinner } from "@heroui/react";
import { SessionStatusBadge } from "@/components/SessionStatusBadge";
import { formatTime } from "@/lib/utils";

export interface SessionCardData {
  id: string;
  hapFile: string;
  deviceId: string;
  status: string;
  startTime: string;
  endTime?: string;
  summary?: { total: number; success: number; failed: number; timeout: number; crash: number; interrupted?: number };
  results?: { status: string }[];
}

interface SessionCardProps {
  session: SessionCardData;
  /** 点击整行跳转的目标路由 */
  href: string;
  /** 提供时：点击整行变为「选中」，不再直接跳转 */
  onSelect?: (id: string) => void;
  /** 当前是否选中 */
  selected?: boolean;
  /** 提供时显示删除按钮 */
  onDelete?: (e: React.MouseEvent, id: string) => void;
  deletingId?: string | null;
}

export function SessionCard({ session: s, href, onSelect, selected, onDelete, deletingId }: SessionCardProps) {
  const router = useRouter();
  const isRunning = s.status === "running";
  const isCompleted = s.status === "completed";

  const total = s.summary?.total ?? (s.results?.length ?? 0);
  const success = s.summary?.success ?? (s.results?.filter((r) => r.status === "success").length ?? 0);
  const timeout = s.summary?.timeout ?? 0;
  const crash = s.summary?.crash ?? 0;
  const interrupted = s.summary?.interrupted ?? 0;
  const rate = total > 0 ? Math.round((success / total) * 100) : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect ? onSelect(s.id) : router.push(href)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect ? onSelect(s.id) : router.push(href); } }}
      className="w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl transition-all hover:scale-[1.01] cursor-pointer"
      style={{
        background: selected
          ? "linear-gradient(135deg,rgba(65,205,82,0.12),rgba(33,168,52,0.08))"
          : isRunning ? "linear-gradient(135deg,rgba(65,205,82,0.07),rgba(33,168,52,0.06))" : "rgba(0,0,0,0.02)",
        border: selected
          ? "1.5px solid rgba(65,205,82,0.45)"
          : isRunning ? "1.5px solid rgba(65,205,82,0.25)" : "1px solid rgba(0,0,0,0.06)",
      }}
    >
      {/* 左侧状态图标 */}
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{
          background: isRunning
            ? "linear-gradient(135deg,#41CD52,#21a834)"
            : isCompleted
            ? "linear-gradient(135deg,#10b981,#059669)"
            : "linear-gradient(135deg,#f59e0b,#d97706)",
        }}
      >
        {isRunning ? (
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ) : isCompleted ? (
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
      </div>

      {/* 主要内容 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-semibold text-gray-800 truncate">{s.hapFile}</p>
          <SessionStatusBadge status={s.status} />
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-xs text-gray-400 truncate">设备: {s.deviceId}</p>
          <p className="text-xs text-gray-400">{formatTime(s.startTime)}</p>
          {total > 0 && (
            <>
              <span className="text-xs font-semibold" style={{ color: "#10b981" }}>✓ {success}</span>
              {timeout > 0 && <span className="text-xs" style={{ color: "#f59e0b" }}>⏱ {timeout}</span>}
              {crash > 0 && <span className="text-xs" style={{ color: "#ef4444" }}>💥 {crash}</span>}
              {interrupted > 0 && <span className="text-xs" style={{ color: "#b45309" }}>⚡ {interrupted}</span>}
              <span className="text-xs text-gray-400">/ {total}</span>
              {rate !== null && (
                <span
                  className="text-xs font-bold ml-auto"
                  style={{ color: rate >= 80 ? "#10b981" : rate >= 50 ? "#f59e0b" : "#ef4444" }}
                >
                  {rate}%
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* 删除按钮（可选） */}
      {onDelete && !isRunning && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(e, s.id); }}
          disabled={deletingId === s.id}
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all hover:bg-red-50 text-gray-300 hover:text-red-400 disabled:opacity-50"
          title="删除记录"
        >
          {deletingId === s.id ? (
            <Spinner size="sm" />
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          )}
        </button>
      )}

      {/* 选中时：查看详情按钮；否则：箭头 */}
      {selected && onSelect ? (
        <button
          onClick={(e) => { e.stopPropagation(); router.push(href); }}
          className="shrink-0 text-xs font-semibold px-3 py-1 rounded-lg transition-all hover:opacity-80"
          style={{ background: "rgba(65,205,82,0.15)", color: "#1d7a2e" }}
        >
          查看详情
        </button>
      ) : (
        <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      )}
    </div>
  );
}
