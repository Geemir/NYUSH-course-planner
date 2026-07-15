import { describe, expect, it, vi } from "vitest";
import { runCatalogFallbackCli } from "../../scripts/generate-catalog-fallback";

describe("runCatalogFallbackCli", () => {
  it("returns zero after successful generation", async () => {
    const execute = vi.fn(async () => undefined);
    const stderr = vi.fn();

    await expect(runCatalogFallbackCli({ execute, stderr })).resolves.toBe(0);
    expect(execute).toHaveBeenCalledOnce();
    expect(stderr).not.toHaveBeenCalled();
  });

  it("returns one without exposing the underlying failure", async () => {
    const stderr = vi.fn();

    await expect(
      runCatalogFallbackCli({
        execute: async () => {
          throw new Error("SECRET_DATABASE_URL");
        },
        stderr,
      }),
    ).resolves.toBe(1);
    expect(stderr).toHaveBeenCalledWith("Catalog fallback generation failed.");
  });
});
