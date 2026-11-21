import { expect, test } from "bun:test";
import {
  ORIGIN_LOAD,
  createDoc,
  loadDoc,
  revisedOverrides,
  scriptBody,
  scriptSettings,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { BlockJSON } from "@manent/schema";
import { encodeReplayUpdates } from "@manent/sync-protocol";
import type { Message } from "@manent/sync-protocol";
import type { FakePeer } from "../src/testing/index.ts";
import { DOC, HOME } from "./seed.ts";
import {
  EMPTY_VECTOR,
  clientOf,
  createServiceWorld,
  subscribe,
} from "./service-world.ts";

const KEY = "00112233445566778899aabbccddeeff";
const OVERRIDE = "s1:b2";
const CLEARED = "cleared@0a1b2c3d";
/** Any measured document is over budget. */
const FORCE = { rebuildClientIds: 0, checkpointEvery: 1 };

/** The one update `change` makes to `doc`. */
function capture(doc: CrdtDoc, change: () => void): Uint8Array {
  const made: Uint8Array[] = [];
  const stop = doc.subscribe((update) => made.push(update));
  change();
  stop();
  const [update] = made;
  if (made.length !== 1 || update === undefined)
    throw new RangeError(`a change must make one update, not ${made.length}`);
  return update;
}

function stepTwoOf(messages: readonly Message[]): Uint8Array {
  const found = messages.find(
    (message) => message.type === "SYNC" && message.step === "step2",
  );
  if (found?.type !== "SYNC") throw new RangeError("no step 2 was sent");
  return found.data;
}

/**
 * Dana has written one block of DOC in generation 1 and Sam has joined, so his copy is
 * acknowledged at the head; what Sam writes on that copy waits for the room's rebuild.
 */
function overridesWorld() {
  const world = createServiceWorld({ limits: FORCE });
  const { service, clock, storage, sam, dana } = world;
  const file = storage.open(HOME);
  const generation = (): number => file.log.get(DOC)?.generation ?? 0;
  const join = (peer: FakePeer): CrdtDoc => {
    service.receive(peer, subscribe(DOC, "edit", [clientOf(peer)]));
    service.receive(peer, {
      type: "SYNC",
      docId: DOC,
      generation: generation(),
      step: "step1",
      data: EMPTY_VECTOR,
    });
    return loadDoc(stepTwoOf(peer.take()), { clientId: clientOf(peer) });
  };
  const danaDoc = join(dana);
  const block: BlockJSON = {
    type: "block",
    attrs: { id: "b000000000000001", type: "action" },
    content: [{ type: "text", text: "Rain on the glass." }],
  };
  service.receive(dana, {
    type: "PUSH",
    docId: DOC,
    generation: generation(),
    clientSeq: 1,
    update: capture(danaDoc, () =>
      scriptBody(danaDoc).write((w) => w.insertBlocks(null, [block])),
    ),
    heal: false,
  });
  clock.runDeferred();
  const samDoc = join(sam);
  const acked = file.log.get(DOC)?.headSeq ?? 0;
  return {
    samDoc,
    /** The room goes quiet and is rebuilt; Sam replays the updates his device held. */
    async replayed(updates: readonly Uint8Array[]) {
      clock.advance(10_000);
      join(dana);
      const outcome = service.replay("sam", {
        docId: DOC,
        generation: 1,
        lastServerSeq: acked,
        key: KEY,
        updates: encodeReplayUpdates(updates),
      });
      clock.runDeferred();
      return outcome;
    },
    /** The overrides as the log of the current generation builds them. */
    roomOverrides(): [string, string][] {
      const doc = createDoc();
      for (const row of file.log.tail(DOC, generation(), 0).rows)
        doc.applyUpdate(row.update, ORIGIN_LOAD);
      return revisedOverrides(doc).entries();
    },
  };
}

test("a replay carries an override written offline", async () => {
  const world = overridesWorld();
  const { samDoc } = world;
  const offline = capture(samDoc, () =>
    revisedOverrides(samDoc).set(OVERRIDE, CLEARED, "typing"),
  );
  expect(await world.replayed([offline])).toEqual({
    ok: true,
    response: {
      docId: DOC,
      generation: 2,
      serverSeq: 2,
      applied: 0,
      overlaps: [],
      setAside: [],
    },
  });
  expect(world.roomOverrides()).toEqual([[OVERRIDE, CLEARED]]);
});

test("a replay never writes the settings maps", async () => {
  const world = overridesWorld();
  const { samDoc } = world;
  const override = capture(samDoc, () =>
    revisedOverrides(samDoc).set(OVERRIDE, "marked", "typing"),
  );
  const setting = capture(samDoc, () =>
    scriptSettings(samDoc).set("script.paper", "a4", {
      userId: "sam",
      setAt: 1_000,
      replaced: null,
    }),
  );
  expect(await world.replayed([override, setting])).toEqual({
    ok: false,
    code: "invalid",
  });
  expect(world.roomOverrides()).toEqual([]);
});
