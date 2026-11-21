// The status, the receipt and To review as a person reads them, checked against what each
// simulated client and its store hold after every step of a seeded world.
import { expect, test } from "bun:test";
import { ORIGIN_LOAD, createDoc, loadDoc, scriptBody } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { createRng } from "@manent/demo";
import type { Rng } from "@manent/demo";
import type { BlockJSON, DocJSON } from "@manent/schema";
import { waitingCount } from "@manent/sync-client";
import type {
  LoadedDocument,
  RecoveredItem,
  StoredEntry,
} from "@manent/sync-client";
import { createWorld } from "@manent/testkit";
import type { SimClient, World } from "@manent/testkit";
import { formatCount, receiptText, statusText } from "@manent/ui";
import type { StatusWords } from "@manent/ui";
import { toStatusFacts } from "../src/services/sync/status-facts.ts";

const N = Number(process.env.MANENT_SIM_SEEDS ?? 25);
const LONG = { timeout: 120_000 };
const DAY_MS = 86_400_000;
const MARKER = /\[[^[\]]+\]/g;
const WAITING = /, (\S+) waiting$/;
/** The server slot's words that carry the count of changes waiting. */
const COUNTED_HEADS = ["Offline", "Can't reach Manent"] as const;

const forSeeds = async (
  run: (world: World) => Promise<void>,
  options: Partial<Parameters<typeof createWorld>[0]> = {},
) => {
  for (let seed = 1; seed <= N; seed++) {
    const world = await createWorld({
      seed,
      users: ["dana", "sam", "priya"],
      ...options,
    });
    await run(world);
    await world.settle();
    world.check();
  }
};

/** The overlaps a reconnect filed, and the other pieces of Recovered text. */
interface Counts {
  overlaps: number;
  setAside: number;
}

/** One client as the interface follows it, and what its events showed. */
interface Followed {
  readonly client: SimClient;
  /** The last value given to the client's `online()`; a client starts online. */
  network: boolean;
  /** What a reconnect filed since the link came back, and whether own changes were waiting then; null once a receipt counted it. */
  reconnect: { owed: boolean; filed: RecoveredItem[] } | null;
  /** Every item id filed so far: an item filed again under its id takes the earlier one's place and is not new. */
  readonly ids: Set<string>;
  receipts: Counts[];
  /** The first invariant an event broke, named. */
  broken: string | null;
  /** The script as its store held it at the last check. */
  stored: StoredCopy | null;
}

/** A store's script, built from its checkpoint and kept between checks with the updates applied over it. */
interface StoredCopy {
  checkpoint: Uint8Array | null;
  doc: CrdtDoc;
  /** The `localSeq` of every update applied over the checkpoint. */
  seqs: Set<number>;
}

interface Watch {
  readonly world: World;
  readonly followed: readonly Followed[];
  /** Markers a person deleted: an action removed them from the document it was taken in. */
  readonly removed: Set<string>;
}

const turn = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

const textOf = (block: BlockJSON | null): string =>
  (block?.content ?? []).map((run) => run.text).join("");

function blocksOf(content: DocJSON): BlockJSON[] {
  return (content.content ?? []).flatMap((section) => section.content ?? []);
}

const linesOfContent = (content: DocJSON): string[] =>
  blocksOf(content).map(textOf);

const linesOf = (doc: CrdtDoc): string[] =>
  linesOfContent(scriptBody(doc).materialize());

const markersOf = (c: SimClient): Set<string> =>
  new Set(linesOf(c.handle.doc()).flatMap((line) => line.match(MARKER) ?? []));

const sameBytes = (a: Uint8Array | null, b: Uint8Array | null): boolean =>
  a === null || b === null
    ? a === b
    : a.length === b.length && a.every((byte, i) => byte === b[i]);

const sameLines = (a: readonly string[], b: readonly string[]): boolean =>
  a.join("\n") === b.join("\n");

// planOutbox's test of an entry: an own update or a setting the server has not acknowledged
const isWaiting = (entry: StoredEntry): boolean =>
  !entry.acked && (entry.kind === "set" || entry.own);

/**
 * The script as the store holds it: its checkpoint with every stored update after it. The copy of
 * the last check is built again when the checkpoint changed or an update it applied is gone.
 */
