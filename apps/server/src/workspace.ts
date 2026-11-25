// Workspace administration service and project can_also push hooks.
import { createDemoDirectory } from "@manent/demo";
import {
  createCanAlsoHooks,
  createWorkspaceService,
} from "@manent/server-core";
import type { ServerService } from "./services.ts";

export const workspaceService: ServerService = {
  create({ storage, sync }) {
    const workspace = createWorkspaceService({
      storage,
      users: createDemoDirectory(),
      sync,
    });
    return { hooks: [createCanAlsoHooks()], config: { workspace } };
  },
};
