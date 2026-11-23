// History and production: the versions of every script, and its pages locked, issued and recalled.
import { createWorkflow } from "@manent/server-core";
import type { ServerService } from "./services.ts";

export const workflowService: ServerService = {
  create(deps) {
    const { history, production } = createWorkflow(deps);
    return {
      hooks: [history, production.hooks],
      config: { history, production },
    };
  },
};
