// Every surface draws through this: one renderer per state, the one loading rule, and its own error boundary.
import type { SurfaceId } from "@manent/commands";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import {
  LOADING_MIN_MS,
  LOADING_QUIET_MS,
  useTiming,
} from "../../surfaces/timing.ts";
import { SurfaceBoundary } from "./surface-boundary.tsx";

/** `sinceMs` is the instant loading began, on the clock of the nearest `TimingProvider`. */
export type SurfaceStateValue =
  | { kind: "ready" }
  | { kind: "empty" }
  | { kind: "loading"; sinceMs: number }
  | { kind: "problem"; reason: string }
  | { kind: "offline" }
  | { kind: "read_only" }
  | { kind: "no_access" };

export type SurfaceRenderers = {
  [K in SurfaceStateValue["kind"]]: (
    state: Extract<SurfaceStateValue, { kind: K }>,
    reload: () => void,
  ) => ReactNode;
};

type Loading = Extract<SurfaceStateValue, { kind: "loading" }>;

interface SurfaceStateProps {
  surface: SurfaceId;
  state: SurfaceStateValue;
  render: SurfaceRenderers;
}

// nothing for LOADING_QUIET_MS, then the placeholder for at least LOADING_MIN_MS; null draws nothing
function useLoadingRule(state: SurfaceStateValue): SurfaceStateValue | null {
  const { now, schedule } = useTiming();
  const [wakes, refresh] = useReducer((n: number) => n + 1, 0);
  const placeholder = useRef<{ state: Loading; shownAt: number } | null>(null);
  const at = now();
  const shown = placeholder.current;
  let view: SurfaceStateValue | null = state;
  let wakeAt: number | null = null;
  if (
    state.kind === "loading" &&
    shown === null &&
    at < state.sinceMs + LOADING_QUIET_MS
  ) {
    view = null;
    wakeAt = state.sinceMs + LOADING_QUIET_MS;
  } else if (
    state.kind !== "loading" &&
    shown !== null &&
    at < shown.shownAt + LOADING_MIN_MS
  ) {
    view = shown.state;
    wakeAt = shown.shownAt + LOADING_MIN_MS;
  }

  useLayoutEffect(() => {
    placeholder.current =
      view?.kind === "loading"
        ? { state: view, shownAt: placeholder.current?.shownAt ?? at }
        : null;
  });
  // a timer may fire a moment before its time (Firefox's, against Date.now), so every wake schedules again
  useEffect(
    () => (wakeAt === null ? undefined : schedule(refresh, wakeAt - now())),
    [wakeAt, wakes, now, schedule],
  );
  return view;
}

function SurfaceView({
  state,
  render,
  reload,
}: {
  state: SurfaceStateValue;
  render: SurfaceRenderers;
  reload: () => void;
}): ReactNode {
  switch (state.kind) {
    case "ready":
      return render.ready(state, reload);
    case "empty":
      return render.empty(state, reload);
    case "loading":
      return render.loading(state, reload);
    case "problem":
      return render.problem(state, reload);
    case "offline":
      return render.offline(state, reload);
    case "read_only":
      return render.read_only(state, reload);
    case "no_access":
      return render.no_access(state, reload);
  }
}

/** A renderer that throws draws the `problem` renderer with reason `boundary`; its `reload` mounts the surface again. Needs a `TimingProvider`. */
export function SurfaceState({
  surface,
  state,
  render,
}: SurfaceStateProps): ReactNode {
  const [mounts, setMounts] = useState(0);
  const reload = useCallback(() => setMounts((n) => n + 1), []);
  const view = useLoadingRule(state);
  return (
    <SurfaceBoundary
      key={`${surface}:${mounts}`}
      fallback={() =>
        render.problem({ kind: "problem", reason: "boundary" }, reload)
      }
    >
      {view === null ? null : (
        <SurfaceView state={view} render={render} reload={reload} />
      )}
    </SurfaceBoundary>
  );
}
