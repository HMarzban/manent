// A simulated person: types, pastes, moves scenes and goes offline at a profile's rates,
// writing through a sync client's document one keystroke at a time.
import { blockIds, readBlocks, scriptBody } from "@manent/crdt";
import type { BlockWriter } from "@manent/crdt";
import { attrsForNewBlock, formatFrom } from "@manent/schema";
import type { BlockJSON, IdSource } from "@manent/schema";
import type { Clock, DocHandle, Random, SyncClient } from "@manent/sync-client";
import { createRng, seededIdSource } from "../seed/rng.ts";
import type { Rng } from "../seed/rng.ts";
import { OwnLines } from "./own-lines.ts";
import { createWriterPresence } from "./presence.ts";
import type { Caret, WriterPresence } from "./presence.ts";
import { lineEndFrom, regionOf } from "./region.ts";
import type { Region, WriterLine } from "./region.ts";
import type { WritingProfile } from "./profiles.ts";
import { wordsOf } from "./words.ts";

/** `at` is `clock.now()`; `blockId` is the block typed in, the first pasted or the first moved, and null for offline and online. */
export interface SimulatedPersonEvent {
  type: "typed" | "pasted" | "moved" | "offline" | "online";
  at: number;
  blockId: string | null;
  marker: string | null;
}

/**
 * `stop()` types the rest of the burst at once (with `keepBlocks`, takes back every line instead), ends every timer,
 * comes back online when offline, and leaves presence.
 */
export interface SimulatedPerson {
  start(): void;
  stop(): Promise<void>;
  readonly events: readonly SimulatedPersonEvent[];
}

interface PersonOptions {
  handle: Pick<DocHandle, "doc" | "sendAwareness">;
  client: Pick<SyncClient, "setOnline">;
  profile: WritingProfile;
  clock: Clock;
  random: Random;
  region: Region | null;
  markers: boolean;
  lines?: readonly WriterLine[];
  keepBlocks?: number;
}

const HOUR_MS = 3_600_000;
/** Every this many bursts of words ends with Enter. */
const ENTER_EVERY = 4;
/** Every this many keystrokes is a Backspace over the character before, typed again after. */
const CORRECTION_EVERY = 20;
const MOVE_BLOCKS = [5, 25] as const;
/** Blocks to a pasted page, as in a generated script. */
const PASTE_BLOCKS_PER_PAGE = 25;

type Key =
  | { type: "text"; text: string; marker: string | null }
  | { type: "enter"; element: string };

/** The block the person writes in, and its element. */
interface Place {
  blockId: string;
  element: string;
}

interface Burst {
  keys: readonly Key[];
  next: number;
  caret: Caret;
}

type Timer = "key" | "move" | "paste" | "offline";

const textKeys = (text: string): Key[] =>
  Array.from(text, (char) => ({ type: "text", text: char, marker: null }));

/** An empty block when `text` is null. */
function newBlock(element: string, id: string, text: string | null): BlockJSON {
  return {
    type: "block",
    // spread, because BlockJSON's attrs are an open record and BlockAttrs is an interface
    attrs: { ...attrsForNewBlock(element, id) },
    ...(text === null ? {} : { content: [{ type: "text", text }] }),
  };
}

function lengthOf(block: BlockJSON): number {
  return (block.content ?? []).reduce((sum, run) => sum + run.text.length, 0);
}

class Person implements SimulatedPerson {
  readonly events: SimulatedPersonEvent[] = [];
  private readonly options: PersonOptions;
  private readonly rng: Rng;
  private readonly ids: IdSource;
  private readonly keyMs: number;
  private readonly cancels = new Map<Timer, () => void>();
  private started = false;
  private offline = false;
  private place: Place | null = null;
  private burst: Burst | null = null;
  /** The region, whose last block becomes each block typed after it, so that a scene grows with its writing. */
  private region: Region | null;
  private keystrokes = 0;
  private bursts = 0;
  private readonly presence: WriterPresence | null;
  /** Followed only while the person keeps to a number of blocks. */
  private readonly own: OwnLines | null;

  constructor(options: PersonOptions) {
    if (options.lines?.length === 0 || options.lines?.some((l) => !l.length))
      throw new RangeError("a person needs at least one line, each of a block");
    this.options = options;
    this.rng = createRng(Math.floor(options.random.next() * 4_294_967_296));
    this.ids = seededIdSource(this.rng);
    this.keyMs = 1000 / options.profile.keysPerSecond;
    this.region = options.region;
    const keep = options.keepBlocks;
    this.own = keep === undefined ? null : new OwnLines(keep);
    this.presence = options.profile.presence
      ? createWriterPresence(options)
      : null;
  }

  start(): void {
    if (this.started) throw new RangeError("a simulated person starts once");
    this.started = true;
    const { profile } = this.options;
    this.beginBurst();
    this.atRate("move", profile.sceneMovesPerHour, () => this.move());
    this.atRate("paste", profile.pastesPerHour, () => this.paste());
    this.atRate("offline", profile.offlinePerHour, () => this.goOffline());
  }

