// Lock for production, Unlock and End production: scene numbers written, every page recorded and the
// layout frozen at lock; the anchors emptied at unlock; the numbers cleared and the layout freed at the end.
import { scriptBody, scriptSettings } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { LockAnchorRecord } from "@manent/pagination";
import {
  BEFORE_END_NAME,
  BEFORE_UNLOCK_NAME,
  COLOUR_ORDERS,
  DEFAULT_MARK,
  WHITE_DRAFT_NAME,
  captureAnchors,
  lockNumbers,
  revisionColour,
  revisionName,
} from "@manent/revisions";
import type { RevisionColour } from "@manent/revisions";
import { blocksOf } from "@manent/schema";
import { SETTINGS } from "@manent/settings";
import type {
  LockRequest,
  ProductionState,
  VersionContent,
} from "@manent/sync-protocol";
import { contentOfDoc } from "../history/content.ts";
import { refused } from "./outcome.ts";
import { isDay } from "./requests.ts";
import type { Mutation, ProductionOptions, Requests } from "./requests.ts";
import {
  documentOf,
  layoutUnder,
  notLocked,
  rowsOf,
  scriptPages,
  stateAnswer,
} from "./state.ts";

/** Every script setting the lock freezes, at its value now or its default, with the request's two. */
function freezeSettings(
  doc: CrdtDoc,
  request: LockRequest,
  meta: { userId: string; setAt: number },
): void {
  const settings = scriptSettings(doc);
  const stored = settings.entries();
  const frozen = SETTINGS.all
    .filter((d) => d.scope === "script" && d.guard === "layout")
    .map((d): [string, unknown] => {
      const value = stored[d.key];
      return [d.key, d.type.parse(value).ok ? value : d.default];
    });
  frozen.push(
    ["script.numbering", request.numbering],
    ["script.colourOrder", request.colourOrder],
  );
  for (const [key, value] of frozen)
    if (stored[key] !== value)
      settings.set(key, value, { ...meta, replaced: stored[key] ?? null });
}

export function lockMutation(
  options: ProductionOptions,
  requests: Requests,
  userId: string,
  request: LockRequest,
): Mutation<ProductionState> {
  const { docId, key } = request;
  const made: {
    records: LockAnchorRecord[];
    numbers: { blockId: string; num: string }[];
    engineVersion: number;
  } = { records: [], numbers: [], engineVersion: 0 };
  return {
    docId,
    key,
    need: "lock_page_numbers",
    tells: ["lock_anchors_changed", "layout_changed"],
    check(file) {
      if (!isDay(request.lockedOn)) return refused("bad_request");
      // a script is locked once: End keeps its sets, whose ordinals name their colours
      return file.production.get(docId) === null
        ? null
        : refused("already_locked");
    },
    edit(doc, file) {
      const { engineVersion } = documentOf(file, docId);
      const under = layoutUnder(scriptSettings(doc).entries(), engineVersion);
      if (!under.ok) return under;
      const { engine, profile } = under;
      made.engineVersion = engine.version;
      const flat = blocksOf(scriptBody(doc).materialize());
      made.numbers = lockNumbers(flat);
      const numbers = new Map(made.numbers.map((n) => [n.blockId, n.num]));
      const { pagination } = scriptPages(flat, numbers, profile, [], engine);
      made.records = captureAnchors(pagination, "every_page", 1, "lock");
      const held = new Map(flat.map((b) => [b.attrs.id, b.attrs.num]));
      scriptBody(doc).write((w) => {
        for (const { blockId, num } of made.numbers)
          if (held.get(blockId) !== num) w.setBlockAttrs(blockId, { num });
      });
      freezeSettings(doc, request, { userId, setAt: options.now() });
      return { ok: true };
    },
    commit(file, _at, pos) {
      const { production } = file;
      const now = options.now();
      const order: readonly RevisionColour[] =
        COLOUR_ORDERS[request.colourOrder];
      production.put({
        docId,
        numbering: request.numbering,
        colourOrder: [...order],
        lockedAt: now,
        lockedOn: request.lockedOn,
        lockedByUserId: userId,
        endedAt: null,
      });
      production.replaceAnchors(docId, rowsOf(made.records), pos);
      production.putSceneNumbers(
        docId,
        made.numbers.map((n) => ({ ...n, reserved: false })),
      );
      const white = requests.keep(
        file,
        {
          docId,
          userId,
          kind: "named",
          name: WHITE_DRAFT_NAME,
          at: pos,
        },
        null,
      );
      const set = (ordinal: number) => ({
        id: options.ids(),
        docId,
        ordinal,
        name: revisionName(order, ordinal),
        colour: revisionColour(order, ordinal),
        mark: DEFAULT_MARK,
        baselineVersionId: white.id,
        recalledAt: null,
        fullDraft: false,
        startedAt: now,
        engineVersion: made.engineVersion,
      });
      production.addSet({
        ...set(0),
        issuedVersionId: white.id,
        issuedAt: now,
        issuedOn: request.lockedOn,
        issuedByUserId: userId,
      });
      production.addSet({
        ...set(1),
        issuedVersionId: null,
        issuedAt: null,
        issuedOn: null,
        issuedByUserId: null,
      });
      production.setLocked(docId, true);
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
