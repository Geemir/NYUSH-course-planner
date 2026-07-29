"use client";

import { Languages } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocale } from "@/components/i18n/LocaleProvider";
import type { Locale } from "@/lib/i18n/types";

export function LanguageControl() {
  const { locale, setLocale, t } = useLocale();
  return <div data-header-part="language" className="shrink-0">
    <Select value={locale} onValueChange={(value) => { if (value) setLocale(value as Locale); }}>
      <SelectTrigger aria-label={t("language.label")} className="h-11 w-12 px-3 sm:w-28"><Languages className="size-4" /><SelectValue className="hidden sm:flex">{(value: Locale) => value === "zhCN" ? "中文" : "EN"}</SelectValue></SelectTrigger>
      <SelectContent align="start"><SelectItem value="en">{t("language.english")}</SelectItem><SelectItem value="zhCN">{t("language.chinese")}</SelectItem></SelectContent>
    </Select>
  </div>;
}

