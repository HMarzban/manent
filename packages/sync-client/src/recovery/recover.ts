// The recovery of a permanently rejected push: the document kept as a version, the server's
// whole state loaded under a new client ID, and this device's changes written back into it by
// block, with what cannot be written filed as Recovered text.
import {
  ORIGIN_REPLAY,
  applyBlockOps,
  createDoc,
  loadDoc,
  scriptBody,
} from "@manent/crdt";
import { mergeByBlock } from "@manent/revisions";
import type { Overlap } from "@manent/revisions";
import { canonicalBlock } from "@manent/schema";
import type { BlockJSON, BlockOp, DocJSON } from "@manent/schema";
import type { RecoveredItem } from "../ports/ports.ts";
import type { Journal } from "../session/journal.ts";
import type { LocalCopy } from "../session/local-copy.ts";

/** One piece of Recovered text before it is given an id and a time. */
export type Leftover = Omit<RecoveredItem, "id" | "docId" | "recoveredAt">;

/** A leftover of text alone: anything but an overlap, which carries both wordings. */
export function textLeftover(
  fields: Pick<Leftover, "blockId" | "nearBlockId" | "text">,
  cause: Leftover["cause"],
): Leftover {
  return { ...fields, cause, mine: null, theirs: null, otherClientIds: [] };
}

/** An overlap as a leftover: this device's text of the block, with both wordings. */
export function overlapLeftover(
  overlap: Overlap,
  otherClientIds: number[],
): Leftover {
  const { blockId, mine, theirs } = overlap;
  return {
    blockId,
    nearBlockId: null,
    text: runText(mine),
    cause: "overlap",
    mine,
    theirs,
    otherClientIds,
  };
}

/** `items` filed after `list`: one under an id the list holds takes that item's place. */
export function withFiled(
  list: readonly RecoveredItem[],
  items: readonly RecoveredItem[],
): RecoveredItem[] {
  const byId = new Map([...list, ...items].map((item) => [item.id, item]));
  return [...byId.values()];
}

/**
 * The text of every run, joined. Read from the runs, not through `blockView`,
 * which throws for an attribute the server refused, the very block filed here.
 */
function runText(block: BlockJSON): string {
  return (block.content ?? []).map((run) => run.text).join("");
}

/** A merge of mine: its operations, the distinct blocks they write, and the Recovered text of what they cannot write. */
export interface MineMerge {
  ops: BlockOp[];
  applied: number;
  leftovers: Leftover[];
}

/** Mine without the blocks whose ID an earlier block of mine holds, and those blocks. */
function firstOfEachId(mine: DocJSON): {
  mine: DocJSON;
  repeated: BlockJSON[];
} {
  const seen = new Set<string>();
  const repeated: BlockJSON[] = [];
  const isFirst = (block: BlockJSON): boolean => {
    const id = block.attrs?.id;
    if (typeof id !== "string" || !seen.has(id)) {
      if (typeof id === "string") seen.add(id);
      return true;
    }
    repeated.push(block);
    return false;
  };
  const content = (mine.content ?? []).map((section) => ({
    ...section,
    content: (section.content ?? []).filter(isFirst),
  }));
  return { mine: { ...mine, content }, repeated };
}

/**
 * Mine's changes against base, applied to theirs block by block. A block of
 * mine whose ID an earlier one holds too (as two devices splitting one block
 * at once may leave) is never written over the first: its text is set aside.
 * Recovered text: each overlap as mine's text of the block, then each block
 * set aside, under `setAside`.
 */
export function mergeMine(
  base: DocJSON,
  mine: DocJSON,
  theirs: DocJSON,
  setAside: "merge" | "rejected",
): MineMerge {
  const unique = firstOfEachId(mine);
  const merge = mergeByBlock(base, unique.mine, theirs);
  const leftovers: Leftover[] = [
    ...merge.overlaps.map((overlap) => overlapLeftover(overlap, [])),
    ...merge.setAside.map((block) => textLeftover(block, setAside)),
    ...unique.repeated.map((block) =>
      textLeftover(
        {
          blockId: typeof block.attrs?.id === "string" ? block.attrs.id : null,
          nearBlockId: null,
          text: runText(block),
        },
        setAside,
      ),
    ),
  ];
  return { ops: merge.ops, applied: merge.applied, leftovers };
}

