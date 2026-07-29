// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogMaintenance } from "@/components/admin/CatalogMaintenance";
import { render, screen } from "@/test/render";

describe("CatalogMaintenance", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ releaseId: "r1", programs: [], overlays: [] }) })));

  it("loads the active release and exposes course and requirement editors", async () => {
    render(<CatalogMaintenance />);
    expect(await screen.findByText(/Active release r1/)).toBeDefined();
    expect(screen.getByRole("heading", { name: "Course records" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "Program requirements" })).toBeDefined();
    expect(fetch).toHaveBeenCalledWith("/api/admin/catalog-maintenance", expect.objectContaining({ cache: "no-store" }));
  });
});
