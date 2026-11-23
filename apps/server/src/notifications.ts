import type { ServerService } from "./services.ts";

export const notificationsService: ServerService = {
  create: () => ({ hooks: [], config: {} }),
};
