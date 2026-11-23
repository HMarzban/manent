import type { ServerService } from "./services.ts";

export const privateCopyService: ServerService = {
  create: () => ({ hooks: [], config: {} }),
};
