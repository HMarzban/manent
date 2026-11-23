// Private copies: a writer's copy of a script, held here until it is handed in to the room.
import { createPrivateCopyService } from "@manent/server-core";
import type { ServerService } from "./services.ts";

export const privateCopyService: ServerService = {
  create: ({ storage, sync, clock, ids }) => ({
    hooks: [],
    config: {
      privateCopy: createPrivateCopyService({ storage, sync, clock, ids }),
    },
  }),
};