function storedLines(f: Followed, stored: LoadedDocument): string[] {
  const checkpoint = stored.checkpoint?.state ?? null;
  const updates = stored.entries.filter((entry) => entry.kind === "update");
  const held = new Set(updates.map((entry) => entry.localSeq));
  let copy = f.stored;
  if (
    copy === null ||
    !sameBytes(copy.checkpoint, checkpoint) ||
    [...copy.seqs].some((seq) => !held.has(seq))
  ) {
    copy?.doc.destroy();
    const doc = checkpoint === null ? createDoc() : loadDoc(checkpoint);
    copy = { checkpoint, doc, seqs: new Set() };
    f.stored = copy;
  }
  for (const entry of updates)
    if (!copy.seqs.has(entry.localSeq)) {
      copy.doc.applyUpdate(entry.update, ORIGIN_LOAD);
      copy.seqs.add(entry.localSeq);
    }
  return linesOf(copy.doc);
}

/** Open review entries: each piece of Recovered text, and each block with an overlap once. */
function toReviewOf(items: readonly RecoveredItem[]): number {
  const overlapped = new Set<string | null>();
  let recovered = 0;
  for (const item of items)
    if (item.cause === "overlap") overlapped.add(item.blockId);
    else recovered += 1;
  return recovered + overlapped.size;
}

function countsOf(items: readonly RecoveredItem[]): Counts {
  const overlaps = items.filter((item) => item.cause === "overlap").length;
  return { overlaps, setAside: items.length - overlaps };
}

function told(
  f: Followed,
  event: { sent: number; setAside: number; overlaps: number },
): void {
  const { overlaps, setAside } = countsOf(f.reconnect?.filed ?? []);
  const said = receiptText({
    synced: event.sent,
    overlaps: event.overlaps,
    unplaced: event.setAside,
  });
  const { device } = f.client;
  f.reconnect = null;
  f.receipts.push({ overlaps: event.overlaps, setAside: event.setAside });
  if (said.includes("lost"))
    f.broken ??= `U4: ${device}'s receipt reads ${said}`;
  if (event.overlaps !== overlaps || event.setAside !== setAside)
    f.broken ??= `U4: ${device}'s receipt counts ${event.overlaps} overlaps and ${event.setAside} set aside of ${overlaps} and ${setAside} filed`;
}

function follow(client: SimClient): Followed {
  const { handle } = client;
  const f: Followed = {
    client,
    network: true,
    reconnect: null,
    ids: new Set(handle.recovered.get().map((item) => item.id)),
    receipts: [],
    broken: null,
    stored: null,
  };
  const online = client.online.bind(client);
  client.online = (wanted) => {
    f.network = wanted;
    online(wanted);
  };
  let linked = client.client.link.get().state === "online";
  client.client.link.subscribe(({ state }) => {
    const back = state === "online" && !linked;
    linked = state === "online";
    // a reconnect whose receipt is still owed goes on counting what is filed after it
    if (back && f.reconnect?.owed !== true)
      f.reconnect = { owed: handle.status.get().waiting > 0, filed: [] };
  });
  handle.on((event) => {
    if (event.type === "receipt") told(f, event);
    if (event.type !== "recovered") return;
    const filed = event.items.filter((item) => !f.ids.has(item.id));
    for (const item of event.items) f.ids.add(item.id);
    f.reconnect?.filed.push(...filed);
  });
  return f;
}

function watchWorld(world: World): Watch {
  return { world, followed: world.clients.map(follow), removed: new Set() };
}

/** The status as the interface reads it, from the client's handle and link. */
function wordsOf(f: Followed, now: number): StatusWords {
  const { handle, client } = f.client;
  const link = client.link.get();
  return statusText(
    toStatusFacts({
      status: handle.status.get(),
      link,
      network: f.network,
      viewRole: null,
      viewLive: false,
      offlineSinceAt: link.wentOfflineAt,
      toReview: toReviewOf(handle.recovered.get()),
      now,
    }),
  );
}

/** U1 to U3 for one client: what its status says, against its handle, its document's lines and its store. */
function statusFault(
  f: Followed,
  words: StatusWords,
  lines: readonly string[],
  stored: LoadedDocument | null,
): string | null {
  const { device, handle } = f.client;
  const entries = stored?.entries ?? [];
  if (
    words.server.startsWith("Synced") &&
    (!handle.status.get().synced || entries.some(isWaiting))
  )
    return `U1: ${device} says ${words.server} with ${waitingCount(entries)} waiting in its store`;
  if (
    words.device === "Saved" &&
    (stored === null || !sameLines(storedLines(f, stored), lines))
  )
    return `U2: ${device} says Saved with a write unsettled or refused`;
  const counted = COUNTED_HEADS.some((head) => words.server.startsWith(head));
  const n = waitingCount(entries);
  const shown = WAITING.exec(words.server)?.[1] ?? null;
  if (counted && shown !== (n === 0 ? null : formatCount(n)))
    return `U3: ${device} says ${words.server} with ${n} waiting in its store`;
  return null;
}

