"use client";

import { Spinner } from "@heroui/react";
import { useTranslation } from "../app/i18n";

interface LoadingStateProps {
  /** 容器最小高度 class，默认 h-64 */
  heightClass?: string;
  label?: string;
  size?: "sm" | "md" | "lg";
}

/** 页面级加载占位，居中展示 Spinner */
export function LoadingState({ heightClass = "h-64", label, size = "lg" }: LoadingStateProps) {
  const { t } = useTranslation();
  const finalLabel = label ?? t("loading", "Loading...");
  return (
    <div className={`flex items-center justify-center ${heightClass}`}>
      <Spinner size={size} label={finalLabel} />
    </div>
  );
}
