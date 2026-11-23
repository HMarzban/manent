// History and production: served here for a script the node is the authority of, sent on to the cloud otherwise.
import type { NodeService } from "../services.ts";
import { createNodeWorkflow } from "../workflow.ts";

export const workflowService: NodeService = {
  create(deps) {
    const { history, production, forward } = createNodeWorkflow(deps);
    return {
      hooks: [history, production.hooks],
      config: { history, production },
      forward,
    };
  },
};
