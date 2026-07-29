import { describe, expect, it } from "vitest";
import { dictionaries } from "@/lib/i18n/dictionaries";

describe("planner dictionaries", () => {
  it("keeps English and Simplified Chinese key sets identical", () => {
    expect(Object.keys(dictionaries.zhCN).sort()).toEqual(Object.keys(dictionaries.en).sort());
    expect(dictionaries.zhCN["header.guide"]).toBe("使用说明");
    expect(dictionaries.zhCN["progress.title"]).toBe("学位进度");
  });
});
