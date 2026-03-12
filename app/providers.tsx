"use client";

import { HeroUIProvider } from "@heroui/react";
import { I18nProvider } from "./i18n";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <HeroUIProvider>{children}</HeroUIProvider>
    </I18nProvider>
  );
}
