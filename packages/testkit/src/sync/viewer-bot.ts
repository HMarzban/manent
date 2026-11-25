// A headless viewer: the real sync client over a real socket, reading one document in view mode.
import { browserClock, browserRandom, webTransport } from "@manent/client-web";
import type { SocketLike } from "@manent/client-web";
import {
  createMemoryStore,
  createSyncClient,
  soloLeader,
} from "@manent/sync-client";
import type { ViewHandle } from "@manent/sync-client";
import { BOT_VERSIONS, NO_FRAMES } from "./bot-defaults.ts";
import { bunSocket } from "./bot.ts";

export interface ViewerBot {
  readonly userId: string;
  readonly view: ViewHandle;
  close(): Promise<void>;
}

/** Subscribes to `docId` in `view` mode over `options.socket` (or `bunSocket`). */
export function createViewerBot(options: {
  server: { url: string };
  userId: string;
  token: string;
  docId: string;
  socket?: (url: string) => SocketLike;
}): ViewerBot {
  const { userId, token, docId } = options;
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
  const view = client.view(docId);

  return {
    userId,
    view,
    async close() {
      view.close();
      await client.close();
    },
  };
}
