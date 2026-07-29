"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { dictionaries, type Locale, type TranslationKey } from "@/lib/i18n/dictionaries";

const STORAGE_KEY = "nyush-planner-locale";
const LOCALE_EVENT = "nyush-planner-locale-change";
type Values = Record<string, string | number>;
interface LocaleContextValue { locale: Locale; setLocale: (locale: Locale) => void; t: (key: TranslationKey, values?: Values) => string }
const defaultT = (key: TranslationKey, values: Values = {}) => Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), dictionaries.en[key] as string);
const LocaleContext = createContext<LocaleContextValue>({ locale: "en", setLocale: () => undefined, t: defaultT });

export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore<Locale>(
    (notify) => {
      window.addEventListener("storage", notify);
      window.addEventListener(LOCALE_EVENT, notify);
      return () => {
        window.removeEventListener("storage", notify);
        window.removeEventListener(LOCALE_EVENT, notify);
      };
    },
    (): Locale => window.localStorage.getItem(STORAGE_KEY) === "zhCN" ? "zhCN" : "en",
    (): Locale => "en",
  );
  useEffect(() => { document.documentElement.lang = locale === "zhCN" ? "zh-CN" : "en"; }, [locale]);
  const setLocale = useCallback((next: Locale) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    window.dispatchEvent(new Event(LOCALE_EVENT));
  }, []);
  const t = useCallback((key: TranslationKey, values: Values = {}) => Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), dictionaries[locale][key] as string), [locale]);
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export const useLocale = () => useContext(LocaleContext);
