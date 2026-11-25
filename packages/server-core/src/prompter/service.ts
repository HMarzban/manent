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
import type { SubscribeHandler } from "../sync/subscribe.ts";
import { createAutoSender } from "./auto-send.ts";
import { createPrompterControl } from "./control.ts";
import type {
  PrompterControlOutcome,
  PrompterControlService,
  PrompterControlStatus,
} from "./control.ts";
import { createPrompterSender } from "./send.ts";
import type { PrompterOutcome, PrompterRefusal } from "./send.ts";
import { createPrompterFeedHub } from "./subscribe.ts";
import type { PrompterFeedHub, UpstreamPrompterFeed } from "./subscribe.ts";

export type {
  PrompterControlOutcome,
  PrompterControlService,
  PrompterControlStatus,
  PrompterOutcome,
  PrompterRefusal,
};

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
  /** Per-service handler for `SUBSCRIBE` in prompter mode, passed into `SyncSettings.prompterSubscribe`. */
  readonly subscribePrompter: SubscribeHandler;
  /** Live prompter feed hub for subscribers, control fanout and in-process listeners (MOS bridge). */
  readonly feed: PrompterFeedHub;
  /** Server-held remote prompter operator lease and scroll control service. */
  readonly control: PrompterControlService;
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
  /** Releases all prompter feed timers, operator lease timers and automatic-send timers held by this service. */
  stop(): void;
}

/**
 * Creates the prompter service with its own isolated feed hub and remote scroll control state.
 * The caller attaches `service.hooks` and `service.subscribePrompter` to the sync service
 * and places `service` on `ServerConfig.prompter`.
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
  let control!: PrompterControlService;
  const feed = createPrompterFeedHub({
    storage,
    sync,
    clock,
    airWindows,
    upstreamFeed,
    onPrompterSubscribed: (docId, tell, meta) =>
      control.sendSnapshotTo(docId, tell, meta),
  });
  control = createPrompterControl({ storage, sync, clock, feed });

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
    editorLeft(room, userId) {
      if (room.kind === "rundown") control.onEditorLeft(room, userId);
    },
    forgotten(room) {
      ownedAirWindows?.hooks.forgotten?.(room);
      autoSender.onForgotten(room);
      if (room.kind === "rundown") control.onForgotten(room);
    },
    subscribed(docId) {
      ownedAirWindows?.hooks.subscribed?.(docId);
      autoSender.onSubscribed(docId);
      return null;
    },
  };

  return {
    hooks,
    subscribePrompter: (sub) => feed.subscribe(sub),
    feed,
    control,
    send: sender.send,
    sendPrevious: sender.sendPrevious,
    stop() {
      control.stop();
      autoSender.stop();
      feed.stop();
    },
  };
}
