import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import {
  loadDoc,
  scriptBody,
  scriptDocFromJSON,
  scriptSettings,
} from "@manent/crdt";
import { canonicalBlock } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import type { DocFile, VersionRow } from "@manent/storage";
import { createMemoryStorage } from "@manent/storage/testing";
import type { LockAnchorRecord, VersionContent } from "@manent/sync-protocol";
import fc from "fast-check";
import {
  carryAuthors,
  contentAt,
  contentOfDoc,
  liveChunkHashes,
  materializeVersion,
  readSnapshot,
  writeSnapshot,
} from "../src/index.ts";
import { BLOCK, DOC, HOME, appendAll, createTypist, seedLog } from "./seed.ts";
import { ALICE_CLIENT, createWorld, pushOf, setOf } from "./write-world.ts";

const H1 = "heading-0000001";
const A = "action-00000001";

const PINNED_CHUNK =
  "ea18d7aa185e89bfd007a58acfe76ebca593003b5605fda391f9d4cb6f290c16";
const PINNED_CHUNK_TEXT =
  '{"blocks":[' +
  '{"type":"block","attrs":{"id":"heading-0000001","type":"scene_heading","omitted":false,"synopsis":"","noContd":false,"noTiming":false},' +
  '"content":[{"type":"text","text":"INT. KITCHEN"}]},' +
  '{"type":"block","attrs":{"id":"action-00000001","type":"action","omitted":false,"synopsis":"","noContd":false,"noTiming":false},' +
  '"content":[{"type":"text","text":"Rain."}]}]}';
const PINNED_REF =
  "36e6e1b8e3e63b89878eb8bd0462a1a339c2e786edbf9a978a25eaf0d80597e9";
const PINNED_MANIFEST_TEXT =
  '{"v":1,"chunks":["ea18d7aa185e89bfd007a58acfe76ebca593003b5605fda391f9d4cb6f290c16"],' +
  '"settings":{"script.paper":"a4"},"schemaVersion":1,"engineVersion":1,"locks":null,' +
  '"authors":{"action-00000001":{"userId":"sam","at":5}}}';

const ANCHOR: LockAnchorRecord = {
  level: 1,
  order: 0,
  label: "12A",
  blockId: A,
  offset: 3,
  quote: "Rain",
  fallbackIds: [H1],
  source: "lock",
};

/** One block in canonical form: an action unless `attrs` says otherwise. */
const b = (
  id: string,
  text: string,
  attrs: Record<string, unknown> = {},
): BlockJSON =>
  canonicalBlock({
    type: "block",
    attrs: { id, type: "action", ...attrs },
    content: [{ type: "text", text }],
  });

const hex = (ref: string): Uint8Array => Uint8Array.fromHex(ref);

const contentWith = (
  blocks: BlockJSON[],
  more: Partial<VersionContent> = {},
): VersionContent => ({
  v: 1,
  blocks,
  settings: {},
  schemaVersion: 1,
  engineVersion: 1,
  locks: null,
  authors: {},
  ...more,
});

/** `scenes` scenes of a heading and an action each; the action of scene `changed` reads differently. */
function script(scenes: number, changed = -1): BlockJSON[] {
  return Array.from({ length: scenes }, (_, i) => [
    b(`heading-${String(i).padStart(8, "0")}`, `INT. ROOM ${i} - DAY`, {
      type: "scene_heading",
    }),
    b(
      `action-${String(i).padStart(9, "0")}`,
      i === changed ? "The kettle sings." : "The kettle waits.",
    ),
  ]).flat();
}

function emptyFile(): DocFile {
  return createMemoryStorage({ now: () => 0 }).open(HOME);
}

/** The thrown value of `fn`, which must throw. */
function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new RangeError("it did not throw");
}

const version = (
  id: string,
  at: { generation: number; seq: number } | null,
): VersionRow => ({
  id,
  docId: DOC,
  generation: at?.generation ?? null,
  seq: at?.seq ?? null,
  kind: "auto",
  name: null,
  createdByUserId: "sam",
  createdAt: 10,
  deviceId: null,
});

test("a snapshot is stored as these bytes", () => {
  const file = emptyFile();
  const content: VersionContent = {
    v: 1,
    blocks: [b(H1, "INT. KITCHEN", { type: "scene_heading" }), b(A, "Rain.")],
    settings: { "script.paper": "a4" },
    schemaVersion: 1,
    engineVersion: 1,
    locks: null,
    authors: { [A]: { userId: "sam", at: 5 } },
  };
  const ref = writeSnapshot(file, content);
  expect(ref).toBe(PINNED_REF);
  expect(
    new TextDecoder().decode(inflateRawSync(file.history.chunk(hex(ref))!)),
  ).toBe(PINNED_MANIFEST_TEXT);
  expect(
    new TextDecoder().decode(
      inflateRawSync(file.history.chunk(hex(PINNED_CHUNK))!),
    ),
  ).toBe(PINNED_CHUNK_TEXT);
  expect(
    file.history
      .chunkHashes()
      .map((hash) => hash.toHex())
      .toSorted(),
  ).toEqual([PINNED_REF, PINNED_CHUNK]);
  expect(readSnapshot(file, ref)).toEqual(content);
});

