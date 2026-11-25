// Every route the server answers, one area per line.
import type { Route } from "../route.ts";
import { adoptRoutes } from "./adopt.ts";
import { AUTH_ROUTES } from "./auth.ts";
import { DEMO_ROUTES } from "./demo.ts";
import { DEMO_CONTROL_ROUTES } from "./demo-controls.ts";
import { docsRoutes } from "./docs.ts";
import { DOCS_INFO_ROUTES } from "./docs-info.ts";
import { HEALTH_ROUTES } from "./health.ts";
import { historyRoutes } from "./history.ts";
import { productionRoutes } from "./production.ts";
import { replayRoutes } from "./replay.ts";
import { SOCKET_ROUTES } from "./socket.ts";
import { SHARE_ROUTES } from "./share.ts";
import { DRAFTS_ROUTES } from "./drafts.ts";
import { PRIVATE_ROUTES } from "./private.ts";
import { DRIVER_ROUTES } from "./driver.ts";
import { PROMPTER_ROUTES } from "./prompter.ts";
import { workspaceRoutes } from "./workspace.ts";

export const ROUTES: readonly Route[] = [
  ...adoptRoutes,
  ...AUTH_ROUTES,
  ...DEMO_ROUTES,
  ...DEMO_CONTROL_ROUTES,
  ...docsRoutes,
  ...DOCS_INFO_ROUTES,
  ...HEALTH_ROUTES,
  ...historyRoutes,
  ...productionRoutes,
  ...replayRoutes,
  ...SOCKET_ROUTES,
  ...SHARE_ROUTES,
  ...DRAFTS_ROUTES,
  ...PRIVATE_ROUTES,
  ...DRIVER_ROUTES,
  ...PROMPTER_ROUTES,
  ...workspaceRoutes,
];
