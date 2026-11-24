// The prompter service, which the server's configuration carries to its routes.
import type { Storage } from "@manent/storage";
import type {
  PrompterSendRequest,
  PrompterSendResponse,
} from "@manent/sync-protocol";
import type { HistoryService } from "../history/service.ts";
import { createAirWindows } from "../rundown/air-window.ts";
import type { AirWindows } from "../rundown/air-window.ts";
import type { Clock, SyncHooks, SyncService } from "../sync/ports.ts";
import { createAutoSender } from "./auto-send.ts";
import { createPrompterSender } from "./send.ts";
import type { PrompterOutcome, PrompterRefusal } from "./send.ts";
import { bindPrompterFeed, createPrompterFeedHub } from "./subscribe.ts";
import type { UpstreamPrompterFeed } from "./subscribe.ts";

export type { PrompterOutcome, PrompterRefusal };

export interface PrompterServiceOptions {
  storage: Storage;
  sync: () => SyncService;
  history: Pick<HistoryService, "keep">;
  clock: Clock;
  ids(): string;
  /** Air windows for rundowns and linked stories; when absent, a local instance is created. */
  airWindows?: Pick<AirWindows, "windowOf" | "isInside">;
  /** Optional upstream prompter feed for relayed rundowns in the local node. */
  upstreamFeed?: UpstreamPrompterFeed;
}

export interface PrompterService {
  readonly hooks: SyncHooks;
  /** Sends a rundown row's current story head to the prompter and keeps a `prompter` History version. */
  send(
    userId: string,
    request: PrompterSendRequest,
  ): Promise<PrompterOutcome<PrompterSendResponse>>;
  /** Restores the row's earlier send onto the prompter without creating a version or editing the script. */
  sendPrevious(
    userId: string,
    request: PrompterSendRequest,
  ): Promise<PrompterOutcome<PrompterSendResponse>>;
  /** Releases all prompter feed bindings and timers held by this service. */
  stop(): void;
}

/**
 * Creates the prompter service and binds the prompter subscribe handler for `options.clock`.
 * The caller attaches `service.hooks` to the sync service and places `service` on `ServerConfig.prompter`.
 */
export function createPrompterService(
  options: PrompterServiceOptions,
): PrompterService {
  const { storage, sync, history, clock, ids, upstreamFeed } = options;
  const ownedAirWindows =
    options.airWindows === undefined
      ? createAirWindows({ clock, storage })
      : null;
  const airWindows = options.airWindows ?? ownedAirWindows!;
  const feed = createPrompterFeedHub({
    storage,
    sync,
    clock,
    airWindows,
    upstreamFeed,
  });
  const unbindFeed = bindPrompterFeed(clock, feed);

  const autoSender = createAutoSender({
    storage,
    sync,
    clock,
    airWindows,
    feed,
    sender: () => sender,
  });
  const sender = createPrompterSender({
    storage,
    sync,
    history,
    clock,
    ids,
    airWindows,
    feed,
    cancelAutoSend: autoSender.cancelRow,
  });

  const hooks: SyncHooks = {
    committed(committed) {
      ownedAirWindows?.hooks.committed?.(committed);
      const { room, update } = committed;
      if (room.kind === "rundown") autoSender.onRundownCommitted(room, update);
      else if (room.kind === "script") autoSender.onStoryCommitted(room);
    },
    forgotten(room) {
      ownedAirWindows?.hooks.forgotten?.(room);
      autoSender.onForgotten(room);
    },
    subscribed(docId) {
      ownedAirWindows?.hooks.subscribed?.(docId);
      autoSender.onSubscribed(docId);
      return null;
    },
  };

  return {
    hooks,
    send: sender.send,
    sendPrevious: sender.sendPrevious,
    stop() {
      autoSender.stop();
      unbindFeed();
    },
  };
}
