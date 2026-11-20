// The node's records in memory, for tests: the SQLite driver's behaviour, a step that crashes, and snapshots.
import type { RecoveredItem } from "@manent/sync-client";
import type {
  Handoff,
  NodeDocState,
  NodeRecords,
  Person,
} from "../records/ports.ts";

interface State {
  secret: Uint8Array | null;
  people: Map<string, Person>;
  current: { userId: string; nodeToken: string } | null;
  docs: Map<
    string,
    { userId: string; state: NodeDocState; generation: number }
  >;
  handoffs: Map<string, Handoff>;
  recovered: Map<string, RecoveredItem[]>;
  seedId: string | null;
}

/** Replaced whole by `restore`, so every method reads `held.state` when it runs. */
interface Held {
  state: State;
}

type CrashStep = "finishHandoff" | "startHandoff";

const emptyState = (): State => ({
  secret: null,
  people: new Map(),
  current: null,
  docs: new Map(),
  handoffs: new Map(),
  recovered: new Map(),
  seedId: null,
});

const copyHandoff = (handoff: Handoff): Handoff => ({
  ...handoff,
  snapshot: new Uint8Array(handoff.snapshot),
});

const byKey = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// What each snapshot holds; a snapshot is an opaque token, so a test cannot restore a state it built by hand.
const snapshots = new WeakMap<object, State>();

function peopleRecords(
  held: Held,
): Pick<
  NodeRecords,
  | "secret"
  | "person"
  | "savePerson"
  | "people"
  | "current"
  | "setCurrent"
  | "seedId"
  | "setSeedId"
> {
  return {
    secret() {
      held.state.secret ??= Uint8Array.from({ length: 32 }, (_, i) => i + 1);
      return new Uint8Array(held.state.secret);
    },
    person(userId) {
      const person = held.state.people.get(userId);
      return person === undefined ? null : { ...person };
    },
    savePerson(person) {
      held.state.people.set(person.userId, { ...person });
    },
    people: () =>
      [...held.state.people.values()]
        .toSorted((a, b) => byKey(a.userId, b.userId))
        .map((person) => ({ ...person })),
    current: () =>
      held.state.current === null ? null : { ...held.state.current },
    setCurrent(userId, nodeToken) {
      held.state.current = { userId, nodeToken };
    },
    seedId: () => held.state.seedId,
    setSeedId(seedId) {
      held.state.seedId = seedId;
    },
  };
}

function docRecords(
  held: Held,
): Pick<
  NodeRecords,
  | "docState"
  | "setDocState"
  | "removeDoc"
  | "docsOf"
  | "addRecovered"
  | "recovered"
> {
  return {
    docState(docId) {
      const doc = held.state.docs.get(docId);
      return doc === undefined ? null : { ...doc };
    },
    setDocState(docId, userId, state, generation) {
      held.state.docs.set(docId, { userId, state, generation });
    },
    removeDoc(docId) {
      held.state.docs.delete(docId);
    },
    docsOf: (userId) =>
      [...held.state.docs.entries()]
        .filter(([, doc]) => doc.userId === userId)
        .map(([docId, doc]) => ({ docId, state: doc.state }))
        .toSorted((a, b) => byKey(a.docId, b.docId)),
    // As in the SQLite file: an item keeps no id and no wording, and is numbered within its document.
    addRecovered(docId, _userId, items) {
      const kept = held.state.recovered.get(docId) ?? [];
      const added = items.map((item, i) => ({
        ...item,
        id: `${docId}:${kept.length + i + 1}`,
        docId,
        mine: null,
        theirs: null,
        otherClientIds: [],
      }));
      held.state.recovered.set(docId, [...kept, ...added]);
    },
    recovered: (docId) =>
      structuredClone(held.state.recovered.get(docId) ?? []),
  };
}

function handoffRecords(
  held: Held,
  crashOn: CrashStep | null,
): Pick<
  NodeRecords,
  "handoff" | "startHandoff" | "refuseHandoff" | "finishHandoff"
> {
  const crash = (step: CrashStep): void => {
    if (crashOn === step) throw new Error(`crashed in ${step}`);
  };
  return {
    handoff(docId) {
      const handoff = held.state.handoffs.get(docId);
      return handoff === undefined ? null : copyHandoff(handoff);
    },
    startHandoff(handoff) {
      crash("startHandoff");
      if (!held.state.handoffs.has(handoff.docId))
        held.state.handoffs.set(handoff.docId, copyHandoff(handoff));
    },
    refuseHandoff(docId, reason) {
      const handoff = held.state.handoffs.get(docId);
      if (handoff !== undefined)
        held.state.handoffs.set(docId, { ...handoff, refused: reason });
      held.state.docs.delete(docId);
    },
    finishHandoff(docId, generation) {
      crash("finishHandoff");
      held.state.handoffs.delete(docId);
      const doc = held.state.docs.get(docId);
      if (doc !== undefined)
        held.state.docs.set(docId, { ...doc, state: "synced", generation });
    },
  };
}

/**
 * Records as `openSqliteRecords` keeps them. With `crashOn`, that step throws every time without writing
 * anything, as a process killed before its transaction committed. `restore` takes only what `snapshot` gave,
 * and throws a TypeError for anything else.
 */
export function createMemoryRecords(options?: {
  crashOn?: CrashStep;
}): NodeRecords & { snapshot(): unknown; restore(s: unknown): void } {
  const held: Held = { state: emptyState() };
  return {
    ...peopleRecords(held),
    ...docRecords(held),
    ...handoffRecords(held, options?.crashOn ?? null),
    close() {},
    snapshot() {
      const token = Object.freeze({});
      snapshots.set(token, structuredClone(held.state));
      return token;
    },
    restore(s) {
      const kept =
        typeof s === "object" && s !== null ? snapshots.get(s) : undefined;
      if (kept === undefined)
        throw new TypeError("only a snapshot of these records can be restored");
      held.state = structuredClone(kept);
    },
  };
}
