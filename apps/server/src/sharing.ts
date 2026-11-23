// Sharing: who holds a role on each document, the groups given access to it and its share links.
import { randomBytes } from "node:crypto";
import { createSharingService } from "@manent/server-core";
import type { ServerService } from "./services.ts";

/** A share link's token: 32 random bytes in base64url. */
const linkToken = (): string => randomBytes(32).toString("base64url");

export const sharingService: ServerService = {
  create({ storage, sync, clock, ids }) {
    const sharing = createSharingService({
      storage,
      sync,
      now: clock.now,
      ids,
      tokens: linkToken,
    });
    return { hooks: [sharing], config: { sharing } };
  },
};