test("two versions one scene apart share every other chunk", () => {
  const file = emptyFile();
  const first = contentWith(script(40));
  const second = contentWith(script(40, 17));
  const firstRef = writeSnapshot(file, first);
  expect(file.history.chunkHashes().length).toBe(41);
  const secondRef = writeSnapshot(file, second);
  expect(file.history.chunkHashes().length).toBe(43);
  expect(readSnapshot(file, firstRef)).toEqual(first);
  expect(readSnapshot(file, secondRef)).toEqual(second);
});

test("a damaged chunk is refused, never read as another version", () => {
  const file = emptyFile();
  const ref = writeSnapshot(file, contentWith(script(3)));
  const other = writeSnapshot(file, contentWith(script(3, 1)));
  // the manifest of one version stored under the hash of the other
  const body = file.history.chunk(hex(other))!;
  file.history.removeChunks([hex(ref)]);
  file.history.putChunk(hex(ref), body);
  expect(thrownBy(() => readSnapshot(file, ref))).toMatchObject({
    name: "StorageError",
    code: "corrupt",
  });
  file.history.removeChunks([hex(ref)]);
  expect(thrownBy(() => readSnapshot(file, ref))).toMatchObject({
    name: "StorageError",
    code: "corrupt",
  });
  expect(readSnapshot(file, other)).toEqual(contentWith(script(3, 1)));
});

test("a log position is materialised from its checkpoint and the rows after it", () => {
  // 3,000 typed updates through the write path; checkpoint at 2,000; versions at 1,500 and 2,800
  const world = createWorld();
  const { path, room, subA, clock, storage } = world;
  const typist = createTypist(ALICE_CLIENT);
  const recorded = new Map<number, BlockJSON[]>();
  const blocksAtSeq = (seq: number): BlockJSON[] => recorded.get(seq)!;
  for (let n = 1; n <= 3_000; n++) {
    const update =
      n === 1 ? typist.insertBlock(BLOCK, null, "a") : typist.type(BLOCK, "b");
    path.push(room, subA, pushOf(n, update));
    if (n === 1_500 || n === 2_800)
      recorded.set(
        n,
        (scriptBody(typist.doc).materialize().content ?? [])
          .flatMap((s) => s.content ?? [])
          .map(canonicalBlock),
      );
    if (n === 2_000) clock.runDeferred();
  }
  clock.runDeferred();
  const file = storage.open(HOME);
  expect(file.checkpoints.atOrBefore(DOC, 1, 2_800)?.seq).toBe(2_000);
  // a row before the checkpoint is never read
  storage.corruptRow(DOC, 2_000);
  expect(contentAt(file, DOC, { generation: 1, seq: 2_800 })!.blocks).toEqual(
    blocksAtSeq(2_800),
  );
  expect(contentAt(file, DOC, { generation: 1, seq: 9_999 })).toBeNull();
  const early = version("v-1500", { generation: 1, seq: 1_500 });
  const late = version("v-2800", { generation: 1, seq: 2_800 });
  expect(materializeVersion(file, early)!.blocks).toEqual(blocksAtSeq(1_500));
  expect(materializeVersion(file, late)!.blocks).toEqual(blocksAtSeq(2_800));
  expect(materializeVersion(file, version("v-device", null))).toBeNull();
  // a row in reach that does not verify is never skipped
  storage.corruptRow(DOC, 2_500);
  expect(
    thrownBy(() => contentAt(file, DOC, { generation: 1, seq: 2_800 })),
  ).toMatchObject({ name: "StorageError", code: "corrupt" });
});

test("a version made before a rebuild is materialised from its own generation", () => {
  const storage = createMemoryStorage({ now: () => 0 });
  const typist = seedLog(storage, 20);
  const file = storage.open(HOME);
  const before = version("v-before", { generation: 1, seq: 20 });
  const typed = [b(BLOCK, "1234567890123456789")];
  // the move to generation 2: its first row is the same blocks written afresh, then more typing
  const rebuilt = scriptDocFromJSON(scriptBody(typist.doc).materialize(), {
    clientId: 9_009,
  });
  file.generations.freeze({
    docId: DOC,
    finalSeq: 20,
    finalState: typist.doc.encodeState(),
    frozenAt: 0,
    purgeAfter: 1_000,
    reason: "requested",
    initialUpdate: rebuilt.encodeState(),
    rebuiltByClientId: 9_009,
    userId: "system",
  });
  file.log.append({
    docId: DOC,
    generation: 2,
    update: createTypist(ALICE_CLIENT).insertBlock("block-in-gen-2", null, "x"),
    userId: "sam",
    origin: "edit",
    clocks: [],
  });
  expect(materializeVersion(file, before)!.blocks).toEqual(typed);
  expect(contentAt(file, DOC, { generation: 1, seq: 21 })).toBeNull();
  expect(
    contentAt(file, DOC, { generation: 2, seq: 2 })!.blocks.map(
      (block) => block.attrs?.id,
    ),
  ).toEqual(["block-in-gen-2", BLOCK]);
  // once its log is purged, a position in it is gone
  file.history.purgeLog(DOC, 1);
  expect(materializeVersion(file, before)).toBeNull();
});

