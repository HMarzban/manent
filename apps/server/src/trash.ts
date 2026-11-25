// Trash authority: Trash service, hourly sweep, and workspace/private index push rules.
import {
  createLibraryPushHooks,
  createTrashService,
} from "@manent/server-core";
import type { ServerService } from "./services.ts";

export const trashService: ServerService = {
  create({ storage, sync, clock, names }) {
    const trash = createTrashService({
      storage,
      sync,
      clock,
      names,
      scheduleSweep: true,
    });
    return {
      hooks: [createLibraryPushHooks({ storage })],
      config: { trash },
    };
  },
};
