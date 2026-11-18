// The configuration every test of this package serves, changed only where a test says.
import { createSignedSessionStore, createTicketStore } from "../src/index.ts";
import type { ServerConfig, SyncSettings } from "../src/index.ts";
import {
  createFakeDirectory,
  createFakeSignIn,
  fakeClock,
} from "../src/testing/index.ts";

export const CONTROL = { url: "http://127.0.0.1:4748", token: "t0ken" };
const LEO = { userId: "leo", name: "Leo Marsh" };
const ANA = { userId: "ana", name: "Ana Costa" };
const ROOM = { id: "medium", name: "Writers' room", seeding: null };
export const HTTP: ServerConfig["http"] = {
  allowedHosts: ["localhost:4747", "127.0.0.1:4747", "192.168.1.20:4747"],
  openUrl: "http://192.168.1.20:4747",
  webDir: null,
};

/**
 * `sync` may give only the storage: the clock and the deferral are then a fake clock's (which a
 * test that moves time passes itself), and version ids count up from 1.
 */
export function makeConfig(
  overrides: Partial<Omit<ServerConfig, "sync">> & {
    sync?: (Partial<SyncSettings> & Pick<SyncSettings, "storage">) | null;
  } = {},
): ServerConfig {
  const { sync = null, ...rest } = overrides;
  const time = fakeClock();
  let versionIds = 0;
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
    ...rest,
    sync:
      sync === null
        ? null
        : {
            clock: time.clock,
            defer: time.defer,
            ids: () => `version-${++versionIds}`,
            ...sync,
          },
  };
}
