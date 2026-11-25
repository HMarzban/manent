// Who has access to each document as this tab last heard it, so it is still listed offline, and the tokens of the
// links this tab made, the only place a link's token is kept.
import { createValue } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import type { ShareAccess } from "./share-requests.ts";

export interface MadeLink {
  token: string;
  /** The expiry it was made with, as the Expires list offers it. */
  expiresInMs: number | null;
}

export interface ShareHeld {
  /** Null until the server first answers. */
  access: Subscribable<ShareAccess | null> & {
    set(value: ShareAccess | null): void;
  };
  /** By link id. */
  made: Map<string, MadeLink>;
}

// by person and document, so one person never sees what another heard in this tab
const held = new Map<string, ShareHeld>();

export function shareHeld(userId: string, docId: string): ShareHeld {
  const key = `${userId} ${docId}`;
  const found = held.get(key);
  if (found !== undefined) return found;
  const made: ShareHeld = {
    access: createValue<ShareAccess | null>(null),
    made: new Map(),
  };
  held.set(key, made);
  return made;
}
