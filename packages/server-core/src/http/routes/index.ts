// Every route the server answers, one area per line.
import type { Route } from "../route.ts";
import { AUTH_ROUTES } from "./auth.ts";
import { DEMO_ROUTES } from "./demo.ts";
import { HEALTH_ROUTES } from "./health.ts";

export const ROUTES: readonly Route[] = [
  ...AUTH_ROUTES,
  ...DEMO_ROUTES,
  ...HEALTH_ROUTES,
];
