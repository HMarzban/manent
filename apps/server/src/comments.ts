import type { ServerService } from "./services.ts";

export const commentsService: ServerService = {
  create: () => ({ hooks: [], config: {} }),
};