/** The blocks of every section, in document order, each with its id; a block with none is passed over. */
export function blockList(doc: DocJSON): { id: string; block: BlockJSON }[] {
  return (doc.content ?? []).flatMap((section) =>
    (section.content ?? []).flatMap((block) => {
      const id = block.attrs?.id;
      return typeof id === "string" ? [{ id, block }] : [];
    }),
  );
}

/**
 * Mine's text of each block, in document order, that theirs does not hold
 * equal and that `keep` picks, as rejected Recovered text. `nearBlockId` is
 * the nearest earlier block of mine that theirs holds. A block only theirs
 * holds lists nothing: a deletion has no text.
 */
export function differingText(
  mine: DocJSON,
  theirs: DocJSON,
  keep: (blockId: string) => boolean,
): Leftover[] {
  const held = new Map(
    blockList(theirs).map(({ id, block }) => [
      id,
      JSON.stringify(canonicalBlock(block)),
    ]),
  );
  const listed: Leftover[] = [];
  let near: string | null = null;
  for (const { id, block } of blockList(mine)) {
    const differs = held.get(id) !== JSON.stringify(canonicalBlock(block));
    if (differs && keep(id))
      listed.push(
        textLeftover(
          { blockId: id, nearBlockId: near, text: runText(block) },
          "rejected",
        ),
      );
    if (held.has(id)) near = id;
  }
  return listed;
}

const EVERY_BLOCK = (): boolean => true;

/** Mine's changes against base as block operations on theirs, or, when `filing` picks blocks, only their text. */
function writeBackOf(
  base: DocJSON,
  mine: DocJSON,
  theirs: DocJSON,
  filing: ((blockId: string) => boolean) | null,
): MineMerge {
  if (filing === null) return mergeMine(base, mine, theirs, "rejected");
  return {
    ops: [],
    applied: 0,
    leftovers: differingText(mine, theirs, filing),
  };
}

/** The highest `localSeq` of an own update not yet acknowledged; 0 when there is none. */
function lastWaiting(journal: Journal): number {
  return Math.max(0, ...journal.waitingUpdates().map((e) => e.localSeq));
}

/** What a recovery asks of its subscription. */
export interface RecoveryHost {
  readonly journal: Journal;
  readonly copy: LocalCopy;
  /** A Yjs client ID this device never used for the document, and not `taken`. */
  freshClientId(taken: number | null): number;
  /** UNSUBSCRIBE, then SUBSCRIBE again: from nothing, under the new client ID. */
  resubscribe(): void;
  /** `rejected` joins the side states, or leaves them. */
  show(recovering: boolean): void;
}

/**
 * A fresh subscription due: the code the push was refused with (null when a
 * reopened session resumes one), the new client ID, and the generation a move
 * during the recovery named (null for the document's). `filing` picks the
 * blocks of a write-back the server refused in turn, whose text is filed and
 * never written again; null for a first recovery.
 */
interface Fresh {
  code: number | null;
  clientId: number;
  generation: number | null;
  filing: ((blockId: string) => boolean) | null;
}

/** The write-back waiting for the acknowledgement of its last entry, `through`. */
interface WriteBack {
  through: number;
  code: number | null;
  replayed: number;
  setAside: number;
}

/** One document's recovery from a rejected push, resumed from `meta.recovering` when it opens. */
export class PushRecovery {
  /** The fresh subscription a recovery waits for; null when none is due. */
  fresh: Fresh | null = null;
  private writeBack: WriteBack | null = null;
  private readonly host: RecoveryHost;

  constructor(host: RecoveryHost) {
    this.host = host;
    const { recovering } = host.journal.meta;
    if (recovering?.replaying === true) {
      const through = lastWaiting(host.journal);
      this.writeBack = { through, code: null, replayed: 0, setAside: 0 };
    } else if (recovering !== null) this.fresh = this.freshOf(null, null);
  }

  get active(): boolean {
    return this.fresh !== null || this.writeBack !== null;
  }

