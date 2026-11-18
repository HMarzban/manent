// Operations on a simulated world as fast-check draws them: each names a device and an edit of the
// script, a change of connection, or frames to deliver. Indices are taken modulo what exists.
import { scriptBody } from "@manent/crdt";
import { formatFrom } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import fc from "fast-check";
import type { SimClient, World } from "../src/index.ts";

export type Op = { device: number } & (
  | { kind: "type"; block: number; at: number }
  | { kind: "insert"; block: number }
  | { kind: "delete"; block: number }
  | { kind: "element"; block: number; element: number }
  | { kind: "split"; block: number; at: number }
  | { kind: "join"; block: number }
  | { kind: "move"; block: number; length: number; target: number }
  | { kind: "restore"; block: number; at: number }
  | { kind: "offline" }
  | { kind: "online" }
  | { kind: "deliver"; frames: number }
);

export interface Run {
  seed: number;
  users: string[];
  devices: number;
  faults: { duplicate: number };
  ops: Op[];
}

const USERS = ["dana", "sam", "priya"] as const;
const ELEMENTS = ["action", "dialogue", "character", "scene_heading"] as const;
const MARKER = /\[[^[\]]+\]/g;

const index = fc.nat({ max: 63 });

export const arbOp: fc.Arbitrary<Op> = fc
  .tuple(
    fc.nat({ max: 5 }),
    fc.oneof(
      fc.record({ kind: fc.constant("type"), block: index, at: index }),
      fc.record({ kind: fc.constant("insert"), block: index }),
      fc.record({ kind: fc.constant("delete"), block: index }),
      fc.record({ kind: fc.constant("element"), block: index, element: index }),
      fc.record({ kind: fc.constant("split"), block: index, at: index }),
      fc.record({ kind: fc.constant("join"), block: index }),
      fc.record({
        kind: fc.constant("move"),
        block: index,
        length: fc.integer({ min: 2, max: 5 }),
        target: index,
      }),
      fc.record({ kind: fc.constant("restore"), block: index, at: index }),
      fc.record({ kind: fc.constant("offline") }),
      fc.record({ kind: fc.constant("online") }),
      fc.record({
        kind: fc.constant("deliver"),
        frames: fc.integer({ min: 1, max: 40 }),
      }),
    ),
  )
  .map(([device, op]): Op => ({ device, ...op }));

export const arbRun: fc.Arbitrary<Run> = fc.record({
  seed: fc.integer({ min: 1, max: 2_147_483_647 }),
  users: fc.integer({ min: 1, max: 3 }).map((n) => USERS.slice(0, n)),
  devices: fc.integer({ min: 1, max: 2 }),
  faults: fc.record({ duplicate: fc.constantFrom(0, 0.05) }),
  ops: fc.array(arbOp, { minLength: 20, maxLength: 120 }),
});

interface Flat {
  id: string;
  text: string;
  json: BlockJSON;
}

function blocksOf(device: SimClient): Flat[] {
  const sections = scriptBody(device.handle.doc()).materialize().content ?? [];
  return sections
    .flatMap((section) => section.content ?? [])
    .flatMap((json) => {
      const id = json.attrs?.id;
      const text = (json.content ?? []).map((run) => run.text).join("");
      return typeof id === "string" ? [{ id, text, json }] : [];
    });
}

/** Where a marker may go without cutting another: the ends, and just after each marker. */
function boundaries(text: string): number[] {
  const after = [...text.matchAll(MARKER)].map((m) => m.index + m[0].length);
  return [...new Set([0, ...after, text.length])];
}

const pick = <T>(items: readonly T[], at: number): T | undefined =>
  items[at % items.length];

/** Per world: a counter for ids and markers, and each block's texts before the ops changed it. */
interface Memory {
  made: number;
  texts: Map<string, string[]>;
}

const memories = new WeakMap<World, Memory>();

function memoryOf(world: World): Memory {
  const known = memories.get(world);
  if (known !== undefined) return known;
  const memory: Memory = { made: 0, texts: new Map() };
  memories.set(world, memory);
  return memory;
}

/** A block id unique in the world, and a marker of the same number. */
function fresh(world: World): { id: string; marker: string } {
  const memory = memoryOf(world);
  memory.made += 1;
  const n = memory.made;
  return { id: `fz${String(n).padStart(14, "0")}`, marker: `[fz:${n}]` };
}

function remember(world: World, block: Flat): void {
  const texts = memoryOf(world).texts;
  texts.set(block.id, [...(texts.get(block.id) ?? []), block.text]);
}

const blockJSON = (
  id: string,
  text: string,
  from: string | null = null,
): BlockJSON => ({
  type: "block",
  attrs: { id, type: "action", from },
  content: text === "" ? [] : [{ type: "text", text }],
});

type Edit = Exclude<Op, { kind: "offline" | "online" | "deliver" }>;

/** One edit of `device`'s script; an edit of a block that is not there writes nothing. */
function edit(world: World, device: SimClient, op: Edit): void {
  const blocks = blocksOf(device);
  const block = pick(blocks, op.block);
  const made = fresh(world);
  if (op.kind === "insert" || block === undefined) {
    const after = op.block % (blocks.length + 1);
    const anchor = blocks[after]?.id ?? null;
    return device.write((w) =>
      w.insertBlocks(anchor, [blockJSON(made.id, made.marker)]),
    );
  }
  const { id, text } = block;
  remember(world, block);
  switch (op.kind) {
    case "type": {
      const at = pick(boundaries(text), op.at) ?? 0;
      return device.write((w) => w.insertText(id, at, made.marker));
    }
    case "delete":
      return device.write((w) => w.deleteBlock(id));
    case "element": {
      const type = pick(ELEMENTS, op.element) ?? "action";
      return device.write((w) => w.setBlockAttrs(id, { type }));
    }
    case "split": {
      const at = pick(boundaries(text), op.at) ?? text.length;
      const tail = blockJSON(made.id, text.slice(at), formatFrom(id, made.id));
      return device.write((w) => {
        w.deleteText(id, at, text.length - at);
        w.insertBlocks(id, [tail]);
      });
    }
    case "join": {
      const next = blocks[blocks.indexOf(block) + 1];
      if (next === undefined) return;
      return device.write((w) => {
        w.insertText(id, text.length, next.text);
        w.deleteBlock(next.id);
      });
    }
    case "move": {
      const start = blocks.indexOf(block);
      const scene = blocks.slice(start, start + op.length);
      const moved = new Set(scene.map((b) => b.id));
      const others = blocks.filter((b) => !moved.has(b.id));
      const target = pick([null, ...others], op.target)?.id ?? null;
      return device.write((w) => {
        for (const b of scene) w.deleteBlock(b.id);
        w.insertBlocks(
          target,
          scene.map((b) => b.json),
        );
      });
    }
    case "restore": {
      const earlier = pick(memoryOf(world).texts.get(id) ?? [], op.at);
      if (earlier === undefined) return;
      return device.write((w) => {
        w.deleteText(id, 0, text.length);
        w.insertText(id, 0, earlier);
      });
    }
    default:
      op satisfies never;
  }
}

/** The op, by a device of the world; it writes through the world's books. */
export function applyOp(world: World, op: Op): void {
  const device = world.clients[op.device % world.clients.length];
  if (device === undefined) throw new RangeError("a world has no device");
  if (op.kind === "offline") return device.online(false);
  if (op.kind === "online") return device.online(true);
  if (op.kind === "deliver") {
    for (let i = 0; i < op.frames; i++) world.network.step();
    return;
  }
  edit(world, device, op);
}
