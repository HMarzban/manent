import type { ServerService } from "./services.ts";

export const prompterService: ServerService = {
  create: () => ({ hooks: [], config: {} }),
};