test("a version carries the settings and the versions it was made with", () => {
  const { path, room, subA, clock, storage } = createWorld();
  path.push(
    room,
    subA,
    pushOf(1, createTypist(ALICE_CLIENT).insertBlock(BLOCK, null, "Rain.")),
  );
  path.set(room, subA, setOf(2, "script.paper", "a4"));
  path.set(room, subA, setOf(3, "script.font", "courier"));
  clock.runDeferred();
  storage.open(HOME).log.raiseSchema(DOC, 2);
  const file = storage.open(HOME);
  const at = contentAt(file, DOC, { generation: 1, seq: 3 })!;
  expect(at).toEqual({
    v: 1,
    blocks: [b(BLOCK, "Rain.")],
    settings: { "script.font": "courier", "script.paper": "a4" },
    schemaVersion: 2,
    engineVersion: 0,
    locks: null,
    authors: {},
  });
  expect(Object.keys(at.settings)).toEqual(["script.font", "script.paper"]);
  const locked = { ...at, locks: [ANCHOR] };
  expect(readSnapshot(file, writeSnapshot(file, locked))).toEqual(locked);
  const doc = loadDoc(room.doc!.encodeState());
  expect(scriptSettings(doc).entries()).toEqual(at.settings);
  expect(
    contentOfDoc(doc, file.log.get(DOC)!, {
      [BLOCK]: { userId: "sam", at: 7 },
    }),
  ).toEqual({ ...at, authors: { [BLOCK]: { userId: "sam", at: 7 } } });
});

test("a version's authors are those of the newest snapshot before it, and its own for what it changed", () => {
  const storage = createMemoryStorage({ now: () => 0 });
  const typist = seedLog(storage, 5);
  const file = storage.open(HOME);
  const named: VersionRow = {
    ...version("v-named", { generation: 1, seq: 5 }),
    kind: "named",
    name: "Table read draft",
  };
  file.versions.add(named);
  const atNamed = contentAt(file, DOC, { generation: 1, seq: 5 })!;
  file.history.setSnapshot(
    named.id,
    writeSnapshot(file, {
      ...atNamed,
      authors: { [BLOCK]: { userId: "dana", at: 3 } },
    }),
    0,
  );
  const unchanged = version("v-same", { generation: 1, seq: 5 });
  expect(materializeVersion(file, unchanged)!.authors).toEqual({
    [BLOCK]: { userId: "dana", at: 3 },
  });
  appendAll(storage, [typist.type(BLOCK, "!")]);
  const changed: VersionRow = {
    ...version("v-later", { generation: 1, seq: 6 }),
    createdByUserId: "ana",
    createdAt: 40,
  };
  file.versions.add(changed);
  expect(materializeVersion(file, changed)!.authors).toEqual({
    [BLOCK]: { userId: "ana", at: 40 },
  });
  file.history.setSummary(changed.id, {
    authorIds: ["leo"],
    blockIds: [BLOCK],
    sceneIds: [],
  });
  expect(materializeVersion(file, changed)!.authors).toEqual({
    [BLOCK]: { userId: "leo", at: 40 },
  });
  // a bare position keeps only what it knows
  expect(contentAt(file, DOC, { generation: 1, seq: 6 })!.authors).toEqual({});
});

test("every chunk a remaining manifest names is live", () => {
  const storage = createMemoryStorage({ now: () => 0 });
  seedLog(storage, 1);
  const file = storage.open(HOME);
  const kept = writeSnapshot(file, contentWith(script(2)));
  writeSnapshot(file, contentWith(script(2, 0)));
  file.versions.add(version("v-kept", null));
  file.history.setSnapshot("v-kept", kept, 1);
  const manifest: { chunks: string[] } = JSON.parse(
    new TextDecoder().decode(inflateRawSync(file.history.chunk(hex(kept))!)),
  );
  expect(liveChunkHashes(file, DOC)).toEqual(
    new Set([kept, ...manifest.chunks]),
  );
  expect(liveChunkHashes(file, DOC).size).toBe(3);
});

