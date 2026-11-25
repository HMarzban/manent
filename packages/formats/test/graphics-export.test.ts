import { expect, test } from "bun:test";
import { paginate, profileFor, toLayoutBlock } from "@manent/pagination";
import type { FontFaceKey } from "@manent/pagination";
import { viewOf } from "@manent/pagination/testing";
import type { BlockJSON, GraphicAttrs } from "@manent/schema";
import { unzipSync, zlibSync } from "fflate";
import {
  findMissingPdfAssets,
  writeArchive,
  writeBracketsList,
  writeFdx,
  writeFountain,
  writePdf,
  writeVarietyTwoColumnPdf,
} from "../src/index.ts";
import type {
  PdfAsset,
  RundownForExport,
  ScriptFontFiles,
} from "../src/index.ts";
import { readPdf } from "./read-pdf.ts";

const sp = profileFor("screenplay")!;
const SHA_PNG = "1".repeat(64);
const SHA_JPG = "2".repeat(64);
const SHA_MISSING = "3".repeat(64);

const woff = (key: FontFaceKey) =>
  Bun.file(
    Bun.resolveSync(
      `@fontsource/courier-prime/files/courier-prime-${key}.woff`,
      import.meta.dir,
    ),
  ).bytes();

async function loadFonts(): Promise<ScriptFontFiles> {
  return {
    "latin-400-normal": await woff("latin-400-normal"),
    "latin-400-italic": await woff("latin-400-italic"),
    "latin-700-normal": await woff("latin-700-normal"),
    "latin-700-italic": await woff("latin-700-italic"),
    "latin-ext-400-normal": await woff("latin-ext-400-normal"),
    "latin-ext-400-italic": await woff("latin-ext-400-italic"),
    "latin-ext-700-normal": await woff("latin-ext-700-normal"),
    "latin-ext-700-italic": await woff("latin-ext-700-italic"),
  };
}

const fonts = await loadFonts();

/** Builds a valid 1x1 RGB PNG byte array using pure JS + fflate zlibSync. */
function make1x1Png(): Uint8Array<ArrayBuffer> {
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1)
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc32 = (data: Uint8Array): number => {
    let c = 0xffffffff;
    for (const byte of data) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, payload: Uint8Array): Uint8Array => {
    const out = new Uint8Array(12 + payload.byteLength);
    const view = new DataView(out.buffer);
    view.setUint32(0, payload.byteLength, false);
    for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
    out.set(payload, 8);
    view.setUint32(
      8 + payload.byteLength,
      crc32(out.subarray(4, 8 + payload.byteLength)),
      false,
    );
    return out;
  };
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, 1, false);
  ihdrView.setUint32(4, 1, false);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const idat = zlibSync(new Uint8Array([0, 200, 100, 50]));
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.byteLength, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
}

/** Minimal valid 1x1 baseline JPEG bytes (accepted by PDFKit JPEG parser). */
const MINIMAL_JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01,
  0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x03,
  0x02, 0x02, 0x03, 0x02, 0x02, 0x03, 0x03, 0x03, 0x03, 0x04, 0x03, 0x03, 0x04,
  0x05, 0x08, 0x05, 0x05, 0x04, 0x04, 0x05, 0x0a, 0x07, 0x07, 0x06, 0x08, 0x0c,
  0x0a, 0x0c, 0x0c, 0x0b, 0x0a, 0x0b, 0x0b, 0x0d, 0x0e, 0x12, 0x10, 0x0d, 0x0e,
  0x11, 0x0e, 0x0b, 0x0b, 0x10, 0x16, 0x10, 0x11, 0x13, 0x14, 0x15, 0x15, 0x15,
  0x0c, 0x0f, 0x17, 0x18, 0x16, 0x14, 0x18, 0x12, 0x14, 0x15, 0x14, 0xff, 0xc0,
  0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4,
  0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x09, 0xff, 0xc4, 0x00, 0x14, 0x10, 0x01,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
  0x37, 0xff, 0xd9,
]);

const PNG_BYTES = make1x1Png();

function sampleGraphic(overrides: Partial<GraphicAttrs> = {}): GraphicAttrs {
  return {
    kind: "image",
    assetId: SHA_PNG,
    heightLines: 6,
    label: "Cue 1",
    alt: "Harbour skyline",
    aspectWidth: 1,
    aspectHeight: 1,
    ...overrides,
  };
}

