import { Spinner } from "@heroui/react";

interface LoadingStateProps {
  /** 容器最小高度 class，默认 h-64 */
  heightClass?: string;
  label?: string;
  size?: "sm" | "md" | "lg";
}

/** 页面级加载占位，居中展示 Spinner */
export function LoadingState({ heightClass = "h-64", label = "加载中...", size = "lg" }: LoadingStateProps) {
  return (
    <div className={`flex items-center justify-center ${heightClass}`}>
      <Spinner size={size} label={label} />
    </div>
  );
}
