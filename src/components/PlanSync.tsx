"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useCatalog } from "@/components/CatalogProvider";
import { PlanSyncStatus } from "@/components/layout/PlanSyncStatus";
import { ProgramProfileMigrationDialog } from "@/components/programs/ProgramProfileMigrationDialog";
import { usePlanSync, type PlanSyncState } from "@/hooks/usePlanSync";
import { parsePlanDocument } from "@/lib/planIO";
import {
  migratePlanV1,
  PLAN_V2_STORAGE_KEY,
  persistPlanMigration,
  reconcilePlanV2,
  type PlanMigrationResult,
} from "@/lib/planMigration";
import type { StoredPlanEnvelope } from "@/lib/repository";
import type { CatalogProgram, PersistedPlanSnapshot, PlanSnapshotV2 } from "@/lib/types";
import {
  snapshotFromState,
  snapshotV2FromState,
  usePlannerStore,
} from "@/store/plannerStore";

type LoadState =
  | { status: "loading" }
  | { status: "blocked"; message: string; migration: PlanMigrationResult; envelope: StoredPlanEnvelope | null; originalV1Json: string; reviewOpen: boolean }
  | { status: "error"; message: string }
  | { status: "ready"; envelope: StoredPlanEnvelope | null; snapshot: PlanSnapshotV2; initiallySynced: boolean };