  /** The fresh subscription is due in the generation a move named, which it has seen nothing of. */
  get redirected(): boolean {
    return this.fresh !== null && this.fresh.generation !== null;
  }

  /**
   * A permanently rejected push: the document is kept as a version, and
   * subscribed to afresh. A write-back refused in turn is not recovered again:
   * what every waiting edit touched is filed.
   */
  reject(code: number, heal: boolean): void {
    const { journal, copy } = this.host;
    if (this.writeBack !== null) {
      const touched = journal.waitingUpdates().flatMap((e) => e.elements);
      this.writeBack = null;
      const filing = new Set(touched);
      this.fresh = this.freshOf(code, (id) => filing.has(id));
    } else {
      const versionId = copy.recordVersion("recovered", "rejected").id;
      journal.patch({ recovering: { versionId, heal, replaying: false } });
      this.fresh = this.freshOf(code, null);
    }
    this.host.show(true);
    this.host.resubscribe();
  }

  /** A move while the fresh subscription is due: it names the new generation. False when none is due. */
  moved(newGeneration: number): boolean {
    if (this.fresh === null) return false;
    this.fresh.generation = newGeneration;
    return true;
  }

  /**
   * The fresh subscription's step 2 holds the server's whole state: the
   * document is replaced by it, and mine's changes against the synced base
   * are written back into it as ordinary edits. After a refused heal push,
   * every block mine holds otherwise than theirs is filed instead. `headSeq`
   * is the fresh SUBSCRIBED's. Returns the new synced base.
   */
  loaded(
    fresh: Fresh,
    update: Uint8Array,
    syncedBase: Uint8Array | null,
    headSeq: number,
  ): Uint8Array {
    const { journal, copy } = this.host;
    const recovering = journal.meta.recovering;
    const next = loadDoc(update, { clientId: fresh.clientId });
    const theirs = scriptBody(next).materialize();
    const mine = copy.mine();
    const synced = syncedBase === null ? createDoc() : loadDoc(syncedBase);
    const base = scriptBody(synced).materialize();
    // after a refused heal push the server lost part of what was synced, which another device may hold too
    const filing = recovering?.heal === true ? EVERY_BLOCK : fresh.filing;
    const { ops, applied, leftovers } = writeBackOf(base, mine, theirs, filing);
    const items = copy.items(leftovers);
    const writing =
      recovering !== null && ops.length > 0
        ? { ...recovering, replaying: true }
        : null;
    const state = next.encodeState();
    const clientIds = [...journal.meta.clientIds, fresh.clientId];
    // in a new generation nothing of the old one's sequence or acknowledgements holds
    const generation =
      fresh.generation === null
        ? {}
        : {
            generation: fresh.generation,
            lastServerSeq: headSeq,
            ackedClocks: {},
          };
    journal.reset(
      state,
      { ...journal.meta, ...generation, clientIds, recovering: writing },
      items,
    );
    this.fresh = null;
    copy.replace(next, items);
    // the replacement is told first, so that a following tab loads it before the writes reach it
    copy.showReplaced(items, "rejected");
    applyBlockOps(next, ops, ORIGIN_REPLAY);
    const { code } = fresh;
    const done = {
      through: lastWaiting(journal),
      code,
      replayed: applied,
      setAside: items.length,
    };
    if (writing === null) this.written(done);
    else this.writeBack = done;
    return state;
  }

  /** The requests up to `clientSeq` are acknowledged: a write-back they cover is over. */
  acknowledged(clientSeq: number): void {
    const { writeBack } = this;
    if (writeBack !== null && clientSeq >= writeBack.through)
      this.written(writeBack);
  }

  private written(writeBack: WriteBack): void {
    this.writeBack = null;
    const { journal, copy } = this.host;
    if (journal.meta.recovering !== null) journal.patch({ recovering: null });
    this.host.show(false);
    const { code, replayed, setAside } = writeBack;
    if (code !== null)
      copy.emit({ type: "rejected", code, replayed, setAside });
  }

  private freshOf(
    code: number | null,
    filing: ((blockId: string) => boolean) | null,
  ): Fresh {
    const clientId = this.host.freshClientId(this.fresh?.clientId ?? null);
    return { code, clientId, generation: null, filing };
  }
}
