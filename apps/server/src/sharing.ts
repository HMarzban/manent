// Sharing: who holds a role on each document, the groups given access to it and its share links.
import { randomBytes } from "node:crypto";
import { createDemoDirectory } from "@manent/demo";
import { createSharingService } from "@manent/server-core";
import type { ServerService } from "./services.ts";

/** A share link's token: 32 random bytes in base64url. */
const linkToken = (): string => randomBytes(32).toString("base64url");

export const sharingService: ServerService = {
  create({ storage, sync, clock, ids }) {
    const sharing = createSharingService({
      storage,
      // the people the server signs in, and the workspaces they belong to
      users: createDemoDirectory(),
      sync,
      clock,
      ids,
      tokens: linkToken,
      log: console.error,
    });
    return { hooks: [sharing], config: { sharing } };
  },
};
