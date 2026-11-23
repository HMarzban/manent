import type { NodeService } from "../services.ts";

export const projectService: NodeService = {
  create: () => ({ hooks: [], config: {} }),
};
