// Prompter on the desktop node: storage-backed authority for local rundowns, upstream prompter relay for synced ones.
import {
  createHistoryService,
  createPrompterService,
} from "@manent/server-core";
import { createPrompterControlHttpProxy } from "../../relay/prompter-control-relay.ts";
import { createPrompterRelay } from "../../relay/prompter-relay.ts";
import type { NodeService } from "../services.ts";

export const prompterService: NodeService = {
  create({
    storage,
    records,
    sessions,
    cloud,
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
    const forward = createPrompterControlHttpProxy({
      records,
      sessions,
      cloud,
      localPrompter: prompter,
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
      forward,
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
