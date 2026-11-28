// The node's own routes under /api/local: who is here, Sign in to sync, focus, storage, the connection, and the shell.
import type { SessionStore } from "@manent/server-core";
import type { Clock, SyncClient } from "@manent/sync-client";
import type { ErrorResponse, HttpErrorCode } from "@manent/sync-protocol";
import { readPerson } from "../auth/people.ts";
import { exportFilesRoutes } from "../export-files/routes.ts";
import { mosLanRelayRoutes } from "../mos/routes.ts";
import { prompterFilesRoutes } from "../prompter-files/routes.ts";
import type { LocalCloudStatus } from "../node/cloud-status.ts";
import type { NodeRecords } from "../records/ports.ts";
import type { ShellChannel } from "./shell-channel.ts";

const NO_CLOCK: Clock = {
  now: () => 0,
  schedule: () => () => {},
};

const CONNECTION_MODES = ["online", "offline", "slow"] as const;
type ConnectionMode = (typeof CONNECTION_MODES)[number];
const DELAY_LIMIT_MS = 10_000;

const failure = (code: HttpErrorCode, status: number): Response =>
  Response.json({ error: code } satisfies ErrorResponse, { status });

const noContent = (): Response => new Response(null, { status: 204 });

function readConnection(
  body: unknown,
): { mode: ConnectionMode; delayMs: number } | null {
  if (typeof body !== "object" || body === null) return null;
  if (!("mode" in body && "delayMs" in body)) return null;
  const { mode, delayMs } = body;
  const known = CONNECTION_MODES.find((m) => m === mode);
  if (known === undefined || typeof delayMs !== "number") return null;
  if (!Number.isInteger(delayMs) || delayMs < 0 || delayMs > DELAY_LIMIT_MS)
    return null;
  return { mode: known, delayMs };
}

/** What each entry of `LOCAL_ROUTES` is given. */
export interface LocalRouteContext {
  records: NodeRecords;
  shell: ShellChannel;
  sessions: SessionStore;
  signInToSync(
    userId: string,
  ): Promise<{ ok: true } | { ok: false; code: "unreachable" }>;
  onFocus(): void;
  storeUsage(): { scripts: number; bytes: number };
  setConnection(mode: "online" | "offline" | "slow", delayMs: number): void;
  cloudStatus(): LocalCloudStatus;
  probeCloud?(): Promise<void>;
  clientOf(userId: string): SyncClient | null;
  clock: Clock;
  onClose(fn: () => void): void;
}

export type LocalRoute = (request: Request) => Promise<Response> | Response;

/** Who is here, and Sign in to sync. */
const personRoutes = (
  context: LocalRouteContext,
): Record<string, LocalRoute> => ({
  "GET /api/local/person"(request) {
    const person = readPerson(request, context);
    if (person === null) return failure("unauthenticated", 401);
    return Response.json({
      userId: person.userId,
      name: person.name,
      cloud: person.wantsCloud ? "signed_in" : "not_signed_in",
    });
  },
  async "POST /api/local/sign-in-to-sync"(request) {
    const person = readPerson(request, context);
    if (person === null) return failure("unauthenticated", 401);
    const signedIn = await context.signInToSync(person.userId);
    if (!signedIn.ok) return failure(signedIn.code, 503);
    return Response.json({ cloud: "signed_in" });
  },
});

const focusRoutes = (
  context: LocalRouteContext,
): Record<string, LocalRoute> => ({
  "POST /api/local/focus"() {
    context.onFocus();
    return noContent();
  },
});

const storageRoutes = (
  context: LocalRouteContext,
): Record<string, LocalRoute> => ({
  "GET /api/local/storage": () => Response.json(context.storeUsage()),
});

const connectionRoutes = (
  context: LocalRouteContext,
): Record<string, LocalRoute> => ({
  async "GET /api/local/status"(request) {
    if (new URL(request.url).searchParams.get("probe") === "1") {
      await context.probeCloud?.();
    }
    return Response.json(context.cloudStatus());
  },
  async "POST /api/local/connection"(request) {
    // A body that is not JSON reads as null, which no connection matches.
    const connection = readConnection(await request.json().catch(() => null));
    if (connection === null) return failure("bad_request", 400);
    context.setConnection(connection.mode, connection.delayMs);
    return noContent();
  },
});

/** The node's own routes, one entry per feature, each keyed `<METHOD> <path>`. */
export const LOCAL_ROUTES: readonly ((
  context: LocalRouteContext,
) => Record<string, LocalRoute>)[] = [
  personRoutes,
  focusRoutes,
  storageRoutes,
  connectionRoutes,
  prompterFilesRoutes,
  mosLanRelayRoutes,
  exportFilesRoutes,
];

/**
 * The routes the node answers itself, after the launch guard; null for any other request. The person routes
 * take the node token as `Authorization: Bearer`; a person is `signed_in` once they chose to sync with the cloud.
 */
export function localRoutes(
  options: Omit<
    LocalRouteContext,
    "clientOf" | "clock" | "onClose" | "cloudStatus"
  > &
    Partial<
      Pick<LocalRouteContext, "clientOf" | "clock" | "onClose" | "cloudStatus">
    >,
): (request: Request) => Promise<Response | null> {
  const context: LocalRouteContext = {
    ...options,
    cloudStatus:
      options.cloudStatus ?? (() => ({ online: true, mode: "online" })),
    clientOf: options.clientOf ?? (() => null),
    clock: options.clock ?? NO_CLOCK,
    onClose: options.onClose ?? (() => {}),
  };
  const routes = LOCAL_ROUTES.reduce<Record<string, LocalRoute>>(
    (all, entry) => ({ ...all, ...entry(context) }),
    {},
  );
  return async (request) => {
    const route = routes[`${request.method} ${new URL(request.url).pathname}`];
    if (route !== undefined) return route(request);
    return options.shell.handle(request);
  };
}
