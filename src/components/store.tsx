"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AppState, PlanChange } from "@/lib/types";

/** Client-side home of the app's data. Every change goes to the server and comes back as fresh state. */

export interface Toast {
  id: number;
  kind: "ok" | "error" | "plan";
  title: string;
  lines?: string[];
}

interface RunResult {
  ok: boolean;
  change?: PlanChange | null;
  message?: string;
  data?: unknown;
  error?: string;
}

interface Store {
  state: AppState | null;
  loadError: string | null;
  busy: boolean;
  run: (action: string, payload?: unknown, opts?: { quiet?: boolean; success?: string }) => Promise<RunResult>;
  refresh: () => Promise<void>;
  toast: (t: Omit<Toast, "id">) => void;
  toasts: Toast[];
  dismiss: (id: number) => void;
}

const Ctx = createContext<Store | null>(null);

export function tzHeader(): Record<string, string> {
  try {
    return { "x-tz": Intl.DateTimeFormat().resolvedOptions().timeZone };
  } catch {
    return {};
  }
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-2), { ...t, id }]);
      setTimeout(() => dismiss(id), t.kind === "plan" ? 9000 : t.kind === "error" ? 7000 : 3500);
    },
    [dismiss],
  );

  const run = useCallback<Store["run"]>(
    async (action, payload, opts) => {
      setPending((n) => n + 1);
      try {
        const res = await fetch("/api/rpc", { method: "POST", headers: { "Content-Type": "application/json", ...tzHeader() }, body: JSON.stringify({ action, payload }) });
        if (res.status === 401) {
          window.location.href = "/login";
          return { ok: false, error: "Signed out" };
        }
        const body = await res.json();
        if (!body.ok) {
          toast({ kind: "error", title: body.error ?? "That did not work. Please try again." });
          return { ok: false, error: body.error };
        }
        setState(body.state);
        const change = body.change as PlanChange | null | undefined;
        if (change && (change.items.length || !opts?.quiet)) toast({ kind: "plan", title: change.summary, lines: change.items.slice(0, 4) });
        else if (!opts?.quiet && (body.message || opts?.success)) toast({ kind: "ok", title: body.message ?? opts!.success! });
        return { ok: true, change, message: body.message, data: body.data };
      } catch {
        toast({ kind: "error", title: "Could not reach the server. Check your connection and try again." });
        return { ok: false, error: "network" };
      } finally {
        setPending((n) => n - 1);
      }
    },
    [toast],
  );

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { headers: tzHeader(), cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const body = await res.json();
      if (body.ok) {
        setState(body.state);
        setLoadError(null);
      } else setLoadError(body.error ?? "Could not load your data.");
    } catch {
      setLoadError("Could not reach the server. Check your connection and reload.");
    }
  }, []);

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Load, then let the planner catch up with anything missed since the last visit.
    refresh().then(() => run("sync", {}, { quiet: true }));
  }, [refresh, run]);

  const value = useMemo(() => ({ state, loadError, busy: pending > 0, run, refresh, toast, toasts, dismiss }), [state, loadError, pending, run, refresh, toast, toasts, dismiss]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used inside StoreProvider");
  return s;
}

/** For pages: the loaded state. The shell only renders pages once it exists. */
export function useApp(): AppState {
  const { state } = useStore();
  if (!state) throw new Error("State not loaded");
  return state;
}
