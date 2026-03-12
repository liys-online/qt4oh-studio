"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

type Messages = Record<string, string>;

type I18nContextValue = {
  locale: string;
  t: (key: string, fallback?: string) => string;
  setLocale: (l: string) => void;
  ready: boolean;
};

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem("locale");
      if (stored) return stored;
      const nav = navigator.language || "zh";
      return nav.split("-")[0];
    }
    return "zh";
  });
  const [messages, setMessages] = useState<Messages>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch(`/locales/${locale}.json`);
        if (!res.ok) throw new Error("missing locale file");
        const json = await res.json();
        if (mounted) setMessages(json as Messages);
      } catch (e) {
        if (locale !== "en") {
          // fallback to en
          const res = await fetch(`/locales/en.json`);
          const json = await res.json();
          if (mounted) setMessages(json as Messages);
        }
      } finally {
        if (mounted) setReady(true);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [locale]);

  useEffect(() => {
    try {
      if (typeof document !== "undefined") document.documentElement.lang = locale;
      if (typeof window !== "undefined") window.localStorage.setItem("locale", locale);
    } catch (e) {}
  }, [locale]);

  const t = (key: string, fallback = "") => {
    return messages[key] ?? fallback ?? key;
  };

  const setLocale = (l: string) => setLocaleState(l);

  return (
    <I18nContext.Provider value={{ locale, t, setLocale, ready }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useTranslation must be used within I18nProvider");
  return ctx;
}
