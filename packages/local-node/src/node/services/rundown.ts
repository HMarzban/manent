import type { NodeService } from "../services.ts";

export const rundownService: NodeService = {
  create: () => ({ hooks: [], config: {} }),
};
