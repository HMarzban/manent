// Prompter authority: manual and automatic sends, HTTP routes and the live prompter feed.
import {
  createHistoryService,
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
    return {
      hooks: [prompter.hooks],
      config: { prompter },
      prompterSubscribe: prompter.subscribePrompter,
    };
  },
};