  stop(): Promise<void> {
    for (const cancel of this.cancels.values()) cancel();
    this.cancels.clear();
    // the line being typed is finished at once, or taken back with the rest, so that no half-typed line is left
    const keys = this.burst?.keys ?? [];
    if (this.own !== null) this.own.all(this.options.handle.doc());
    else
      while (this.burst !== null && this.burst.next < keys.length)
        if (!this.type(this.burst, keys[this.burst.next]!)) break;
    if (this.offline) this.comeBack();
    this.presence?.leave();
    return Promise.resolve();
  }

  private schedule(timer: Timer, delayMs: number, fn: () => void): void {
    this.cancels.set(
      timer,
      this.options.clock.schedule(() => {
        this.cancels.delete(timer);
        fn();
      }, delayMs),
    );
  }

  /** Runs `fn` after a wait drawn from an exponential distribution with `perHour` as its rate; never when it is 0. */
  private atRate(timer: Timer, perHour: number, fn: () => void): void {
    if (perHour <= 0) return;
    const waitMs = (-Math.log(1 - this.rng.next()) / perHour) * HOUR_MS;
    this.schedule(timer, waitMs, fn);
  }

  private record(
    type: SimulatedPersonEvent["type"],
    blockId: string | null,
    marker: string | null = null,
  ): void {
    this.events.push({ type, at: this.options.clock.now(), blockId, marker });
  }

  /** One transaction; false when the block it writes to is gone. */
  private write(fn: (writer: BlockWriter) => boolean): boolean {
    let wrote = false;
    scriptBody(this.options.handle.doc()).write((writer) => {
      wrote = fn(writer);
    });
    return wrote;
  }

  /** The person's block while it is in the region, otherwise any but the region's last, so that Enter stays inside. */
  private pickBlock(region: readonly string[]): string | null {
    const held = this.place?.blockId ?? null;
    if (held !== null && region.includes(held)) return held;
    if (region.length === 0) return null;
    return this.rng.pick(region.length > 1 ? region.slice(0, -1) : region);
  }

  /** Where the next line goes (lineEndFrom): from the person's block while it is in the region, otherwise from one drawn from it. */
  private pickLineEnd(region: readonly string[]): string | null {
    if (region.length === 0) return null;
    const held = region.indexOf(this.place?.blockId ?? "");
    const from = held === -1 ? this.rng.int(0, region.length - 1) : held;
    return lineEndFrom(this.options.handle.doc(), region, from);
  }

  private keysFor(place: Place, offset: number): Key[] {
    const { profile, lines, markers, handle } = this.options;
    this.bursts += 1;
    const marker = markers ? `⟦${handle.doc().clientId}:${this.bursts}⟧` : null;
    const opening: Key[] =
      marker === null ? [] : [{ type: "text", text: marker, marker }];
    if (lines !== undefined)
      return lines[(this.bursts - 1) % lines.length]!.flatMap((block, i) => [
        { type: "enter", element: block.element },
        ...(i === 0 ? opening : []),
        ...textKeys(block.text),
      ]);
    const length = this.rng.int(...profile.burstChars);
    const enter: Key = { type: "enter", element: place.element };
    return [
      ...textKeys(offset > 0 ? " " : ""),
      ...opening,
      ...textKeys(wordsOf(this.rng, length, marker !== null)),
      ...(this.bursts % ENTER_EVERY === 0 ? [enter] : []),
    ];
  }

  private beginBurst(): void {
    const doc = this.options.handle.doc();
    const { lines } = this.options;
    const next = lines?.[this.bursts % lines.length]?.length ?? 1;
    if (this.own !== null) this.region = this.own.room(doc, next, this.region);
    const region = regionOf(blockIds(doc), this.region);
    const blockId =
      this.options.lines === undefined
        ? this.pickBlock(region)
        : this.pickLineEnd(region);
    if (blockId === null) {
      this.place = null;
      this.pause();
      return;
    }
    const block = readBlocks(doc, new Set([blockId])).get(blockId)!;
    const element = block.attrs?.type ?? "action";
    const offset = lengthOf(block);
    this.place = { blockId, element };
    this.presence?.moved({ blockId, offset });
    const burst: Burst = {
      keys: this.keysFor(this.place, offset),
      next: 0,
      caret: { blockId, offset },
    };
    this.burst = burst;
    this.schedule("key", this.keyMs, () => this.press(burst));
  }

  private pause(): void {
    const pauseMs = this.rng.int(...this.options.profile.pauseMs);
    this.schedule("key", pauseMs, () => this.beginBurst());
  }

  /** The next key, or a Backspace over the character before it on every CORRECTION_EVERY-th keystroke. */
  private press(burst: Burst): void {
    this.keystrokes += 1;
    const previous = burst.keys[burst.next - 1];
    const wrote =
      this.keystrokes % CORRECTION_EVERY === 0 &&
      previous?.type === "text" &&
      previous.marker === null
        ? this.backspace(burst, previous.text)
        : this.type(burst, burst.keys[burst.next]!);
    if (!wrote) {
      // the block is gone: the next burst finds another
      this.place = null;
      this.pause();
    } else if (burst.next < burst.keys.length)
      this.schedule("key", this.keyMs, () => this.press(burst));
    else this.pause();
  }

