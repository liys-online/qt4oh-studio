/**
 * 共享状态样式配置
 * 所有涉及 session / test result 状态样式的地方统一从此文件引入
 */

/** 会话状态（completed / running / stopped） */
export const sessionStatusStyle: Record<string, { bg: string; text: string; label: string }> = {
  completed: { bg: "rgba(16,185,129,0.15)", text: "#059669", label: "已完成" },
  running:   { bg: "rgba(65,205,82,0.15)",  text: "#1d7a2e", label: "运行中" },
  stopped:   { bg: "rgba(148,163,184,0.15)", text: "#64748b", label: "已停止" },
};

/** 测试结果状态（success / timeout / crash / failed / interrupted / running / pending） */
export const testStatusStyle: Record<string, { bg: string; text: string; label: string; dot: string }> = {
  success:     { bg: "rgba(16,185,129,0.12)",  text: "#059669", label: "通过",  dot: "#10b981" },
  timeout:     { bg: "rgba(245,158,11,0.12)",  text: "#d97706", label: "超时",  dot: "#f59e0b" },
  crash:       { bg: "rgba(239,68,68,0.12)",   text: "#dc2626", label: "崩溃",  dot: "#ef4444" },
  failed:      { bg: "rgba(239,68,68,0.12)",   text: "#dc2626", label: "失败",  dot: "#ef4444" },
  interrupted: { bg: "rgba(99,102,241,0.12)",  text: "#4f46e5", label: "中断",  dot: "#6366f1" },
  running:     { bg: "rgba(65,205,82,0.12)",   text: "#1d7a2e", label: "运行中", dot: "#41CD52" },
  pending:     { bg: "rgba(148,163,184,0.12)", text: "#64748b", label: "等待",  dot: "#94a3b8" },
};

/** 通用毛玻璃卡片背景，多页面复用 */
export const cardStyle = {
  background: "rgba(255,255,255,0.85)",
  backdropFilter: "blur(12px)",
  border: "1px solid rgba(255,255,255,0.9)",
} as const;
