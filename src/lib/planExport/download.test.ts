// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { downloadBytes } from "@/lib/planExport/download";

describe("downloadBytes", () => {
  it("clicks one temporary object URL and revokes it after the click", async () => {
    const createObjectURL = URL.createObjectURL = vi.fn(() => "blob:export");
    const revokeObjectURL = URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    downloadBytes(new Uint8Array([1, 2, 3]), "application/pdf", "plan.pdf");

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect((click.mock.instances[0] as HTMLAnchorElement).download).toBe("plan.pdf");
    expect(revokeObjectURL).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:export");
    click.mockRestore();
  });
});
