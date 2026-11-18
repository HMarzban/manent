// The configuration every test of this package serves, changed only where a test says.
import { createSignedSessionStore, createTicketStore } from "../src/index.ts";
import type { ServerConfig } from "../src/index.ts";
import { createFakeDirectory, createFakeSignIn } from "../src/testing/index.ts";

export const CONTROL = { url: "http://127.0.0.1:4748", token: "t0ken" };
const LEO = { userId: "leo", name: "Leo Marsh" };
const ANA = { userId: "ana", name: "Ana Costa" };
const ROOM = { id: "medium", name: "Writers' room", seeding: null };
export const HTTP: ServerConfig["http"] = {
  allowedHosts: ["localhost:4747", "127.0.0.1:4747", "192.168.1.20:4747"],
  openUrl: "http://192.168.1.20:4747",
  webDir: null,
};

export function makeConfig(
  overrides: Partial<ServerConfig> = {},
): ServerConfig {
  const v = { protocol: 1, schema: 1, engine: 0, table: 0 };
  return {
    http: HTTP,
    auth: {
      signIn: createFakeSignIn([LEO, ANA]),
      directory: createFakeDirectory([
        { user: LEO, workspaces: [ROOM] },
        { user: ANA, workspaces: [] },
      ]),
      sessions: createSignedSessionStore({
        secret: new Uint8Array(32).fill(3),
        now: () => 1_700_000_000_000,
      }),
    },
    demo: { seedId: () => "s1", control: CONTROL },
    socket: {
      tickets: createTicketStore({ now: () => 0 }),
      versions: { current: v, min: v },
      allowedOrigins: ["http://127.0.0.1:4747"],
    },
    sync: null,
    ...overrides,
  };
}
