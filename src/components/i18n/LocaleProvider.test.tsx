// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { LocaleProvider, useLocale } from "@/components/i18n/LocaleProvider";
import { render, screen, waitFor } from "@/test/render";

function Probe() {
  const { locale, setLocale, t } = useLocale();
  return <><span>{locale}:{t("header.guide")}</span><button onClick={() => setLocale("zhCN")}>Chinese</button></>;
}

describe("LocaleProvider", () => {
  beforeEach(() => { localStorage.clear(); document.documentElement.lang = "en"; });

  it("defaults to English and persists Simplified Chinese", async () => {
    const user = userEvent.setup();
    render(<LocaleProvider><Probe /></LocaleProvider>);
    expect(screen.getByText("en:Guide")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Chinese" }));
    await waitFor(() => expect(screen.getByText("zhCN:使用说明")).toBeDefined());
    expect(localStorage.getItem("nyush-planner-locale")).toBe("zhCN");
    expect(document.documentElement.lang).toBe("zh-CN");
  });

  it("restores a saved locale after hydration", async () => {
    localStorage.setItem("nyush-planner-locale", "zhCN");
    render(<LocaleProvider><Probe /></LocaleProvider>);
    await waitFor(() => expect(screen.getByText("zhCN:使用说明")).toBeDefined());
  });
});
