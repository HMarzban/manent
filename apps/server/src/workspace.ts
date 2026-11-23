import type { ServerService } from "./services.ts";

export const workspaceService: ServerService = {
  create: () => ({ hooks: [], config: {} }),
};
