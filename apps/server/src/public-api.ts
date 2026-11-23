import type { ServerService } from "./services.ts";

export const publicApiService: ServerService = {
  create: () => ({ hooks: [], config: {} }),
};
