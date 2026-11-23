import type { ServerService } from "./services.ts";

export const projectService: ServerService = {
  create: () => ({ hooks: [], config: {} }),
};
