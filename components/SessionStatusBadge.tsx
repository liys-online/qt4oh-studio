import { sessionStatusStyle } from "@/lib/status";
import { useTranslation } from "../app/i18n";

interface SessionStatusBadgeProps {
  status: string;
}

/** 会话状态徽章（已完成 / 运行中 / 已停止），统一用于测试列表、报告列表等 */
export function SessionStatusBadge({ status }: SessionStatusBadgeProps) {
  const { t } = useTranslation();
  const s = sessionStatusStyle[status] ?? { bg: "rgba(148,163,184,0.15)", text: "#64748b", label: status };
  const isRunning = status === "running";
  const label = t(`status.session.${status}`, s.label);
  return (
    <span
      className="flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{ background: s.bg, color: s.text }}
    >
      {isRunning && (
        <span
          className="w-1.5 h-1.5 rounded-full animate-pulse"
          style={{ background: "#41CD52" }}
        />
      )}
      {label}
    </span>
  );
}
