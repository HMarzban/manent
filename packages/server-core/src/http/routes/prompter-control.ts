// HTTP route handlers for remote prompter operator lease and scroll control.
import { isDocId, isPrompterScrollCommand } from "@manent/sync-protocol";
import type {
  Identity,
  PrompterOperatorReleaseRequest,
  PrompterOperatorTakeRequest,
  PrompterOperatorTakenResponse,
} from "@manent/sync-protocol";
import type {
  PrompterControlOutcome,
  PrompterControlService,
} from "../../prompter/control.ts";
import { failure, json, readJsonBody } from "../respond.ts";
import type { Route } from "../route.ts";
import { isObject } from "./docs.ts";

export interface PrompterControlCaller {
  control: PrompterControlService;
  user(): Identity | null;
}

type ControlRouteKind = "status" | "take" | "release" | "command";

interface MatchedControlRoute {
  readonly kind: ControlRouteKind;
  readonly docIdFromPath: string | null;
}

const PARAM_CONTROL = new RegExp("^/api/prompter/([^/]+)/control$");
const PARAM_TAKE = new RegExp("^/api/prompter/([^/]+)/operator/take$");
const PARAM_RELEASE = new RegExp("^/api/prompter/([^/]+)/operator/release$");

function matchControlRoute(
  method: string,
  pathname: string,
): MatchedControlRoute | null {
  if (method === "GET") {
    if (pathname === "/api/prompter/control")
      return { kind: "status", docIdFromPath: null };
    const m = PARAM_CONTROL.exec(pathname);
    return m !== null ? { kind: "status", docIdFromPath: m[1]! } : null;
  }
  if (method !== "POST") return null;
  if (pathname === "/api/prompter/operator/take")
    return { kind: "take", docIdFromPath: null };
  if (pathname === "/api/prompter/operator/release")
    return { kind: "release", docIdFromPath: null };
  if (pathname === "/api/prompter/control")
    return { kind: "command", docIdFromPath: null };
  const take = PARAM_TAKE.exec(pathname);
  if (take !== null) return { kind: "take", docIdFromPath: take[1]! };
  const rel = PARAM_RELEASE.exec(pathname);
  if (rel !== null) return { kind: "release", docIdFromPath: rel[1]! };
  const cmd = PARAM_CONTROL.exec(pathname);
  if (cmd !== null) return { kind: "command", docIdFromPath: cmd[1]! };
  return null;
}

function respondControl<T>(outcome: PrompterControlOutcome<T>): Response {
  if (outcome.ok) return json(outcome.value);
  switch (outcome.code) {
    case "bad_request":
      return failure("bad_request", 400);
    case "forbidden":
      return failure("forbidden", 403);
    case "not_in_rundown":
      return failure("not_in_rundown", 404);
    case "deleted":
      return failure("deleted", 410);
    case "operator_taken":
      return json<PrompterOperatorTakenResponse>(
        {
          error: "operator_taken",
          operator: outcome.operator,
          serverTime: outcome.serverTime,
        },
        409,
      );
    case "not_operator":
      return json(
        { error: "not_operator", serverTime: outcome.serverTime },
        409,
      );
  }
}

async function readObject(
  request: Request,
): Promise<Record<string, unknown> | null> {
  const read = await readJsonBody(request);
  return read.ok && isObject(read.body) ? read.body : null;
}

function resolveDocId(
  fromPath: string | null,
  fromBodyOrQuery: unknown,
): string | null {
  const candidate = fromPath ?? fromBodyOrQuery;
  return isDocId(candidate) ? candidate : null;
}

async function handleMatched(
  matched: MatchedControlRoute,
  request: Request,
  caller: PrompterControlCaller,
): Promise<Response> {
  const user = caller.user();
  if (user === null) return failure("unauthenticated", 401);

  if (matched.kind === "status") {
    const queryDocId = new URL(request.url).searchParams.get("docId");
    const docId = resolveDocId(matched.docIdFromPath, queryDocId);
    if (docId === null) return failure("bad_request", 400);
    return respondControl(await caller.control.status(user.userId, docId));
  }

  const body = await readObject(request);
  if (body === null) return failure("bad_request", 400);
  const docId = resolveDocId(matched.docIdFromPath, body.docId);
  if (docId === null) return failure("bad_request", 400);

  if (matched.kind === "take") {
    const { deviceId, expectedUserId, expectedDeviceId } = body;
    if (
      typeof deviceId !== "string" ||
      (expectedUserId !== null && typeof expectedUserId !== "string") ||
      (expectedDeviceId !== undefined &&
        expectedDeviceId !== null &&
        typeof expectedDeviceId !== "string")
    )
      return failure("bad_request", 400);
    const req: PrompterOperatorTakeRequest = {
      deviceId,
      expectedUserId,
      ...(expectedDeviceId !== undefined ? { expectedDeviceId } : {}),
    };
    return respondControl(await caller.control.take(user, docId, req));
  }

  if (matched.kind === "release") {
    const { deviceId } = body;
    if (typeof deviceId !== "string") return failure("bad_request", 400);
    const req: PrompterOperatorReleaseRequest = { deviceId };
    return respondControl(
      await caller.control.release(user.userId, docId, req),
    );
  }

  if (!isPrompterScrollCommand(body)) return failure("bad_request", 400);
  return respondControl(await caller.control.command(user.userId, docId, body));
}

/** Matches both static `/api/prompter/...` and parameterized `/api/prompter/:docId/...` control routes. */
export async function answerPrompterControlRequest(
  request: Request,
  caller: PrompterControlCaller,
): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  const matched = matchControlRoute(request.method, pathname);
  return matched === null ? null : handleMatched(matched, request, caller);
}

const STATIC_ROUTES: readonly { method: Route["method"]; path: string }[] = [
  { method: "GET", path: "/api/prompter/control" },
  { method: "POST", path: "/api/prompter/operator/take" },
  { method: "POST", path: "/api/prompter/operator/release" },
  { method: "POST", path: "/api/prompter/control" },
];

export const PROMPTER_CONTROL_ROUTES: readonly Route[] = STATIC_ROUTES.map(
  (route) => ({
    method: route.method,
    path: route.path,
    async handle(context) {
      const service = context.config.prompter;
      if (service === undefined) return failure("not_found", 404);
      const answered = await answerPrompterControlRequest(context.request, {
        control: service.control,
        user: context.user,
      });
      return answered ?? failure("not_found", 404);
    },
  }),
);
