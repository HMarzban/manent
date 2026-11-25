// A headless prompter receiver: one dedicated prompter-mode subscription over a real socket.
import { browserClock, browserRandom, webTransport } from "@manent/client-web";
import type { SocketLike } from "@manent/client-web";
import { ENGINE_VERSIONS, TABLE_VERSION } from "@manent/pagination";
import { SCHEMA_VERSION } from "@manent/schema";
import {
  createMemoryStore,
  createSyncClient,
  soloLeader,
} from "@manent/sync-client";
import type { Frames, PrompterHandle } from "@manent/sync-client";
import { PROTOCOL_VERSION } from "@manent/sync-protocol";
import { bunSocket } from "./bot.ts";

export interface PrompterBot {
  readonly userId: string;
  readonly prompter: PrompterHandle;
  close(): Promise<void>;
}

const VERSIONS = {
  protocol: PROTOCOL_VERSION,
  schema: SCHEMA_VERSION,
  engine: ENGINE_VERSIONS.at(-1)!,
  table: TABLE_VERSION,
};

const NO_FRAMES: Frames = { request: () => () => {} };

/** Subscribes to `rundownId` in `prompter` mode over `options.socket` (or `bunSocket`). */
export function createPrompterBot(options: {
  server: { url: string };
  userId: string;
  token: string;
  rundownId: string;
  socket?: (url: string) => SocketLike;
}): PrompterBot {
  const { userId, token, rundownId } = options;
  const baseUrl = options.server.url;
  const deviceId = browserRandom.bytes(8).toHex();
  const openSocket =
    options.socket ?? ((url: string) => bunSocket(url, baseUrl));
  const client = createSyncClient({
    userId,
    deviceId,
    build: "testkit",
    versions: VERSIONS,
    minServer: VERSIONS,
    ports: {
      transport: webTransport({
        baseUrl,
        session: () => token,
        socket: openSocket,
      }),
      store: createMemoryStore(userId),
      leader: soloLeader(deviceId),
      clock: browserClock,
      random: browserRandom,
      frames: NO_FRAMES,
    },
  });
  // PrompterHandle opens its own dedicated connection; keep the main link offline to avoid a spare socket.
  client.setOnline(false);
  const prompter = client.prompter(rundownId);

  return {
    userId,
    prompter,
    async close() {
      prompter.close();
      await client.close();
    },
  };
}