test("writePdf embeds PNG and JPEG graphics deterministically, draws chyron badge, and falls back cleanly when offline", async () => {
  const blocks = [
    toLayoutBlock(
      viewOf({ id: "b000000000000001", type: "scene_heading" }, [
        "INT. STUDIO - NIGHT",
      ]),
    ),
    toLayoutBlock(
      viewOf(
        {
          id: "g000000000000001",
          type: "graphic",
          graphic: sampleGraphic({
            kind: "lower_third",
            assetId: SHA_PNG,
            label: "GFX 1",
          }),
        },
        ["Dana Chen — Lead Anchor"],
      ),
    ),
    toLayoutBlock(
      viewOf(
        {
          id: "g000000000000002",
          type: "graphic",
          graphic: sampleGraphic({
            kind: "image",
            assetId: SHA_JPG,
            label: "Still 2",
          }),
        },
        ["Exterior view"],
      ),
    ),
    toLayoutBlock(
      viewOf(
        {
          id: "g000000000000003",
          type: "graphic",
          graphic: sampleGraphic({
            kind: "ots",
            assetId: SHA_MISSING,
            label: "Cue 3",
            alt: "Map not synced yet",
          }),
        },
        ["Offline map caption"],
      ),
    ),
  ];
  const p = paginate(blocks, sp);
  const assets = new Map<string, PdfAsset>([
    [SHA_PNG, { mime: "image/png", bytes: PNG_BYTES }],
    [SHA_JPG, { mime: "image/jpeg", bytes: MINIMAL_JPEG }],
  ]);

  expect(findMissingPdfAssets(p, assets)).toEqual([
    { blockId: "g000000000000003", assetId: SHA_MISSING },
  ]);

  const pdfA = await writePdf(p, { fonts, assets, title: "Broadcast Script" });
  const pdfB = await writePdf(p, { fonts, assets, title: "Broadcast Script" });
  // deterministic PDF output
  expect(pdfA).toEqual(pdfB);

  // Embedded image XObjects exist in PDF stream
  const pdfAscii = new TextDecoder("latin1").decode(pdfA);
  expect(pdfAscii).toContain("/Subtype /Image");

  // Extracted text includes chyron badge, captions, and offline placeholder text
  const pages = await readPdf(pdfA);
  expect(pages).toHaveLength(1);
  const text = pages[0]!.lines.map((l) => l.text).join("\n");
  expect(text).toContain("LOWER THIRD");
  expect(text).toContain("Dana Chen");
  expect(text).toContain("OTS");
  expect(text).toContain("Cue 3");
  expect(text).toContain("Map not synced yet");
  expect(text).toContain("Offline map caption");
});

test("writeVarietyTwoColumnPdf places graphics in the left column and writeBracketsList includes graphic cues", async () => {
  const storyBlocks: BlockJSON[] = [
    {
      type: "block",
      attrs: { id: "s000000000000001", type: "slug" },
      content: [{ type: "text", text: "OPENING" }],
    },
    {
      type: "block",
      attrs: {
        id: "g000000000000001",
        type: "graphic",
        graphic: sampleGraphic({
          kind: "lower_third",
          assetId: SHA_PNG,
          label: "Cue 1",
        }),
      },
      content: [{ type: "text", text: "Dana Chen" }],
    },
    {
      type: "block",
      attrs: { id: "c000000000000001", type: "character" },
      content: [{ type: "text", text: "DANA" }],
    },
    {
      type: "block",
      attrs: { id: "d000000000000001", type: "dialogue" },
      content: [{ type: "text", text: "Welcome to the broadcast." }],
    },
  ];
  const rundown: RundownForExport = {
    title: "Evening News",
    airDate: "2026-11-26",
    columns: [
      { id: "segment", label: "Segment" },
      { id: "story", label: "Story" },
    ],
    rows: [
      {
        kind: "story",
        number: 1,
        cells: { segment: "Top", story: "Opening" },
        story: {
          title: "Opening",
          blocks: storyBlocks,
          pages: paginate([], sp),
        },
      },
    ],
  };

  const assets = new Map<string, PdfAsset>([
    [SHA_PNG, { mime: "image/png", bytes: PNG_BYTES }],
  ]);
  const twoCol = await writeVarietyTwoColumnPdf(rundown, {
    paper: "letter",
    fonts,
    assets,
  });
  expect(new TextDecoder("latin1").decode(twoCol)).toContain("/Subtype /Image");
  const pages = await readPdf(twoCol);
  const text = pages[0]!.lines.map((l) => l.text).join("\n");
  expect(text).toContain("LOWER THIRD");
  expect(text).toContain("Dana Chen");
  expect(text).toContain("Welcome to the broadcast.");

  const bracketsTsv = writeBracketsList(rundown);
  expect(bracketsTsv).toBe("1\tOPENING\t[LOWER THIRD] Cue 1 — Dana Chen\t—\n");
});