  private backspace(burst: Burst, text: string): boolean {
    const { blockId, offset } = burst.caret;
    const at = offset - text.length;
    if (!this.write((w) => w.deleteText(blockId, at, text.length)))
      return false;
    this.own?.erased(blockId, text.length);
    burst.next -= 1;
    burst.caret = { blockId, offset: at };
    this.presence?.moved(burst.caret);
    this.record("typed", blockId);
    return true;
  }

  private type(burst: Burst, key: Key): boolean {
    const { blockId, offset } = burst.caret;
    burst.next += 1;
    if (key.type === "enter") {
      const id = this.ids();
      const block = newBlock(key.element, id, null);
      if (!this.write((w) => w.insertBlocks(blockId, [block]))) return false;
      if (this.region?.lastBlockId === blockId)
        this.region = { ...this.region, lastBlockId: id };
      this.own?.made(id, key.element);
      burst.caret = { blockId: id, offset: 0 };
      this.presence?.moved(burst.caret);
      this.place = { blockId: id, element: key.element };
      this.record("typed", id);
      return true;
    }
    if (!this.write((w) => w.insertText(blockId, offset, key.text)))
      return false;
    this.own?.typed(blockId, key.text);
    burst.caret = { blockId, offset: offset + key.text.length };
    this.presence?.moved(burst.caret);
    this.record("typed", blockId, key.marker);
    return true;
  }

  /** 5 to 25 blocks strictly inside the region, deleted and inserted again after another of its blocks. */
  private move(): void {
    const doc = this.options.handle.doc();
    const region = regionOf(blockIds(doc), this.region);
    const inner = region.slice(1, -1);
    const count = Math.min(this.rng.int(...MOVE_BLOCKS), inner.length - 1);
    if (count >= MOVE_BLOCKS[0]) {
      const start = this.rng.int(0, inner.length - count);
      const moved = inner.slice(start, start + count);
      // region[start] lies just before the moved blocks: inserting after it would move nothing
      const anchor = this.rng.pick(
        region
          .slice(0, -1)
          .filter((id, i) => i !== start && !moved.includes(id)),
      );
      const nonce = this.ids().slice(0, 6);
      const read = readBlocks(doc, new Set(moved));
      const blocks = moved.map((id) => {
        const block = read.get(id)!;
        return {
          ...block,
          attrs: { ...block.attrs, from: formatFrom(id, nonce) },
        };
      });
      const wrote = this.write((w) => {
        for (const id of moved) w.deleteBlock(id);
        return w.insertBlocks(anchor, blocks);
      });
      if (wrote) this.record("moved", moved[0]!);
    }
    this.atRate("move", this.options.profile.sceneMovesPerHour, () =>
      this.move(),
    );
  }

  private paste(): void {
    const { profile } = this.options;
    const place = this.place;
    if (place !== null) {
      const pages = this.rng.int(...profile.pastePages);
      const count = pages * PASTE_BLOCKS_PER_PAGE;
      const ids = Array.from({ length: count }, this.ids);
      const blocks = ids.map((id) => {
        const length = this.rng.int(...profile.burstChars);
        return newBlock(place.element, id, wordsOf(this.rng, length, false));
      });
      if (this.write((w) => w.insertBlocks(place.blockId, blocks)))
        this.record("pasted", ids[0]!);
    }
    this.atRate("paste", profile.pastesPerHour, () => this.paste());
  }

  private goOffline(): void {
    const { client, profile } = this.options;
    this.offline = true;
    client.setOnline(false);
    this.record("offline", null);
    this.schedule("offline", this.rng.int(...profile.offlineMs), () => {
      this.comeBack();
      this.atRate("offline", profile.offlinePerHour, () => this.goOffline());
    });
  }

  private comeBack(): void {
    this.offline = false;
    this.options.client.setOnline(true);
    this.record("online", null);
  }
}

/**
 * A person who writes at `profile`'s rates once started: bursts of keystrokes
 * at `keysPerSecond`, one transaction a key, in the block they are in. A burst
 * is the next of `lines`, each of its blocks new, after a block where it does
 * not cut a speech in two, when lines are given; otherwise seeded words. With
 * `markers`, a burst opens with `⟦<client id>:<n>⟧`, typed as one key. With
 * `keepBlocks`, it keeps at most that many blocks it made, or one line's: it
 * deletes its oldest lines before a line that would pass it, and every line
 * when it stops, each block only while it reads as it was typed. Every
 * timer goes through `clock` and every draw through `random`, so one seed
 * gives one run. RangeError for an empty `lines` or an empty line.
 */
export function createSimulatedPerson(options: PersonOptions): SimulatedPerson {
  return new Person(options);
}
