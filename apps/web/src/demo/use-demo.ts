// The demo's seed and server control, read once for the whole app.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DemoResponse } from "@manent/sync-protocol";
import { useEffect, useMemo, useRef } from "react";
import { createServerControl } from "../api.ts";
import type { Api, ServerControl } from "../api.ts";

export const POLL_MS = 2000;

/** The demo's server control; `id` changes when the control does. */
export interface DemoControl {
  id: string;
  client: ServerControl;
}

/** Null `demo` outside demo mode or until the server answers; resets every query when the seed changes. */
export function useDemo(deps: { api: Api; fetch: typeof fetch }): {
  demo: DemoResponse | null;
  control: DemoControl | null;
} {
  const queryClient = useQueryClient();
  const demo = useQuery({
    queryKey: ["demo"],
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
      void queryClient.resetQueries();
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
