import { randomBytes } from "node:crypto";
import { createPublicApiService } from "@manent/server-core";
import type { ServerService } from "./services.ts";

export const publicApiService: ServerService = {
  create(deps) {
    const publicApi = createPublicApiService({
      storage: deps.storage,
      clock: deps.clock,
      ids: deps.ids,
      randomBytes: (length) => new Uint8Array(randomBytes(length)),
    });
    return { hooks: [], config: { publicApi } };
  },
};
