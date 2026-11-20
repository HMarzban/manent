// A second person in the same tab, for tests and the benchmark only: their typing reaches the session as remote updates.
import {
  ORIGIN_REMOTE,
  encodeAwareness,
  loadDoc,
  scriptBody,
} from "@manent/crdt";
import { blocksOf } from "@manent/schema";
import type { LocalSession } from "./editor-sessions.ts";

export interface SimulatedWriter {
  type(block: number, offset: number, text: string): void;
  select(block: number, offset: number): void;
  leave(): void;
}

/**
 * A copy of the session's document under `clientId` that follows the session's changes. Blocks are counted in document
 * order and offsets in UTF-16 units; the awareness entries carry `person` as the server would stamp it.
 */
export function createSimulatedWriter(options: {
  session: LocalSession;
  person: { userId: string; name: string; colorIndex: number };
  clientId: number;
}): SimulatedWriter {
  const { session, person, clientId } = options;
  const doc = loadDoc(session.doc().encodeState(), { clientId });
  const stopFollowing = session.doc().subscribe((update, origin) => {
    // what this writer sent comes back from the session
    if (origin !== ORIGIN_REMOTE) doc.applyUpdate(update, ORIGIN_REMOTE);
  });
  const stopSending = doc.subscribe((update, origin) => {
    if (origin !== ORIGIN_REMOTE) session.receive(update);
  });
  let clock = 0;
  const announce = (state: Record<string, unknown> | null): void =>
    session.receiveAwareness(
      encodeAwareness([{ clientId, clock: ++clock, state }]),
    );
  const blockId = (block: number): string => {
    const id = blocksOf(scriptBody(doc).materialize())[block]?.attrs.id;
    if (typeof id !== "string")
      throw new RangeError(`the script has no block ${block}`);
    return id;
  };
  return {
    type(block, offset, text) {
      const id = blockId(block);
      scriptBody(doc).write((writer) => writer.insertText(id, offset, text));
    },
    select(block, offset) {
      const place = { blockId: blockId(block), offset };
      announce({
        user: person,
        cursor: { anchor: place, head: place, at: block },
      });
    },
    leave() {
      announce(null);
      stopFollowing();
      stopSending();
      doc.destroy();
    },
  };
}
