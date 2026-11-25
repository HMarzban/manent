// A headless prompter receiver: one dedicated prompter-mode subscription over a real socket.
import { browserClock, browserRandom, webTransport } from "@manent/client-web";
import type { SocketLike } from "@manent/client-web";
import {
  createMemoryStore,
  createSyncClient,
  soloLeader,
} from "@manent/sync-client";
import type { PrompterHandle } from "@manent/sync-client";
import { BOT_VERSIONS, NO_FRAMES } from "./bot-defaults.ts";
import { bunSocket } from "./bot.ts";

export interface PrompterBot {
  readonly userId: string;
  readonly prompter: PrompterHandle;
  close(): Promise<void>;
}

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
    versions: BOT_VERSIONS,
    minServer: BOT_VERSIONS,
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
