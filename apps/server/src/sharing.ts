import type { ServerService } from "./services.ts";

export const sharingService: ServerService = {
  create: () => ({ hooks: [], config: {} }),
};
