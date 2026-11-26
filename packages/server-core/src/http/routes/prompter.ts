// The prompter routes: sending a rundown row, restoring the previous send, and remote scroll control.
import { isDocId, isRequestKey } from "@manent/sync-protocol";
import type {
  Identity,
  PrompterSendRequest,
  PrompterSendResponse,
} from "@manent/sync-protocol";
import type {
  PrompterOutcome,
  PrompterRefusal,
  PrompterService,
} from "../../prompter/service.ts";
import { failure, json, readJsonBody } from "../respond.ts";
import type { Route } from "../route.ts";
import { isObject } from "./docs.ts";
import {
  PROMPTER_CONTROL_ROUTES,
  answerPrompterControlRequest,
} from "./prompter-control.ts";

/** Who asks, and the service that answers. */
interface PrompterCaller {
  service: PrompterService;
  /** The signed-in person; null: nobody. */
  user(): Identity | null;
}

interface PrompterRoute {
  method: Route["method"];
  path: string;
  run(
    service: PrompterService,
    userId: string,
    body: PrompterSendRequest,
  ): Promise<PrompterOutcome<PrompterSendResponse>>;
}

const STATUS: Readonly<Record<PrompterRefusal, number>> = {
  bad_request: 400,
  forbidden: 403,
  not_in_rundown: 404,
  cannot_send: 409,
  deleted: 410,
  busy: 429,
};

function respond(outcome: PrompterOutcome<PrompterSendResponse>): Response {
  return outcome.ok
    ? json<PrompterSendResponse>(outcome.value)
    : failure(outcome.code, STATUS[outcome.code]);
}

async function readSendBody(
  request: Request,
): Promise<PrompterSendRequest | null> {
  const read = await readJsonBody(request);
  if (!read.ok || !isObject(read.body)) return null;
  const { docId, rowId, key } = read.body;
  if (
    !isDocId(docId) ||
    typeof rowId !== "string" ||
    rowId.length === 0 ||
    !isRequestKey(key)
  )
    return null;
  return { docId, rowId, key };
}

const ANSWERS: readonly PrompterRoute[] = [
  {
    method: "POST",
    path: "/api/prompter/send",
    run: (service, userId, body) => service.send(userId, body),
  },
  {
    method: "POST",
    path: "/api/prompter/send-previous",
    run: (service, userId, body) => service.sendPrevious(userId, body),
  },
];

async function answerAs(
  route: PrompterRoute,
  request: Request,
  caller: PrompterCaller,
): Promise<Response> {
  const user = caller.user();
  if (user === null) return failure("unauthenticated", 401);
  const body = await readSendBody(request);
  if (body === null) return failure("bad_request", 400);
  return respond(await route.run(caller.service, user.userId, body));
}

/** A prompter route's answer, for a server whose configuration carries no prompter service; null for any other request. */
export async function answerPrompterRequest(
  request: Request,
  caller: PrompterCaller,
): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  const route = ANSWERS.find(
    (r) => r.method === request.method && r.path === pathname,
  );
  if (route !== undefined) return answerAs(route, request, caller);
  return answerPrompterControlRequest(request, {
    control: caller.service.control,
    user: caller.user,
  });
}

const SEND_ROUTES: readonly Route[] = ANSWERS.map((route) => ({
  method: route.method,
  path: route.path,
  handle(context) {
    const service = context.config.prompter;
    if (service === undefined) return failure("not_found", 404);
    return answerAs(route, context.request, {
      service,
      user: context.user,
    });
  },
}));

export const PROMPTER_ROUTES: readonly Route[] = [
  ...SEND_ROUTES,
  ...PROMPTER_CONTROL_ROUTES,
];
