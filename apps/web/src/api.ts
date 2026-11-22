// The app's requests to the server and to the demo's server control.

import type {
  ControlEndpoint,
  DemoResponse,
  DocClientsResponse,
  HttpErrorCode,
  MeResponse,
  RemovedDocResponse,
  ServerState,
  SignInChoice,
  SignInOptions,
  SignInResponse,
  TourPrepareResponse,
  WritersRequest,
  WritersResponse,
} from "@manent/sync-protocol";
import type { TabPerson } from "./session.ts";

export type ControlState = ServerState | "unreachable";

export type SignInResult =
  | { ok: true; person: TabPerson }
  | { ok: false; reason: "unknown_user" | "unreachable" };

export type MeResult =
  | { ok: true; me: MeResponse }
  | { ok: false; reason: "unauthenticated" | "unreachable" };

export interface Api {
  /** Throws when the server cannot be reached. */
  choices(): Promise<readonly SignInChoice[]>;
  signIn(userId: string): Promise<SignInResult>;
  me(): Promise<MeResult>;
  /** Null outside demo mode; throws when it cannot tell. */
  demo(): Promise<DemoResponse | null>;
  /** Who deleted the document and when; null when the server holds no record of it; throws when it cannot tell. */
  removedDoc(docId: string): Promise<RemovedDocResponse | null>;
  /** Who wrote under each of the document's client ids the server knows; throws when it cannot tell. */
  docClients(
    docId: string,
    clientIds: readonly number[],
  ): Promise<DocClientsResponse>;
  /** Puts the scenario's state in place on the demo's server; an answer other than 200 is `unknown`; throws when the server cannot be reached. */
  prepareTour(scenarioId: string): Promise<TourPrepareResponse>;
  /** Starts or stops the demo's simulated writers in a script; throws for any other answer than 200. */
  writers(request: WritersRequest): Promise<WritersResponse>;
  /** Asks the demo's server to reorganise how a script is stored; throws for any other answer than 200. */
  rebuild(docId: string): Promise<void>;
}

export interface ServerControl {
  status(): Promise<ControlState>;
  stop(): Promise<void>;
  start(): Promise<void>;
  /** Stops the server, seeds the demo again and starts it; the state the server is left in. */
  reset(): Promise<ControlState>;
}

function bearer(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * The body of a success from this build's own server: the shared contract
 * fixes its shape, so it is trusted. Throws when the body is not JSON.
 */
async function readAs<T>(response: Response): Promise<T> {
  const body: unknown = await response.json();
  return body as T;
}

/** The body of a success, as `readAs` trusts it; throws, naming the request `what`, for any other answer. */
async function readOk<T>(response: Response, what: string): Promise<T> {
  if (!response.ok) throw new Error(`${what} answered ${response.status}`);
  return readAs<T>(response);
}

/** The body as JSON; null when there is none or it is not JSON. */
async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    // no body, or not JSON: there is nothing to read
    return null;
  }
}

/** The code a refusal's body names; null when it names none. */
async function errorCodeOf(response: Response): Promise<HttpErrorCode | null> {
  const body = await readJson(response);
  if (typeof body !== "object" || body === null || !("error" in body))
    return null;
  // the protocol's guards are loaded apart from the entry
  const { isHttpErrorCode } = await import("@manent/sync-protocol");
  return isHttpErrorCode(body.error) ? body.error : null;
}

/** A POST of `body` as JSON. */
const jsonPost = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const UNREACHABLE = Object.freeze({
  ok: false,
  reason: "unreachable",
} as const);

