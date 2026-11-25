// The room's driver on the node, served here for a script the node holds alone. A synced script's driver is the
// cloud's: the workflow service, asked before this one, sends its requests on to the cloud.
import { answerDriverRequest, createDriverService } from "@manent/server-core";
import { readPerson } from "../../auth/people.ts";
import type { NodeService } from "../services.ts";

export const driverService: NodeService = {
  create(deps) {
    const driverRoom = createDriverService({
      storage: deps.storage,
      sync: deps.sync,
      now: deps.clock.now,
    });
    return {
      hooks: [driverRoom],
      config: {},
      forward: (request) =>
        answerDriverRequest(request, {
          service: driverRoom,
          user() {
            const person = readPerson(request, deps);
            return person === null ? null : deps.directory.user(person.userId);
          },
        }),
    };
  },
};
