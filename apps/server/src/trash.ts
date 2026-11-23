import type { ServerService } from "./services.ts";

export const trashService: ServerService = {
  create: () => ({ hooks: [], config: {} }),
};
