// The route a supervisor polls.
import type { HealthResponse } from "@manent/sync-protocol";
import { json } from "../respond.ts";
import type { Route } from "../route.ts";

export const HEALTH_ROUTES: readonly Route[] = [
  {
    method: "GET",
    path: "/health",
    handle: () => json<HealthResponse>({ ok: true }),
  },
];
