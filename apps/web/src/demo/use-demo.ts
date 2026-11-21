// The demo's seed and server control, read once for the whole app.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DemoResponse } from "@manent/sync-protocol";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { createServerControl } from "../api.ts";
import type { Api, ControlState, ServerControl } from "../api.ts";
import type { DeviceMemory } from "../services/sync/device-memory.ts";

export const POLL_MS = 2000;

const DEMO_QUERY = "demo";
/** The first element of the server status query's key. */
export const SERVER_STATUS_QUERY = "server-status";

/** The first key elements of the queries a reset keeps: the demo bar's own, whose loss would blank the bar and set off the reset again. */
const KEPT_ON_RESET = [DEMO_QUERY, SERVER_STATUS_QUERY] as const;

/** The demo's server control; `id` changes when the control does. */
export interface DemoControl {
  id: string;
  client: ServerControl;
}

/** Null `demo` outside demo mode or until the server answers; resets every query but the demo bar's own when the seed changes. */
export function useDemo(deps: { api: Api; fetch: typeof fetch }): {
  demo: DemoResponse | null;
  control: DemoControl | null;
} {
  const queryClient = useQueryClient();
  const demo = useQuery({
    queryKey: [DEMO_QUERY],
    queryFn: deps.api.demo,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
  }).data;

  // Someone reset the demo: nothing cached before it still holds.
  const seenSeed = useRef<string | null | undefined>(undefined);
  const seedId = demo?.seedId;
  useEffect(() => {
    if (seedId === undefined) return;
    if (seenSeed.current !== undefined && seenSeed.current !== seedId)
      void queryClient.resetQueries({
        predicate: (query) =>
          !KEPT_ON_RESET.some((kept) => kept === query.queryKey[0]),
      });
    seenSeed.current = seedId;
  }, [seedId, queryClient]);

  const controlUrl = demo?.control?.url;
  const controlToken = demo?.control?.token;
  const fetchFn = deps.fetch;
  const control = useMemo(
    () =>
      controlUrl && controlToken
        ? {
            id: controlUrl,
            client: createServerControl({
              fetch: fetchFn,
              endpoint: { url: controlUrl, token: controlToken },
            }),
          }
        : null,
    [controlUrl, controlToken, fetchFn],
  );

  return { demo: demo ?? null, control };
}

/** The server's state as the demo bar last heard it; null before its first answer and outside demo mode. */
export function useServerState(): ControlState | null {
  const cache = useQueryClient().getQueryCache();
  const subscribe = useCallback(
    (onChange: () => void) => cache.subscribe(onChange),
    [cache],
  );
  // the bar's own query is the one being watched; one left by an earlier control is not
  const read = (): ControlState | null =>
    cache.find<ControlState>({
      queryKey: [SERVER_STATUS_QUERY],
      exact: false,
      type: "active",
    })?.state.data ?? null;
  return useSyncExternalStore(subscribe, read, read);
}

/**
 * Run before any store opens. When the demo's seed differs from the one this device's data belongs to, clears
 * everything this browser kept for Manent, remembers the new seed and reloads the page, never settling then. With no
 * seed remembered the seed is written once the server answers, and nothing waits for it; offline, or outside demo
 * mode, nothing is cleared.
 */
export async function followDemoSeed(options: {
  demo: () => Promise<DemoResponse | null>;
  memory: Pick<DeviceMemory, "seed" | "setSeed">;
  clear: () => Promise<void>;
  reload: () => void;
}): Promise<void> {
  const { memory } = options;
  const remembered = memory.seed();
  const answer = options.demo().then(
    (demo) => demo?.seedId ?? null,
    // offline, or a server that cannot tell: this device's data stays
    () => null,
  );
  if (remembered === null) {
    void answer.then((seedId) => {
      if (seedId !== null && memory.seed() === null) memory.setSeed(seedId);
    });
    return;
  }
  const seedId = await answer;
  if (seedId === null || seedId === remembered) return;
  await options.clear();
  memory.setSeed(seedId);
  options.reload();
  await new Promise<never>(() => {});
}
