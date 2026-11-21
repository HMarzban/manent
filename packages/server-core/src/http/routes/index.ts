// Every route the server answers, one area per line.
import type { Route } from "../route.ts";
import { adoptRoutes } from "./adopt.ts";
import { AUTH_ROUTES } from "./auth.ts";
import { DEMO_ROUTES } from "./demo.ts";
import { docsRoutes } from "./docs.ts";
import { DOCS_INFO_ROUTES } from "./docs-info.ts";
import { HEALTH_ROUTES } from "./health.ts";
import { historyRoutes } from "./history.ts";
import { replayRoutes } from "./replay.ts";
import { SOCKET_ROUTES } from "./socket.ts";

export const ROUTES: readonly Route[] = [
  ...adoptRoutes,
  ...AUTH_ROUTES,
  ...DEMO_ROUTES,
  ...docsRoutes,
  ...DOCS_INFO_ROUTES,
  ...HEALTH_ROUTES,
  ...historyRoutes,
  ...replayRoutes,
  ...SOCKET_ROUTES,
];
