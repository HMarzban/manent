import type { NodeService } from "../node/services.ts";

export const prompterFilesService: NodeService = {
  create: () => ({ hooks: [], config: {} }),
};
