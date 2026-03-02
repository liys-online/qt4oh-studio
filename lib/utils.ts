import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** MM/DD HH:mm 格式，适用于列表展示 */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", {
    month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

/** 完整日期时间，适用于详情展示 */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN");
}
