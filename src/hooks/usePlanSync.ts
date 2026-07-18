"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StoredPlanEnvelope } from "@/lib/repository";
import type { PlanSnapshotV2 } from "@/lib/types";

export type PlanSyncState =
  | { status: "local-only"; message: string }
  | { status: "saving"; baseRevision: number | null }
  | { status: "saved"; revision: number; savedAt: string }
  | { status: "offline"; pending: true; message: string }
  | { status: "error"; pending: true; message: string }
  | { status: "conflict"; local: PlanSnapshotV2; server: StoredPlanEnvelope };

export interface UsePlanSyncOptions {
  snapshot: PlanSnapshotV2;
  authenticated: boolean;
  enabled: boolean;
  initialRevision?: number | null;
  initialSavedAt?: string;
  fetcher?: typeof fetch;
  debounceMs?: number;
}

export function usePlanSync({
  snapshot,
  authenticated,
  enabled,
  initialRevision = null,
  initialSavedAt = "",
  fetcher = fetch,
  debounceMs = 800,
}: UsePlanSyncOptions) {
  const serialized = JSON.stringify(snapshot);
  const [state, setState] = useState<PlanSyncState>(() => {
    if (authenticated && enabled && initialRevision !== null) {
      return { status: "saved", revision: initialRevision, savedAt: initialSavedAt };
    }
    return {
      status: "local-only",
      message: authenticated && !enabled
        ? "Plan migration needs review."
        : "Saved on this device.",
    };
  });
  const revisionRef = useRef<number | null>(initialRevision);
  const acknowledgedRef = useRef<string | null>(initialRevision === null ? null : serialized);
  const controllerRef = useRef<AbortController | null>(null);
  const latestRef = useRef(snapshot);
  const generationRef = useRef(0);

  useEffect(() => {
    latestRef.current = snapshot;
  }, [serialized, snapshot]);

  const save = useCallback(async (local: PlanSnapshotV2) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const generation = ++generationRef.current;
    const baseRevision = revisionRef.current;
    setState({ status: "saving", baseRevision });

    try {
      const response = await fetcher("/api/plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot: local, baseRevision }),
        signal: controller.signal,
      });
      if (controller.signal.aborted || generation !== generationRef.current) return;
      const body = await response.json();
      if (response.status === 409 && body.server) {
        setState({ status: "conflict", local, server: body.server as StoredPlanEnvelope });
        return;
      }
      if (!response.ok || body.status !== "saved" || !body.plan) {
        setState({ status: "error", pending: true, message: "Could not sync. Changes remain on this device." });
        return;
      }
      const plan = body.plan as StoredPlanEnvelope;
      revisionRef.current = plan.revision;
      acknowledgedRef.current = JSON.stringify(plan.snapshot);
      setState({ status: "saved", revision: plan.revision, savedAt: plan.updatedAt });
    } catch (error) {
      if (controller.signal.aborted || generation !== generationRef.current) return;
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      setState(offline || error instanceof TypeError
        ? { status: "offline", pending: true, message: "Offline — changes kept locally." }
        : { status: "error", pending: true, message: "Could not sync. Changes remain on this device." });
    }
  }, [fetcher]);

  useEffect(() => {
    if (!authenticated || !enabled) {
      controllerRef.current?.abort();
      queueMicrotask(() => setState({
        status: "local-only",
        message: authenticated ? "Plan migration needs review." : "Saved on this device.",
      }));
      return;
    }
    if (serialized === acknowledgedRef.current) return;
    const timer = window.setTimeout(() => void save(latestRef.current), debounceMs);
    return () => {
      window.clearTimeout(timer);
      controllerRef.current?.abort();
    };
  }, [authenticated, debounceMs, enabled, save, serialized]);

  useEffect(() => {
    if (!authenticated || !enabled) return;
    const retryOnline = () => {
      if (state.status === "offline" || state.status === "error") void save(latestRef.current);
    };
    window.addEventListener("online", retryOnline);
    return () => window.removeEventListener("online", retryOnline);
  }, [authenticated, enabled, save, state.status]);

  const retry = useCallback(() => save(latestRef.current), [save]);
  const keepLocal = useCallback(() => {
    if (state.status !== "conflict") return;
    revisionRef.current = state.server.revision;
    void save(state.local);
  }, [save, state]);

  const useServer = useCallback(() => {
    if (state.status !== "conflict" || state.server.snapshot.version !== 2) return null;
    revisionRef.current = state.server.revision;
    acknowledgedRef.current = JSON.stringify(state.server.snapshot);
    setState({
      status: "saved",
      revision: state.server.revision,
      savedAt: state.server.updatedAt,
    });
    return state.server.snapshot;
  }, [state]);

  return { state, retry, keepLocal, useServer };
}
