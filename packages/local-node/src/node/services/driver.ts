import type { NodeService } from "../services.ts";

export const driverService: NodeService = {
  create: () => ({ hooks: [], config: {} }),
};
