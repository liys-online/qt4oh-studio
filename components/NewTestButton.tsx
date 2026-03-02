"use client";

import Link from "next/link";

/** 新建测试跳转按钮，绿色渐变风格，统一用于各页面 Header */
export function NewTestButton() {
  return (
    <Link
      href="/tests"
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg hover:-translate-y-0.5"
      style={{ background: "linear-gradient(135deg, #41CD52, #21a834)" }}
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
      </svg>
      新建测试
    </Link>
  );
}
