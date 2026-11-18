// What a world writes into its script: the two scenes it starts with, and the random action of
// one device that `act()` takes.
import { createDoc, scriptBody, updateMeta } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { Rng } from "@manent/demo";
import { formatFrom } from "@manent/schema";
import type { BlockJSON, IdSource } from "@manent/schema";
import { OWNER_CAPABILITIES } from "@manent/server-core";
import type { Home } from "@manent/storage";
import type { MemoryStorage } from "@manent/storage/testing";
import type { ServerVersions } from "@manent/sync-protocol";
import { DOC, MARKER } from "./device.ts";
import type { Device } from "./device.ts";

export const HOME: Home = Object.freeze({
  kind: "project",
  id: "6f1c2d3e-4b5a-4c6d-8e7f-90a1b2c3d4e5",
});
/** Who wrote the seed. */
const SEED_CLIENT_ID = 1;

const SEED_SCENES: readonly (readonly [string, string][])[] = [
  [
    ["scene_heading", "EXT. HARBOUR WALL - DAWN"],
    ["action", "Gulls wheel over the empty moorings."],
    ["action", "A rope lies coiled where a boat should be."],
  ],
  [
    ["scene_heading", "INT. NET LOFT - DAY"],
    ["action", "Nets hang drying from the rafters."],
    ["action", "Someone has left the lamp burning."],
  ],
];

interface Flat {
  id: string;
  text: string;
  json: BlockJSON;
}

function flatBlocks(doc: CrdtDoc): Flat[] {
  const sections = scriptBody(doc).materialize().content ?? [];
  return sections
    .flatMap((section) => section.content ?? [])
    .flatMap((json) => {
      const id = json.attrs?.id;
      const text = (json.content ?? []).map((run) => run.text).join("");
      return typeof id === "string" ? [{ id, text, json }] : [];
    });
}

function block(
  id: string,
  type: string,
  text: string,
  from: string | null = null,
): BlockJSON {
  return {
    type: "block",
    attrs: { id, type, from },
    content: text === "" ? [] : [{ type: "text", text }],
  };
}

/** Placed in HOME, every user an editor, the seed's two scenes the log's first row. */
export function seedScript(
  storage: MemoryStorage,
  users: readonly string[],
  versions: ServerVersions,
  ids: IdSource,
): void {
  const [owner, ...editors] = users;
  if (owner === undefined)
    throw new RangeError("a world needs at least one user");
  const { directory } = storage;
  directory.place(DOC, HOME, "script", owner);
  const { log } = storage.open(HOME);
  const { schema, engine } = versions.current;
  log.create({
    id: DOC,
    kind: "script",
    ownerUserId: null,
    schemaVersion: schema,
    engineVersion: engine,
  });
  directory.setRole(DOC, owner, "owner", OWNER_CAPABILITIES);
  for (const userId of editors) directory.setRole(DOC, userId, "edit", []);
  const doc = createDoc({ clientId: SEED_CLIENT_ID });
  for (const scene of SEED_SCENES) {
    const after = flatBlocks(doc).at(-1)?.id ?? null;
    const blocks = scene.map(([type, text]) => block(ids(), type, text));
    scriptBody(doc).write((w) => w.insertBlocks(after, blocks));
  }
  const update = doc.encodeState();
  const clocks = updateMeta(update).map(({ clientId, toClock }) => ({
    clientId,
    clock: toClock,
  }));
  const origin = "system";
  log.append({
    docId: DOC,
    generation: 1,
    update,
    userId: owner,
    origin,
    clocks,
  });
  doc.destroy();
}

/** Where a marker may go without cutting another: the ends, and just after each marker. */
function boundaries(text: string): number[] {
  const after = [...text.matchAll(MARKER)].map((m) => m.index + m[0].length);
  return [...new Set([0, ...after, text.length])];
}

export interface Tools {
  rng: Rng;
  ids: IdSource;
}

type Action = (device: Device, blocks: readonly Flat[], tools: Tools) => void;

const ELEMENTS = ["action", "dialogue", "character", "scene_heading"] as const;

const newBlock: Action = (device, blocks, { rng, ids }) => {
  const after =
    blocks.length === 0 || rng.next() < 0.2 ? null : rng.pick(blocks).id;
  const typed = block(ids(), rng.pick(ELEMENTS), device.nextMarker());
  device.write((w) => w.insertBlocks(after, [typed]));
};

const typeInto: Action = (device, blocks, { rng }) => {
  const { id, text } = rng.pick(blocks);
  const offset = rng.pick(boundaries(text));
  const marker = device.nextMarker();
  device.write((w) => w.insertText(id, offset, marker));
};

const deleteBlock: Action = (device, blocks, { rng }) => {
  const { id } = rng.pick(blocks);
  device.write((w) => w.deleteBlock(id));
};

/** The tail after a boundary moves to a new block that names this one as its origin. */
const split: Action = (device, blocks, { rng, ids }) => {
  const { id, text } = rng.pick(blocks);
  const at = rng.pick(boundaries(text));
  const tail = block(ids(), "action", text.slice(at), formatFrom(id, ids()));
  device.write((w) => {
    if (at < text.length) w.deleteText(id, at, text.length - at);
    w.insertBlocks(id, [tail]);
  });
};

/** Two to five blocks in a row are cut and pasted elsewhere under the same ids. */
const moveScene: Action = (device, blocks, tools) => {
  const { rng } = tools;
  if (blocks.length < 3) return typeInto(device, blocks, tools);
  const length = rng.int(2, Math.min(5, blocks.length - 1));
  const start = rng.int(0, blocks.length - length);
  const scene = blocks.slice(start, start + length);
  const moved = new Set(scene.map((b) => b.id));
  const others = blocks.map((b) => b.id).filter((id) => !moved.has(id));
  const target = rng.pick([null, ...others]);
  device.write((w) => {
    for (const { id } of scene) w.deleteBlock(id);
    w.insertBlocks(
      target,
      scene.map((b) => b.json),
    );
  });
};

const toggleOnline: Action = (device) => device.online(!device.wanted);

/** Each action and its weight. */
const ACTIONS: readonly (readonly [number, Action])[] = Object.freeze([
  [5, toggleOnline],
  [30, newBlock],
  [25, typeInto],
  [12, deleteBlock],
  [14, split],
  [14, moveScene],
]);
const ACTION_WEIGHT = ACTIONS.reduce((sum, [weight]) => sum + weight, 0);

/** One random action of `device`; a script with no block gets one. */
export function actOn(device: Device, tools: Tools): void {
  const blocks = flatBlocks(device.handle.doc());
  let roll = tools.rng.next() * ACTION_WEIGHT;
  const rolled = ACTIONS.find(([weight]) => {
    roll -= weight;
    return roll < 0;
  });
  const action =
    blocks.length === 0 || rolled === undefined ? newBlock : rolled[1];
  action(device, blocks, tools);
}
