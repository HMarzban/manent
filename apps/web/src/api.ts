// The app's requests to the server and to the demo's server control.

import type { TabPerson } from "./session.ts";
import type { ServerState } from "./text.ts";

export interface DemoPerson {
  id: string;
  name: string;
  role: string;
}

export interface DemoInfo {
  seedId: string | null;
  control: { url: string; token: string } | null;
}

export type SignInResult =
  | { status: "ok"; person: TabPerson }
  | { status: "unknown_person" | "unreachable" };

export type MeResult =
  | { status: "ok"; userId: string; name: string }
  | { status: "unauthenticated" | "unreachable" };

export type Api = ReturnType<typeof createApi>;
export type ServerControl = ReturnType<typeof createServerControl>;

function bearer(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function createApi(
  fetchFn: typeof fetch,
  getToken: () => string | null,
) {
  const request = (path: string, init: RequestInit = {}) =>
    fetchFn(path, {
      ...init,
      headers: { ...bearer(getToken()), ...init.headers },
    });

  return {
    async people(): Promise<DemoPerson[]> {
      const response = await request("/api/sign-in");
      if (!response.ok)
        throw new Error(`GET /api/sign-in answered ${response.status}`);
      const body = (await response.json()) as { people: DemoPerson[] };
      return body.people;
    },

    async signIn(personId: string): Promise<SignInResult> {
      try {
        const response = await request("/api/sign-in", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ personId }),
        });
        if (response.status === 404) return { status: "unknown_person" };
        if (!response.ok) return { status: "unreachable" };
        const body = (await response.json()) as {
          session: string;
          person: { userId: string; name: string };
        };
        return {
          status: "ok",
          person: {
            token: body.session,
            userId: body.person.userId,
            name: body.person.name,
          },
        };
      } catch {
        return { status: "unreachable" };
      }
    },

    async me(): Promise<MeResult> {
      try {
        const response = await request("/api/me");
        if (response.status === 401) return { status: "unauthenticated" };
        if (!response.ok) return { status: "unreachable" };
        const body = (await response.json()) as {
          userId: string;
          name: string;
        };
        return { status: "ok", userId: body.userId, name: body.name };
      } catch {
        return { status: "unreachable" };
      }
    },

    /** null when the server is not in demo mode; throws when it cannot tell. */
    async demo(): Promise<DemoInfo | null> {
      const response = await request("/api/demo");
      if (response.status === 404) return null;
      if (!response.ok)
        throw new Error(`GET /api/demo answered ${response.status}`);
      const body = (await response.json()) as DemoInfo;
      return { seedId: body.seedId, control: body.control };
    },
  };
}

const SERVER_STATES: readonly string[] = [
  "running",
  "stopped",
  "starting",
  "failed",
];

export function createServerControl(
  fetchFn: typeof fetch,
  control: { url: string; token: string },
) {
  const send = async (method: "GET" | "POST", path: string) => {
    const response = await fetchFn(`${control.url}${path}`, {
      method,
      headers: bearer(control.token),
    });
    if (!response.ok)
      throw new Error(`${method} ${path} answered ${response.status}`);
    return response;
  };

  return {
    async status(): Promise<ServerState> {
      try {
        const body = (await (await send("GET", "/status")).json()) as unknown;
        const server =
          typeof body === "object" && body !== null && !Array.isArray(body)
            ? (body as { server?: unknown }).server
            : undefined;
        return typeof server === "string" && SERVER_STATES.includes(server)
          ? (server as ServerState)
          : "unreachable";
      } catch {
        return "unreachable";
      }
    },
    async stop(): Promise<void> {
      await send("POST", "/stop-server");
    },
    async start(): Promise<void> {
      await send("POST", "/start-server");
    },
  };
}
