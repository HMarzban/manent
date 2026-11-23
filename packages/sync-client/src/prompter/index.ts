// A rundown's prompter feed: its run order, the stories last sent and the feed's state.
import type { BlockJSON } from "@manent/schema";
import type { PrompterRow } from "@manent/sync-protocol";
import type { SyncClient } from "../client/client.ts";
import { createSubscribable } from "../outbox/subscribable.ts";
import type { Subscribable, SyncClientPorts } from "../ports/ports.ts";

/** `lastReceivedAt`: when the last frame came, null before the first. */
export interface PrompterStatus {
  feed: "waiting" | "live" | "lost" | "refused";
  lastReceivedAt: number | null;
}

export interface PrompterHandle {
  readonly runOrder: Subscribable<readonly PrompterRow[]>;
  /** By story id, the blocks last sent of each story. */
  readonly stories: Subscribable<ReadonlyMap<string, readonly BlockJSON[]>>;
  readonly status: Subscribable<PrompterStatus>;
  close(): void;
}

/** A feed that is waiting and stays empty. */
export function createPrompterHandle(_options: {
  rundownId: string;
  client: SyncClient;
  ports: SyncClientPorts;
}): PrompterHandle {
  return {
    runOrder: createSubscribable<readonly PrompterRow[]>([]),
    stories: createSubscribable<ReadonlyMap<string, readonly BlockJSON[]>>(
      new Map(),
    ),
    status: createSubscribable<PrompterStatus>({
      feed: "waiting",
      lastReceivedAt: null,
    }),
    close() {},
  };
}
