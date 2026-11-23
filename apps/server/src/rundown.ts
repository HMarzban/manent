import type { ServerService } from "./services.ts";

export const rundownService: ServerService = {
  create: () => ({ hooks: [], config: {} }),
};
