// A simulated world whose services keep a history: drafts named and versions restored through it,
// each answered while the world runs.
import type { RestoreScope } from "@manent/revisions";
import { createHistoryService } from "@manent/server-core";
import type { HistoryOutcome, HistoryService } from "@manent/server-core";
import type { DocJSON } from "@manent/schema";
import { createWorld } from "../src/index.ts";
import type { World } from "../src/index.ts";

export interface HistoryWorld extends World {
  readonly history: HistoryService;
}

/** Settles needed at most for one request to be answered. */
const MAX_SETTLES = 10;

let made = 0;
/** A request key no other request of any world has used. */
function freshKey(): string {
  made += 1;
  return made.toString(16).padStart(32, "0");
}

/** A world of `users` whose every service is told and asked by one history service. */
export async function historyWorld(
  seed: number,
  options: {
    users?: readonly string[];
    devicesPerUser?: number;
    faults?: { duplicate?: number };
  } = {},
): Promise<HistoryWorld> {
  let versions = 0;
  const ids = (): string => `history-${++versions}`;
  let history: HistoryService | null = null;
  const world = await createWorld({
    seed,
    users: options.users ?? ["dana", "sam", "priya"],
    devicesPerUser: options.devicesPerUser,
    faults: options.faults,
    hooks({ service, storage, clock }) {
      history = createHistoryService({
        sync: service,
        storage,
        clock: clock.clock,
        ids,
      });
      return [history];
    },
  });
  if (history === null) throw new RangeError("the world made no history");
  return Object.assign(world, { history });
}

/** The value `answer` settles with once the world has run far enough to answer it; throws on a refusal. */
export async function answered<T>(
  w: World,
  answer: Promise<HistoryOutcome<T>>,
): Promise<T> {
  const state: { outcome: HistoryOutcome<T> | null; error: unknown } = {
    outcome: null,
    error: null,
  };
  void answer.then(
    (outcome) => {
      state.outcome = outcome;
    },
    (error: unknown) => {
      state.error = error;
    },
  );
  for (let i = 0; i < MAX_SETTLES; i++) {
    if (state.outcome !== null || state.error !== null) break;
    await w.settle();
  }
  const { outcome, error } = state;
  if (error !== null) throw error;
  if (outcome === null) throw new RangeError(`seed ${w.seed}: no answer`);
  if (!outcome.ok) throw new RangeError(`seed ${w.seed}: ${outcome.code}`);
  return outcome.value;
}

/** Working named as a draft by `userId`; its version id. */
export async function nameDraft(
  w: HistoryWorld,
  userId: string,
  name: string,
): Promise<string> {
  const body = { docId: w.docId, key: freshKey(), name, fromVersionId: null };
  const { version } = await answered(w, w.history.name(userId, body));
  return version.id;
}

/** The request of a restore by `userId`, answered with its Before restore version's id; the world is not run. */
export async function requestRestore(
  w: HistoryWorld,
  userId: string,
  versionId: string,
  scope: RestoreScope,
): Promise<HistoryOutcome<string>> {
  const body = { docId: w.docId, key: freshKey(), versionId, scope };
  const outcome = await w.history.restore(userId, body);
  return outcome.ok
    ? { ok: true, value: outcome.value.beforeVersionId }
    : outcome;
}

/** A restore by `userId` on the server once every write sent before it has arrived; its Before restore version's id. */
export async function restoreAs(
  w: HistoryWorld,
  userId: string,
  versionId: string,
  scope: RestoreScope,
): Promise<string> {
  await w.settle();
  return answered(w, requestRestore(w, userId, versionId, scope));
}

/** The version's blocks as a document, read by `userId`. */
export async function contentOf(
  w: HistoryWorld,
  userId: string,
  versionId: string,
): Promise<DocJSON> {
  const read = w.history.content(userId, w.docId, { versionId });
  const { content } = await answered(w, read);
  return {
    type: "doc",
    content: [{ type: "section", content: content.blocks }],
  };
}
