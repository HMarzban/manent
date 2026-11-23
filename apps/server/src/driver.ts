import type { ServerService } from "./services.ts";

export const driverService: ServerService = {
  create: () => ({ hooks: [], config: {} }),
};