export function createApi(options: {
  fetch: typeof fetch;
  getToken: () => string | null;
}): Api {
  // called as a plain function: a browser's fetch refuses another `this`
  const fetchFn = options.fetch;
  const { getToken } = options;
  const request = (path: string, init: RequestInit = {}) =>
    fetchFn(path, {
      ...init,
      headers: { ...bearer(getToken()), ...init.headers },
    });
  /** The answer; null when the server cannot be reached. */
  const attempt = async (
    path: string,
    init?: RequestInit,
  ): Promise<Response | null> => {
    try {
      return await request(path, init);
    } catch {
      // the request never reached the server
      return null;
    }
  };

  return {
    async choices() {
      const response = await request("/api/sign-in");
      return (await readOk<SignInOptions>(response, "GET /api/sign-in"))
        .choices;
    },

    async signIn(userId) {
      const response = await attempt("/api/sign-in", jsonPost({ userId }));
      if (response === null) return UNREACHABLE;
      if (!response.ok)
        return (await errorCodeOf(response)) === "unknown_user"
          ? { ok: false, reason: "unknown_user" }
          : UNREACHABLE;
      const { token, user } = await readAs<SignInResponse>(response);
      return {
        ok: true,
        person: { token, userId: user.userId, name: user.name },
      };
    },

    async me() {
      const response = await attempt("/api/me");
      if (response === null) return UNREACHABLE;
      if (!response.ok)
        return (await errorCodeOf(response)) === "unauthenticated"
          ? { ok: false, reason: "unauthenticated" }
          : UNREACHABLE;
      return { ok: true, me: await readAs<MeResponse>(response) };
    },

    async demo() {
      const response = await request("/api/demo");
      if (response.status === 404) return null;
      return readOk<DemoResponse>(response, "GET /api/demo");
    },

    async removedDoc(docId) {
      const response = await request("/api/docs/removed", jsonPost({ docId }));
      if (response.status === 404) return null;
      return readOk<RemovedDocResponse>(response, "POST /api/docs/removed");
    },

    async docClients(docId, clientIds) {
      const response = await request(
        "/api/docs/clients",
        jsonPost({ docId, clientIds }),
      );
      return readOk<DocClientsResponse>(response, "POST /api/docs/clients");
    },

    async prepareTour(scenarioId) {
      const response = await request(
        "/api/demo/tour/prepare",
        jsonPost({ scenarioId }),
      );
      if (response.status !== 200) return { ok: false, reason: "unknown" };
      return readAs<TourPrepareResponse>(response);
    },

    async writers(body) {
      const path = "/api/demo/writers";
      const response = await request(path, jsonPost(body));
      return readOk<WritersResponse>(response, `POST ${path}`);
    },

    async rebuild(docId) {
      const path = "/api/demo/rebuild";
      const response = await request(path, jsonPost({ docId }));
      await readOk(response, `POST ${path}`);
    },
  };
}

export function createServerControl(options: {
  fetch: typeof fetch;
  endpoint: ControlEndpoint;
}): ServerControl {
  // called as a plain function: a browser's fetch refuses another `this`
  const fetchFn = options.fetch;
  const { endpoint } = options;
  const send = (method: "GET" | "POST", path: string) =>
    fetchFn(`${endpoint.url}${path}`, {
      method,
      headers: bearer(endpoint.token),
    });
  const post = async (path: string) => {
    const response = await send("POST", path);
    if (!response.ok)
      throw new Error(`POST ${path} answered ${response.status}`);
  };
  /** The server's state the control answers with; unreachable when it answers nothing or anything else. */
  const stateOf = async (
    method: "GET" | "POST",
    path: string,
  ): Promise<ControlState> => {
    let response: Response;
    try {
      response = await send(method, path);
    } catch {
      // the control answers nothing: the demo is not running
      return "unreachable";
    }
    if (!response.ok) return "unreachable";
    const body = await readJson(response);
    const { isServerState } = await import("@manent/sync-protocol");
    return typeof body === "object" &&
      body !== null &&
      "server" in body &&
      isServerState(body.server)
      ? body.server
      : "unreachable";
  };

  return {
    status: () => stateOf("GET", "/status"),
    stop: () => post("/stop-server"),
    start: () => post("/start-server"),
    reset: () => stateOf("POST", "/reset"),
  };
}
