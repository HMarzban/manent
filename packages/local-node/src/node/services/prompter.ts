import type { NodeService } from "../services.ts";

export const prompterService: NodeService = {
  create: () => ({ hooks: [], config: {} }),
};
