// The demo bar's controls on the server: simulated writers, the Tour's preparations and Reorganise.
import { isDocId } from "@manent/sync-protocol";
import type {
  DemoControls,
  RebuildResponse,
  WritersRequest,
} from "@manent/sync-protocol";
import { isLoopbackAddress } from "../../net/bind.ts";
import { createDocumentAccess } from "../../sync/access.ts";
import { failure, json } from "../respond.ts";
import type { Route, RouteContext } from "../route.ts";
import { isObject, readRequest } from "./docs.ts";

const WRITER_COUNTS: readonly WritersRequest["count"][] = [0, 1, 5, 20];

type Called =
  | { ok: true; userId: string; body: unknown; controls: DemoControls }
  | { ok: false; response: Response };

/**
 * The caller and body of a control: 404 outside demo mode or from a caller not on this machine
 * (the controls change what everyone sees), 401 without a signed-in user, 400 for a body that is not JSON.
 */
async function readCall(context: RouteContext): Promise<Called> {
  const controls = context.config.demo?.controls ?? null;
  if (controls === null || !isLoopbackAddress(context.peer.remoteAddress))
    return { ok: false, response: failure("not_found", 404) };
  const read = await readRequest(context);
  if (!read.ok) return read;
  return { ok: true, userId: read.userId, body: read.body, controls };
}

/** 403 unless the caller can edit `docId`; 429 while its home is still being seeded. */
function refuseEditing(
  context: RouteContext,
  userId: string,
  docId: string,
): Response | null {
  const { config } = context;
  if (config.sync === null) return failure("not_found", 404);
  const { storage } = config.sync;
  const home = storage.directory.placeOf(docId)?.home;
  const homeKey = home === undefined ? null : `${home.kind}:${home.id}`;
  if (homeKey !== null && config.demo?.isHomeReady?.(homeKey) === false)
    return failure("busy", 429);
  const access = createDocumentAccess({
    storage,
    versions: config.socket.versions,
  });
  const resolved = access.resolve(userId, docId);
  const role = resolved.ok ? resolved.access.role : null;
  return role === "owner" || role === "edit" ? null : failure("forbidden", 403);
}

function readWriters(body: unknown): WritersRequest | null {
  if (!isObject(body) || !isDocId(body.docId)) return null;
  const count = WRITER_COUNTS.find((n) => n === body.count);
  const after = body.afterBlockId;
  if (count === undefined || (after !== null && typeof after !== "string"))
    return null;
  return { docId: body.docId, count, afterBlockId: after };
}

export const DEMO_CONTROL_ROUTES: Route[] = [
  {
    method: "POST",
    path: "/api/demo/writers",
    async handle(context) {
      const call = await readCall(context);
      if (!call.ok) return call.response;
      const request = readWriters(call.body);
      if (request === null) return failure("bad_request", 400);
      const refused = refuseEditing(context, call.userId, request.docId);
      if (refused !== null) return refused;
      return json(await call.controls.writers(call.userId, request));
    },
  },
  {
    method: "POST",
    path: "/api/demo/writers/running",
    async handle(context) {
      const call = await readCall(context);
      if (!call.ok) return call.response;
      const { body } = call;
      if (!isObject(body) || !isDocId(body.docId))
        return failure("bad_request", 400);
      const refused = refuseEditing(context, call.userId, body.docId);
      if (refused !== null) return refused;
      return json(await call.controls.runningWriters(call.userId, body.docId));
    },
  },
  {
    method: "POST",
    path: "/api/demo/tour/prepare",
    async handle(context) {
      const call = await readCall(context);
      if (!call.ok) return call.response;
      const { body } = call;
      if (!isObject(body) || typeof body.scenarioId !== "string")
        return failure("bad_request", 400);
      const scenarioId = body.scenarioId;
      return json(await call.controls.prepare(call.userId, { scenarioId }));
    },
  },
  {
    method: "POST",
    path: "/api/demo/rebuild",
    async handle(context) {
      const call = await readCall(context);
      if (!call.ok) return call.response;
      const { body } = call;
      if (!isObject(body) || !isDocId(body.docId))
        return failure("bad_request", 400);
      const refused = refuseEditing(context, call.userId, body.docId);
      if (refused !== null) return refused;
      await call.controls.rebuild(call.userId, body.docId);
      return json<RebuildResponse>({ requested: true });
    },
  },
];
