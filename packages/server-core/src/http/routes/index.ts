// Every route the server answers, one area per line.
import type { Route } from "../route.ts";
import { AUTH_ROUTES } from "./auth.ts";
import { DEMO_ROUTES } from "./demo.ts";
import { docsRoutes } from "./docs.ts";
import { HEALTH_ROUTES } from "./health.ts";
import { replayRoutes } from "./replay.ts";
import { SOCKET_ROUTES } from "./socket.ts";

export const ROUTES: readonly Route[] = [
  ...AUTH_ROUTES,
  ...DEMO_ROUTES,
  ...docsRoutes,
  ...HEALTH_ROUTES,
  ...replayRoutes,
  ...SOCKET_ROUTES,
];
