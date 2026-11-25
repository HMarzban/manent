// Prompter on the desktop node: storage-backed authority for local rundowns, upstream prompter relay for synced ones.
import {
  createHistoryService,
  createPrompterService,
} from "@manent/server-core";
import { createPrompterRelay } from "../../relay/prompter-relay.ts";
import type { NodeService } from "../services.ts";

export const prompterService: NodeService = {
  create({
    storage,
    records,
    upstream,
    sync,
    clock,
    ids,
    history,
    airWindows,
  }) {
    const prompter = createPrompterService({
      storage,
      sync,
      history: history ?? createHistoryService({ storage, sync, clock, ids }),
      clock,
      ids,
      ...(airWindows === undefined ? {} : { airWindows }),
    });
    const relay = createPrompterRelay({
      storage,
      records,
      upstream,
      sync,
      clock,
      airWindowOf: airWindows?.windowOf ?? (() => null),
    });
    return {
      hooks: [prompter.hooks],
      config: {
        prompter: {
          ...prompter,
          stop() {
            relay.stop();
            prompter.stop();
          },
        },
      },
      prompterSubscribe(sub) {
        if (records.docState(sub.message.docId) !== null) {
          relay.subscribe(sub);
          return;
        }
        prompter.subscribePrompter(sub);
      },
    };
  },
};