const id = fc.stringMatching(/^[A-Za-z0-9_-]{8,16}$/);
const runText = fc.string({ maxLength: 12 });
const block = fc
  .record({
    id,
    text: runText,
    type: fc.constantFrom("action", "scene_heading", "dialogue", "slug"),
    bold: fc.boolean(),
    extra: fc.option(fc.jsonValue(), { nil: undefined }),
  })
  .map(({ id: blockId, text: t, type, bold, extra }) =>
    canonicalBlock({
      type: "block",
      attrs:
        extra === undefined
          ? { id: blockId, type }
          : { id: blockId, type, future: extra },
      content:
        t === ""
          ? []
          : [
              {
                type: "text",
                text: t,
                ...(bold ? { marks: [{ type: "bold" }] } : {}),
              },
            ],
    }),
  );
const anchor = fc.record({
  level: fc.nat(),
  order: fc.nat(),
  label: runText,
  blockId: id,
  offset: fc.nat(),
  quote: runText,
  fallbackIds: fc.array(id, { maxLength: 2 }),
  source: fc.constantFrom("lock", "issue", "import"),
});
const versionContent = fc.record({
  v: fc.constant(1 as const),
  blocks: fc.array(block, { maxLength: 8 }),
  settings: fc.dictionary(runText, fc.jsonValue(), { maxKeys: 3 }),
  schemaVersion: fc.nat(),
  engineVersion: fc.option(fc.nat(), { nil: null }),
  locks: fc.option(fc.array(anchor, { maxLength: 2 }), { nil: null }),
  authors: fc.dictionary(id, fc.record({ userId: runText, at: fc.nat() }), {
    maxKeys: 3,
  }),
});

test("any version content is read back as it was written", () => {
  fc.assert(
    fc.property(versionContent, (written) => {
      const file = emptyFile();
      expect(readSnapshot(file, writeSnapshot(file, written))).toEqual(
        JSON.parse(JSON.stringify(written)),
      );
    }),
    { numRuns: 200 },
  );
});

test("a block whose id is __proto__ keeps its author", () => {
  const file = emptyFile();
  const blocks = [b("__proto__", "Rain.")];
  const written = contentWith(blocks, {
    authors: { ["__proto__"]: { userId: "sam", at: 5 } },
  });
  const ref = writeSnapshot(file, written);
  expect(Object.keys(readSnapshot(file, ref).authors)).toEqual(["__proto__"]);
  expect(readSnapshot(file, ref)).toEqual(written);
  const sam = { userId: "sam", at: 5 };
  expect(Object.entries(carryAuthors(written, blocks, null))).toEqual([
    ["__proto__", sam],
  ]);
  expect(carryAuthors(contentWith(blocks), blocks, null)).toEqual({});
});

/** A manifest of one chunk with one field replaced, stored under its own hash. */
function storedManifest(
  field: string,
  value: unknown,
): {
  file: DocFile;
  ref: string;
} {
  const file = emptyFile();
  const ref = writeSnapshot(file, contentWith(script(1), { locks: [ANCHOR] }));
  const manifest: Record<string, unknown> = JSON.parse(
    new TextDecoder().decode(inflateRawSync(file.history.chunk(hex(ref))!)),
  );
  const text = new TextEncoder().encode(
    JSON.stringify({ ...manifest, [field]: value }),
  );
  const hash = new Uint8Array(createHash("sha256").update(text).digest());
  file.history.putChunk(hash, deflateRawSync(text));
  return { file, ref: hash.toHex() };
}

test("a manifest that verifies but is not one this build writes is refused as damaged", () => {
  const fields = fc.constantFrom(
    "v",
    "chunks",
    "settings",
    "schemaVersion",
    "engineVersion",
    "locks",
    "authors",
  );
  const outcomes = new Set<string>();
  fc.assert(
    fc.property(fields, fc.jsonValue(), (field, value) => {
      const { file, ref } = storedManifest(field, value);
      try {
        readSnapshot(file, ref);
        outcomes.add("read");
      } catch (error) {
        expect(error).toMatchObject({ name: "StorageError", code: "corrupt" });
        outcomes.add("refused");
      }
    }),
    { numRuns: 300 },
  );
  expect([...outcomes].toSorted()).toEqual(["read", "refused"]);
  for (const [field, value] of [
    ["v", 2],
    ["chunks", ["not-a-hash"]],
    ["settings", []],
    ["schemaVersion", -1],
    ["engineVersion", 1.5],
    ["locks", [{ ...ANCHOR, source: "guess" }]],
    ["authors", { [A]: { userId: "sam" } }],
  ] as const) {
    const stored = storedManifest(field, value);
    expect(thrownBy(() => readSnapshot(stored.file, stored.ref))).toMatchObject(
      { name: "StorageError", code: "corrupt" },
    );
  }
});
