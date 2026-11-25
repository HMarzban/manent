// Lock for production, Unlock and End production: scene numbers written, every page recorded and the
// layout frozen at lock; the anchors emptied at unlock; the numbers cleared and the layout freed at the end.
import { scriptBody, scriptSettings } from "@manent/crdt";
import { resolveFollowed } from "@manent/settings";
import {
  BEFORE_END_NAME,
  BEFORE_UNLOCK_NAME,
  COLOUR_ORDERS,
  captureAnchors,
  lockNumbers,
} from "@manent/revisions";
import { blocksOf } from "@manent/schema";
import type {
  LockRequest,
  ProductionState,
  VersionContent,
} from "@manent/sync-protocol";
import { contentOfDoc } from "../history/content.ts";
import {
  commitLock,
  freezeSettings,
  lockRefusal,
  writeNumbers,
} from "./freeze.ts";
import type { LockCommit } from "./freeze.ts";
import type { Mutation, ProductionOptions, Requests } from "./requests.ts";
import {
  documentOf,
  engineVersionOf,
  layoutUnder,
  notLocked,
  scriptPages,
  stateAnswer,
} from "./state.ts";

export function lockMutation(
  options: ProductionOptions,
  requests: Requests,
  userId: string,
  request: LockRequest,
): Mutation<ProductionState> {
  const { docId, key } = request;
  let made: Pick<LockCommit, "records" | "numbers" | "engineVersion"> = {
    records: [],
    numbers: [],
    engineVersion: 0,
  };
  return {
    docId,
    key,
    need: "lock_page_numbers",
    tells: ["lock_anchors_changed", "layout_changed"],
    check: (file) => lockRefusal(file, request),
    edit(doc) {
      const stored = scriptSettings(doc).entries();
      const project = requests.projectSettings(docId);
      const effective = resolveFollowed(stored, project);
      const under = layoutUnder(effective, engineVersionOf(effective));
      if (!under.ok) return under;
      const { engine, profile } = under;
      const flat = blocksOf(scriptBody(doc).materialize());
      const numbers = lockNumbers(flat);
      const byId = new Map(numbers.map((n) => [n.blockId, n.num]));
      const { pagination } = scriptPages(flat, byId, profile, [], engine);
      made = {
        records: captureAnchors(pagination, "every_page", 1, "lock"),
        numbers,
        engineVersion: engine.version,
      };
      writeNumbers(doc, flat, numbers);
      freezeSettings(doc, request, { userId, setAt: options.now() }, project);
      return { ok: true };
    },
    commit(file, _at, pos) {
      const { numbering, colourOrder, lockedOn } = request;
      const order = COLOUR_ORDERS[colourOrder];
      const lock = { docId, userId, lockedOn, numbering, order, active: 1 };
      const { white } = commitLock(
        file,
        pos,
        { ...lock, ...made },
        { ...options, keep: requests.keep },
      );
      return [white];
    },
    ...stateAnswer(options, docId),
  };
}

export function unlockMutation(
  options: ProductionOptions,
  requests: Requests,
  userId: string,
  request: { docId: string; key: string },
): Mutation<ProductionState> {
  const { docId, key } = request;
  return {
    docId,
    key,
    need: "lock_page_numbers",
    tells: ["lock_anchors_changed"],
    check: (file) => notLocked(file, docId),
    edit: () => ({ ok: true }),
    commit(file, at, pos) {
      const before = requests.keep(
        file,
        {
          docId,
          userId,
          kind: "named",
          name: BEFORE_UNLOCK_NAME,
          at: { generation: at.generation, seq: at.before },
        },
        null,
      );
      file.production.replaceAnchors(docId, [], pos);
      return [before];
    },
    ...stateAnswer(options, docId),
  };
}

export function endMutation(
  options: ProductionOptions,
  requests: Requests,
  userId: string,
  request: { docId: string; key: string },
): Mutation<ProductionState> {
  const { docId, key } = request;
  const made: { before: VersionContent | null } = { before: null };
  return {
    docId,
    key,
    need: "lock_page_numbers",
    tells: ["lock_anchors_changed", "layout_changed"],
    check: (file) => notLocked(file, docId),
    edit(doc, file) {
      made.before = contentOfDoc(doc, documentOf(file, docId), {});
      const numbered = blocksOf(scriptBody(doc).materialize()).flatMap(
        ({ attrs }) =>
          attrs.num !== null && attrs.id !== null ? [attrs.id] : [],
      );
      scriptBody(doc).write((w) => {
        for (const id of numbered) w.setBlockAttrs(id, { num: null });
      });
      return { ok: true };
    },
    commit(file, at, pos) {
      const { production } = file;
      const before = requests.keep(
        file,
        {
          docId,
          userId,
          kind: "named",
          name: BEFORE_END_NAME,
          at: { generation: at.generation, seq: at.before },
        },
        made.before,
      );
      production.replaceAnchors(docId, [], pos);
      production.clearSceneNumbers(docId);
      const row = production.get(docId);
      if (row !== null) production.put({ ...row, endedAt: options.now() });
      production.setLocked(docId, false);
      return [before];
    },
    ...stateAnswer(options, docId),
  };
}