function downloadSnapshot(snapshot: PersistedPlanSnapshot, filename: string) {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function localV2Snapshot(): PlanSnapshotV2 | null {
  const raw = window.localStorage.getItem(PLAN_V2_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = parsePlanDocument(raw);
    return parsed.version === 2 ? parsed : null;
  } catch {
    return null;
  }
}

function SyncCoordinator({
  initialEnvelope,
  initialSnapshot,
  initiallySynced,
}: {
  initialEnvelope: StoredPlanEnvelope | null;
  initialSnapshot: PlanSnapshotV2;
  initiallySynced: boolean;
}) {
  const catalog = useCatalog();
  const planner = usePlannerStore();
  const replacePlanV2 = usePlannerStore((state) => state.replacePlanV2);
  const liveSnapshot = snapshotV2FromState(planner, catalog.bootstrap.release.id);
  const snapshot = liveSnapshot ?? initialSnapshot;
  const sync = usePlanSync({
    snapshot,
    authenticated: true,
    enabled: liveSnapshot !== null,
    initialRevision: initialEnvelope?.revision ?? null,
    initialSavedAt: initialEnvelope?.updatedAt,
    initiallySynced,
  });

  const handleKeepLocal = () => {
    if (window.confirm("Replace the server copy with this device's plan? The server copy remains available until this save succeeds.")) {
      sync.keepLocal();
    }
  };

  const handleUseServer = () => {
    const server = sync.useServer();
    if (server) replacePlanV2(server);
  };

  const handleExportBoth = () => {
    if (sync.state.status !== "conflict") return;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadSnapshot(sync.state.local, `nyush-plan-local-${stamp}.json`);
    downloadSnapshot(sync.state.server.snapshot, `nyush-plan-server-${stamp}.json`);
  };

  return (
    <PlanSyncStatus
      state={sync.state}
      onRetry={sync.retry}
      onKeepLocal={handleKeepLocal}
      onUseServer={handleUseServer}
      onExportBoth={handleExportBoth}
    />
  );
}

/** Loads and reconciles plan state once, then starts revision-aware sync. */
export function PlanSync() {
  const { status: sessionStatus } = useSession();
  const catalog = useCatalog();
  const hydratePlan = usePlannerStore((state) => state.hydratePlan);
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [retryKey, setRetryKey] = useState(0);
  const hydratedRef = useRef<string | null>(null);

  useEffect(() => {
    if (sessionStatus !== "authenticated" || catalog.status !== "ready") return;
    const controller = new AbortController();
    let active = true;

    (async () => {
      setLoadState({ status: "loading" });
      try {
        const response = await fetch("/api/plan", { signal: controller.signal });
        if (!response.ok) throw new Error("Could not load the server plan.");
        const envelope = await response.json() as StoredPlanEnvelope | null;
        const records = [...catalog.recordsByStableId.values()];
        const confirmedLocal = localV2Snapshot();

        let result: PlanMigrationResult;
        let sourceEnvelope = envelope;
        let originalV1Json = JSON.stringify(snapshotFromState(usePlannerStore.getState()));
        if (envelope?.snapshot.version === 1) {
          originalV1Json = JSON.stringify(envelope.snapshot);
          result = migratePlanV1(envelope.snapshot, catalog.bootstrap, records);
        } else if (confirmedLocal && !envelope) {
          result = reconcilePlanV2(confirmedLocal, catalog.bootstrap, records);
          sourceEnvelope = null;
        } else if (envelope?.snapshot.version === 2) {
          result = reconcilePlanV2(envelope.snapshot, catalog.bootstrap, records);
        } else {
          result = migratePlanV1(snapshotFromState(usePlannerStore.getState()), catalog.bootstrap, records);
        }

        if (!active) return;
        if (result.status !== "ready" || result.snapshot.version !== 2 || (!envelope && !confirmedLocal)) {
          setLoadState({
            status: "blocked",
            message: "Review the plan migration before cloud sync starts.",
            migration: result,
            envelope: sourceEnvelope,
            originalV1Json,
            reviewOpen: true,
          });
          return;
        }

        const hydrationKey = `${sourceEnvelope?.revision ?? "local"}:${JSON.stringify(result.snapshot)}`;
        if (hydratedRef.current !== hydrationKey) {
          hydratePlan(result.snapshot);
          hydratedRef.current = hydrationKey;
        }
        const initiallySynced = Boolean(
          sourceEnvelope?.snapshot.version === 2 &&
          JSON.stringify(sourceEnvelope.snapshot) === JSON.stringify(result.snapshot),
        );
        setLoadState({ status: "ready", envelope: sourceEnvelope, snapshot: result.snapshot, initiallySynced });
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        setLoadState({
          status: "error",
          message: error instanceof Error ? error.message : "Could not load the server plan.",
        });
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [catalog.bootstrap, catalog.recordsByStableId, catalog.status, hydratePlan, retryKey, sessionStatus]);

  if (sessionStatus !== "authenticated") {
    return <PlanSyncStatus state={{ status: "local-only", message: "Saved on this device." }} />;
  }
  if (catalog.status !== "ready" || loadState.status === "loading") {
    return <PlanSyncStatus state={{ status: "local-only", message: "Preparing secure sync…" }} />;
  }
  if (loadState.status === "error") {
    const state: PlanSyncState = { status: "error", pending: true, message: loadState.message };
    return <PlanSyncStatus state={state} onRetry={() => setRetryKey((value) => value + 1)} />;
  }
  if (loadState.status === "blocked") {
    const catalogPrograms = catalog.programs.filter(
      (program): program is CatalogProgram => "auditAuthority" in program,
    );
    const continueMigration = (result: PlanMigrationResult) => {
      persistPlanMigration(loadState.originalV1Json, result, window.localStorage);
      hydratePlan(result.snapshot);
      setLoadState({
        status: "ready",
        envelope: loadState.envelope,
        snapshot: result.snapshot,
        initiallySynced: false,
      });
    };
    return (
      <>
        <PlanSyncStatus
          state={{ status: "local-only", message: loadState.message }}
          onReviewMigration={() => setLoadState({ ...loadState, reviewOpen: true })}
        />
        <ProgramProfileMigrationDialog
          open={loadState.reviewOpen}
          result={loadState.migration}
          programs={catalogPrograms}
          onCancel={() => setLoadState({ ...loadState, reviewOpen: false })}
          onContinue={continueMigration}
          onExportBackup={() => downloadSnapshot(JSON.parse(loadState.originalV1Json) as PersistedPlanSnapshot, "nyush-plan-v1-backup.json")}
        />
      </>
    );
  }
  return (
    <SyncCoordinator
      key={`${loadState.envelope?.revision ?? "new"}:${loadState.snapshot.catalogReleaseId}`}
      initialEnvelope={loadState.envelope}
      initialSnapshot={loadState.snapshot}
      initiallySynced={loadState.initiallySynced}
    />
  );
}
