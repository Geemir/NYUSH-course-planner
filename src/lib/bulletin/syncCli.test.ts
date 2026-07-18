import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import type { SyncResult } from "@/lib/bulletin/sync";
import {
  runBulletinSyncCli,
  sourceIdsFromArgs,
} from "../../../scripts/sync-bulletin";

const result = (outcome: SyncResult["outcome"]): SyncResult => ({
  outcome,
  snapshotId: "bulletin-0123456789abcdef01234567",
  documentCount: 4,
  courseCount: 10,
  programCount: 3,
  startedAt: new Date("2026-07-14T00:00:00.000Z"),
  completedAt: new Date("2026-07-14T00:01:00.000Z"),
});

describe("Bulletin synchronization CLI", () => {
  it("validates and deduplicates explicit source selections before execution", () => {
    expect(
      sourceIdsFromArgs([
        "--source=nyu-new-york-business",
        "--source=nyu-new-york-business",
        "--source=nyu-new-york-engineering",
      ]),
    ).toEqual([
      "nyu-new-york-business",
      "nyu-new-york-engineering",
    ]);
    expect(() => sourceIdsFromArgs(["--source=unknown-school"])).toThrow(
      /unknown/i,
    );
  });

  it("prints one safe source row and the composed release summary", async () => {
    const stdout = vi.fn();
    const exitCode = await runBulletinSyncCli({
      execute: async () => ({
        releaseId: "release-test",
        complete: true,
        sourceResults: [
          {
            sourceId: "nyu-new-york-business",
            status: "published",
            snapshotId: "stern-snapshot",
            retainedSnapshotId: null,
            diagnostics: [],
          },
        ],
      }),
      stdout,
      stderr: vi.fn(),
    });
    expect(exitCode).toBe(0);
    expect(stdout.mock.calls).toEqual([
      ["nyu-new-york-business: published snapshot=stern-snapshot"],
      ["release=release-test complete=true"],
    ]);
  });

  it.each(["published", "no-op"] as const)(
    "returns zero and prints safe IDs/counts for %s",
    async (outcome) => {
      const stdout = vi.fn();
      const stderr = vi.fn();

      const exitCode = await runBulletinSyncCli({
        execute: async () => result(outcome),
        stdout,
        stderr,
      });

      expect(exitCode).toBe(0);
      expect(stdout).toHaveBeenCalledWith(
        `${outcome}: snapshot=bulletin-0123456789abcdef01234567 documents=4 courses=10 programs=3`,
      );
      expect(stderr).not.toHaveBeenCalled();
    },
  );

  it("returns one with only the fixed safe failure sentence", async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();

    const exitCode = await runBulletinSyncCli({
      execute: async () => {
        throw new Error("<raw-html> SECRET_DATABASE_URL");
      },
      stdout,
      stderr,
    });

    expect(exitCode).toBe(1);
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledOnce();
    expect(stderr).toHaveBeenCalledWith("Bulletin synchronization failed.");
  });

  it("uses Node's react-server condition with the tsx import hook", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["bulletin:sync"]).toBe(
      "node --conditions=react-server --import tsx scripts/sync-bulletin.ts",
    );
  });

  it("loads server-only startup imports and contains smoke failures safely", () => {
    const child = spawnSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "scripts/sync-bulletin.ts",
        "--startup-smoke",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          PGLITE_DIR: join(
            tmpdir(),
            `nyush-bulletin-cli-smoke-${randomUUID()}`,
          ),
        },
        windowsHide: true,
      },
    );

    expect(child.status).toBe(1);
    expect(child.stdout).toBe("");
    expect(child.stderr).toBe("Bulletin synchronization failed.\n");
    expect(child.stderr).not.toContain("server-only");
    expect(child.stderr).not.toContain("Client Component");
    expect(child.stderr).not.toContain("at ");
  });
});
