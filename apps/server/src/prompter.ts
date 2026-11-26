// Prompter authority: manual and automatic sends, HTTP routes, external MOS bridge and the live prompter feed.
import {
  createHistoryService,
  createMosBridgeService,
  createPrompterService,
} from "@manent/server-core";
import type { ServerService } from "./services.ts";

export const prompterService: ServerService = {
  create({ storage, sync, clock, ids, history, airWindows }) {
    const prompter = createPrompterService({
      storage,
      sync,
      history: history ?? createHistoryService({ storage, sync, clock, ids }),
      clock,
      ids,
      ...(airWindows === undefined ? {} : { airWindows }),
    });
    const mos = createMosBridgeService({
      storage,
      sync,
      feed: prompter.feed,
      clock,
    });
    return {
      hooks: [prompter.hooks],
      config: { prompter, mos },
      prompterSubscribe: prompter.subscribePrompter,
    };
  },
};
