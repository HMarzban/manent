import type { ServerService } from "./services.ts";

export const searchService: ServerService = {
  create: () => ({ hooks: [], config: {} }),
};
