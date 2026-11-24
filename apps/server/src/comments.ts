// Comments: the open count of each round, told after every committed push to a comments document's threads or rounds.
import { NO_ROUND_COUNTS, createRoundCountHooks } from "@manent/server-core";
import type { ServerService } from "./services.ts";

export const commentsService: ServerService = {
  create: ({ roundCounts }) => ({
    hooks: [
      createRoundCountHooks({ roundCounts: roundCounts ?? NO_ROUND_COUNTS }),
    ],
    config: {},
  }),
};