test("writeFdx and writeFountain emit bracketed graphic cue fallbacks and non-blocking leftOut notices", () => {
  const blocks: BlockJSON[] = [
    {
      type: "block",
      attrs: { id: "b000000000000001", type: "scene_heading" },
      content: [{ type: "text", text: "INT. DESK - NIGHT" }],
    },
    {
      type: "block",
      attrs: {
        id: "g000000000000001",
        type: "graphic",
        graphic: sampleGraphic({ kind: "lower_third", label: "Cue 1" }),
      },
      content: [{ type: "text", text: "Dana Chen — Anchor" }],
    },
  ];
  const script = {
    title: "News Show",
    format: "variety" as const,
    blocks,
    notes: [],
    record: null,
    production: null,
  };

  const fdx = writeFdx(script);
  expect(fdx.text).toContain("[GRAPHIC: Cue 1 — Dana Chen — Anchor]");
  expect(fdx.leftOut).toEqual([
    {
      id: "w1",
      kind: "element_type",
      from: "fdx",
      of: "g000000000000001",
      name: "Graphic",
      value: "graphic",
    },
  ]);

  const fountain = writeFountain(script);
  expect(fountain.text).toContain("[GRAPHIC: Cue 1 — Dana Chen — Anchor]");
  expect(fountain.leftOut).toEqual([
    {
      id: "k1",
      kind: "element_type",
      from: "fountain",
      of: "g000000000000001",
      name: "Graphic",
      value: "",
    },
  ]);
});

test("writeArchive bundles deduplicated assets under assets/<id>.<ext> and records them in manifest.json", () => {
  const script = {
    title: "Episode 1",
    format: "screenplay" as const,
    blocks: [
      {
        type: "block" as const,
        attrs: { id: "b000000000000001", type: "action" },
        content: [{ type: "text" as const, text: "Fade in." }],
      },
    ],
    notes: [],
    record: null,
    production: null,
  };

  // Without assets: manifest has no assets property
  const withoutAssets = unzipSync(
    writeArchive({
      project: "Show",
      exportedAt: 1_700_000_000_000,
      documents: [{ docId: "d1", script, drafts: [] }],
    }),
  );
  const manifestWithout = JSON.parse(
    new TextDecoder().decode(withoutAssets["manifest.json"]),
  );
  expect("assets" in manifestWithout).toBe(false);

  // With assets (unsorted + duplicate): sorted & deduplicated in zip and manifest
  const withAssets = unzipSync(
    writeArchive({
      project: "Show",
      exportedAt: 1_700_000_000_000,
      documents: [{ docId: "d1", script, drafts: [] }],
      assets: [
        {
          assetId: SHA_JPG,
          mime: "image/jpeg",
          width: 1,
          height: 1,
          bytes: MINIMAL_JPEG,
        },
        {
          assetId: SHA_PNG,
          mime: "image/png",
          width: 1,
          height: 1,
          bytes: PNG_BYTES,
        },
        {
          assetId: SHA_PNG,
          mime: "image/png",
          width: 1,
          height: 1,
          bytes: PNG_BYTES,
        },
      ],
    }),
  );
  expect(withAssets[`assets/${SHA_PNG}.png`]).toEqual(PNG_BYTES);
  expect(withAssets[`assets/${SHA_JPG}.jpg`]).toEqual(MINIMAL_JPEG);
  const manifestWith = JSON.parse(
    new TextDecoder().decode(withAssets["manifest.json"]),
  );
  expect(manifestWith.v).toBe(1);
  expect(manifestWith.assets).toEqual([
    {
      assetId: SHA_PNG,
      path: `assets/${SHA_PNG}.png`,
      mime: "image/png",
      byteLength: PNG_BYTES.byteLength,
      width: 1,
      height: 1,
    },
    {
      assetId: SHA_JPG,
      path: `assets/${SHA_JPG}.jpg`,
      mime: "image/jpeg",
      byteLength: MINIMAL_JPEG.byteLength,
      width: 1,
      height: 1,
    },
  ]);
});
