// The app's requests to the server and to the demo's server control.

import { isHttpErrorCode, isServerState } from "@manent/sync-protocol";
import type {
  ControlEndpoint,
  DemoResponse,
  HttpErrorCode,
  MeResponse,
  ServerState,
  SignInChoice,
  SignInOptions,
  SignInResponse,
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
}

export interface ServerControl {
  status(): Promise<ControlState>;
  stop(): Promise<void>;
  start(): Promise<void>;
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
  return isHttpErrorCode(body.error) ? body.error : null;
}

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
      if (!response.ok)
        throw new Error(`GET /api/sign-in answered ${response.status}`);
      return (await readAs<SignInOptions>(response)).choices;
    },

    async signIn(userId) {
      const response = await attempt("/api/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
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
      if (!response.ok)
        throw new Error(`GET /api/demo answered ${response.status}`);
      return readAs<DemoResponse>(response);
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

  return {
    async status() {
      let response: Response;
      try {
        response = await send("GET", "/status");
      } catch {
        // the control answers nothing: the demo is not running
        return "unreachable";
      }
      if (!response.ok) return "unreachable";
      const body = await readJson(response);
      return typeof body === "object" &&
        body !== null &&
        "server" in body &&
        isServerState(body.server)
        ? body.server
        : "unreachable";
    },
    stop: () => post("/stop-server"),
    start: () => post("/start-server"),
  };
}
