// The room's driver: who drives a script presented to the room, as this server sequences it.
import { createDriverService } from "@manent/server-core";
import type { ServerService } from "./services.ts";

export const driverService: ServerService = {
  create(deps) {
    const driverRoom = createDriverService({
      storage: deps.storage,
      sync: deps.sync,
      now: deps.clock.now,
    });
    return { hooks: [driverRoom], config: { driver: driverRoom } };
  },
};
