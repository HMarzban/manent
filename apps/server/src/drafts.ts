import type { ServerService } from "./services.ts";

export const draftsService: ServerService = {
  create: () => ({ hooks: [], config: {} }),
};
