// Comments: the open count of each round of a comments document the node is the authority of, which reaches nobody.
import { NO_ROUND_COUNTS, createRoundCountHooks } from "@manent/server-core";
import type { NodeService } from "../services.ts";

export const commentsService: NodeService = {
  create: () => ({
    hooks: [createRoundCountHooks({ roundCounts: NO_ROUND_COUNTS })],
    config: {},
  }),
};