/** U5: every marker typed and not deleted is in a document, an overlap's own wording or Recovered text. */
function lostMarker(
  watch: Watch,
  lines: readonly (readonly string[])[],
): string | null {
  const { clients } = watch.world;
  const recovered = clients.flatMap((c) =>
    c.handle.recovered.get().flatMap((item) => [item.text, textOf(item.mine)]),
  );
  const held = [...lines.flat(), ...recovered].join("\n");
  for (const c of clients)
    for (const marker of c.typed)
      if (!watch.removed.has(marker) && !held.includes(marker))
        return `U5: ${marker}, typed by ${c.device}, is nowhere`;
  return null;
}

/** The invariants, once the writes the last step started have settled. */
async function check(watch: Watch): Promise<void> {
  await turn();
  const now = watch.world.clock.clock.now();
  const read = watch.followed.map((f) => ({
    f,
    words: wordsOf(f, now),
    lines: linesOf(f.client.handle.doc()),
    stored: f.client.store.load(f.client.handle.docId),
  }));
  let fault: string | null = null;
  for (const { f, words, lines, stored } of read)
    fault ??= f.broken ?? statusFault(f, words, lines, await stored);
  fault ??= lostMarker(
    watch,
    read.map(({ lines }) => lines),
  );
  expect(fault === null ? null : `seed ${watch.world.seed}: ${fault}`).toBe(
    null,
  );
}

/** One action of a person; the markers it removed from their document were deleted by them. */
async function step(watch: Watch, action: () => void): Promise<void> {
  const { clients } = watch.world;
  const before = clients.map(markersOf);
  action();
  for (const [i, c] of clients.entries()) {
    const after = markersOf(c);
    for (const marker of before[i] ?? [])
      if (!after.has(marker)) watch.removed.add(marker);
  }
  await check(watch);
}

/** U4 too: an online, synced client has no reconnect left whose filed items no receipt counted. */
async function settle(watch: Watch): Promise<void> {
  await watch.world.settle();
  for (const f of watch.followed) {
    const { reconnect, client } = f;
    if (reconnect === null || !reconnect.owed || reconnect.filed.length === 0)
      continue;
    if (f.network && client.handle.status.get().synced)
      f.broken ??= `U4: ${client.device} filed ${reconnect.filed.length} items on a reconnect no receipt counted`;
  }
  await check(watch);
}

/** Where a marker may go without cutting another: the ends, and just after each marker. */
function boundaries(text: string): number[] {
  const after = [...text.matchAll(MARKER)].map((m) => m.index + m[0].length);
  return [...new Set([0, ...after, text.length])];
}

/** One change of `c`'s in one of `shared`: a marker typed at a boundary, or one deleted. */
function rewrite(c: SimClient, shared: readonly string[], rng: Rng): void {
  const id = rng.pick(shared);
  const block = blocksOf(scriptBody(c.handle.doc()).materialize()).find(
    (b) => b.attrs?.id === id,
  );
  if (block === undefined) throw new RangeError(`no block ${id}`);
  const text = textOf(block);
  const markers = [...text.matchAll(MARKER)];
  const typed = `[${c.device}:rewrite-${c.typed.length + 1}]`;
  if (markers.length === 0 || rng.next() < 0.75)
    return c.write((w) => {
      w.insertText(id, rng.pick(boundaries(text)), typed);
    });
  const { index, 0: marker } = rng.pick(markers);
  c.write((w) => {
    w.deleteText(id, index, marker.length);
  });
}

test(
  "two people offline for a day rewrite the same scenes, and the receipt counts what review holds",
  () =>
    forSeeds(
      async (w) => {
        const watch = watchWorld(w);
        const rng = createRng(w.seed);
        const [dana] = w.clients;
        if (dana === undefined) throw new RangeError("no client");
        const shared = blocksOf(scriptBody(dana.handle.doc()).materialize())
          .slice(0, 3)
          .flatMap(({ attrs }) =>
            typeof attrs?.id === "string" ? [attrs.id] : [],
          );
        for (const c of w.clients) c.online(false);
        for (let i = 0; i < 200; i++)
          for (const c of w.clients)
            await step(watch, () => rewrite(c, shared, rng));
        w.clock.advance(DAY_MS);
        // one after the other, so that the second finds the first's wording on the server
        for (const c of w.clients) {
          c.online(true);
          await settle(watch);
        }
        const receipts = watch.followed.map((f) => f.receipts);
        expect(receipts).toEqual([
          [{ overlaps: 0, setAside: 0 }],
          [{ overlaps: 3, setAside: 0 }],
        ]);
        expect(receipts).toEqual(
          w.clients.map((c) => [countsOf(c.handle.recovered.get())]),
        );
      },
      { users: ["dana", "sam"], faults: { duplicate: 0.05 } },
    ),
  LONG,
);
