// The driver routes: who drives a script presented to the room, taking the keys and giving them back.
import { isDocId } from "@manent/sync-protocol";
import type { Identity } from "@manent/sync-protocol";
import type { DriverOutcome, DriverService } from "../../driver/service.ts";
import { failure, json, readJsonBody } from "../respond.ts";
import type { Route } from "../route.ts";
import { isObject } from "./docs.ts";

/** Who asks, and the service that answers. */
interface DriverCaller {
  service: DriverService;
  /** The signed-in person; null: nobody. */
  user(): Identity | null;
}

interface DriverRoute {
  method: Route["method"];
  path: string;
  answer(
    request: Request,
    user: Identity,
    service: DriverService,
  ): Response | Promise<Response>;
}

const STATUS: Readonly<
  Record<Exclude<DriverOutcome, { ok: true }>["code"], number>
> = {
  forbidden: 403,
  deleted: 410,
  not_driver: 409,
  driver_taken: 409,
};

function respond(outcome: DriverOutcome): Response {
  if (outcome.ok) return json({ driver: outcome.driver });
  if (outcome.code === "driver_taken")
    return json(
      { error: outcome.code, driver: outcome.driver },
      STATUS[outcome.code],
    );
  return failure(outcome.code, STATUS[outcome.code]);
}

/** The body's fields; null for a body that is not a JSON object naming a document. */
async function readBody(
  request: Request,
): Promise<{ docId: string; fields: Record<string, unknown> } | null> {
  const read = await readJsonBody(request);
  if (!read.ok || !isObject(read.body)) return null;
  const { docId } = read.body;
  return isDocId(docId) ? { docId, fields: read.body } : null;
}

const ANSWERS: readonly DriverRoute[] = [
  {
    method: "GET",
    path: "/api/driver/current",
    answer(request, user, service) {
      const docId = new URL(request.url).searchParams.get("docId");
      if (!isDocId(docId)) return failure("bad_request", 400);
      return respond(service.current(user.userId, docId));
    },
  },
  {
    method: "POST",
    path: "/api/driver/take",
    async answer(request, user, service) {
      const body = await readBody(request);
      const expected = body?.fields.expectedDriverUserId;
      if (body === null || (expected !== null && typeof expected !== "string"))
        return failure("bad_request", 400);
      return respond(service.take(user, body.docId, expected));
    },
  },
  {
    method: "POST",
    path: "/api/driver/release",
    async answer(request, user, service) {
      const body = await readBody(request);
      if (body === null) return failure("bad_request", 400);
      return respond(service.release(user.userId, body.docId));
    },
  },
];

function answerAs(
  route: DriverRoute,
  request: Request,
  caller: DriverCaller,
): Response | Promise<Response> {
  const user = caller.user();
  if (user === null) return failure("unauthenticated", 401);
  return route.answer(request, user, caller.service);
}

/** A driver route's answer, for a server whose configuration carries no driver service; null for any other request. */
export async function answerDriverRequest(
  request: Request,
  caller: DriverCaller,
): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  const route = ANSWERS.find(
    (r) => r.method === request.method && r.path === pathname,
  );
  return route === undefined ? null : answerAs(route, request, caller);
}

export const DRIVER_ROUTES: readonly Route[] = ANSWERS.map((route) => ({
  method: route.method,
  path: route.path,
  handle(context) {
    const service = context.config.driver;
    if (service === undefined) return failure("not_found", 404);
    return answerAs(route, context.request, {
      service,
      user: context.user,
    });
  },
}));
