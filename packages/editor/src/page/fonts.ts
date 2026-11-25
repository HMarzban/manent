// The script's four faces in their two subsets, and how the page waits for them.

import latin400Italic from "@fontsource/courier-prime/files/courier-prime-latin-400-italic.woff2";
import latin400Normal from "@fontsource/courier-prime/files/courier-prime-latin-400-normal.woff2";
import latin700Italic from "@fontsource/courier-prime/files/courier-prime-latin-700-italic.woff2";
import latin700Normal from "@fontsource/courier-prime/files/courier-prime-latin-700-normal.woff2";
import latinExt400Italic from "@fontsource/courier-prime/files/courier-prime-latin-ext-400-italic.woff2";
import latinExt400Normal from "@fontsource/courier-prime/files/courier-prime-latin-ext-400-normal.woff2";
import latinExt700Italic from "@fontsource/courier-prime/files/courier-prime-latin-ext-700-italic.woff2";
import latinExt700Normal from "@fontsource/courier-prime/files/courier-prime-latin-ext-700-normal.woff2";
import { FONT_FACE_KEYS, fontRanges } from "@manent/pagination";
import type { FontFaceKey } from "@manent/pagination";
import { FONT_WAIT_MS } from "./config.ts";

/** Each face's `.woff2` file: its built URL in a bundle, its path under Bun. */
export const FONT_URLS: Readonly<Record<FontFaceKey, string>> = Object.freeze({
  "latin-400-normal": latin400Normal,
  "latin-400-italic": latin400Italic,
  "latin-700-normal": latin700Normal,
  "latin-700-italic": latin700Italic,
  "latin-ext-400-normal": latinExt400Normal,
  "latin-ext-400-italic": latinExt400Italic,
  "latin-ext-700-normal": latinExt700Normal,
  "latin-ext-700-italic": latinExt700Italic,
});

export interface FaceDescriptor {
  readonly key: FontFaceKey;
  readonly family: "Courier Prime";
  /** The file's URL, as `FONT_URLS` holds it. */
  readonly source: string;
  readonly weight: "400" | "700";
  readonly style: "normal" | "italic";
  readonly unicodeRange: string;
  readonly display: "block";
}

function hex(codePoint: number): string {
  return codePoint.toString(16).toUpperCase();
}

/** CSS `unicode-range` text of inclusive pairs of code points: [0x20, 0x7e, 0x131, 0x131] is "U+20-7E, U+131". */
export function toUnicodeRange(ranges: readonly number[]): string {
  const parts: string[] = [];
  for (let i = 0; i + 1 < ranges.length; i += 2) {
    const first = ranges[i]!;
    const last = ranges[i + 1]!;
    parts.push(
      first === last ? `U+${hex(first)}` : `U+${hex(first)}-${hex(last)}`,
    );
  }
  return parts.join(", ");
}

function isExtended(key: FontFaceKey): boolean {
  return key.startsWith("latin-ext-");
}

/** The eight faces in `FONT_FACE_KEYS` order, each subset limited to the code points its font file holds. */
export function faceDescriptors(
  latin: readonly number[],
  latinExt: readonly number[],
): FaceDescriptor[] {
  const latinRange = toUnicodeRange(latin);
  const latinExtRange = toUnicodeRange(latinExt);
  return FONT_FACE_KEYS.map((key) => ({
    key,
    family: "Courier Prime",
    source: FONT_URLS[key],
    weight: key.includes("-700-") ? "700" : "400",
    style: key.endsWith("-italic") ? "italic" : "normal",
    unicodeRange: isExtended(key) ? latinExtRange : latinRange,
    display: "block",
  }));
}

export interface LoadableFace {
  load(): Promise<unknown>;
}

/** `document.fonts` fits. */
export interface FontSet {
  add(face: LoadableFace): unknown;
}

function fallback(): "fallback" {
  return "fallback";
}

interface CachedFace {
  readonly face: LoadableFace;
  load: Promise<unknown> | null;
  state: "pending" | "ready";
}

// per-FontSet cache so repeated opens and rebuilds never append duplicate FontFace objects to document.fonts
const faceCache = new WeakMap<FontSet, Map<FontFaceKey, CachedFace>>();

const LATIN_KEYS: readonly FontFaceKey[] = FONT_FACE_KEYS.filter(
  (key) => !isExtended(key),
);

let defaultFaces: readonly FaceDescriptor[] | null = null;
function scriptFaces(): readonly FaceDescriptor[] {
  return (defaultFaces ??= faceDescriptors(
    fontRanges("latin"),
    fontRanges("latin-ext"),
  ));
}

/** True once every `latin` Courier Prime face has loaded into `fonts`. */
export function scriptFontsReady(fonts: FontSet): boolean {
  const cached = faceCache.get(fonts);
  if (cached === undefined) return false;
  return LATIN_KEYS.every((key) => cached.get(key)?.state === "ready");
}

/**
 * Adds every face once per `fonts` set and loads the four `latin` ones. "ready" when all four have loaded;
 * "fallback" when one fails or the wait ends first, so the page is drawn in a fallback face. Never rejects.
 */
export function loadScriptFonts(options: {
  fonts: FontSet;
  makeFace: (d: FaceDescriptor) => LoadableFace;
  faces: readonly FaceDescriptor[];
  wait: (ms: number) => Promise<void>;
  waitMs?: number;
}): Promise<"ready" | "fallback"> {
  let cached = faceCache.get(options.fonts);
  if (cached === undefined) {
    cached = new Map();
    faceCache.set(options.fonts, cached);
  }
  const loads: Promise<unknown>[] = [];
  for (const descriptor of options.faces) {
    let entry = cached.get(descriptor.key);
    if (entry === undefined) {
      const face = options.makeFace(descriptor);
      options.fonts.add(face);
      entry = { face, load: null, state: "pending" };
      cached.set(descriptor.key, entry);
    }
    if (isExtended(descriptor.key) || entry.state === "ready") continue;
    let load = entry.load;
    if (load === null) {
      const target = entry;
      const key = descriptor.key;
      const cache = cached;
      load = target.face.load().then(
        (value) => {
          target.state = "ready";
          return value;
        },
        (cause: unknown) => {
          if (cache.get(key) === target) cache.delete(key);
          throw cause;
        },
      );
      // prevent unhandled rejection if a race times out before load rejects
      void load.catch(() => {});
      target.load = load;
    }
    loads.push(load);
  }
  if (loads.length === 0) return Promise.resolve("ready");
  const loaded = Promise.all(loads).then((): "ready" => "ready", fallback);
  const waited = options
    .wait(options.waitMs ?? FONT_WAIT_MS)
    .then(fallback, fallback);
  return Promise.race([loaded, waited]);
}

/** Starts loading Courier Prime into `ports.fonts` early so the first page opens without waiting on font fetch. */
export function preloadScriptFonts(ports: {
  readonly fonts: FontSet;
  readonly makeFace: (d: FaceDescriptor) => LoadableFace;
  readonly wait: (ms: number) => Promise<void>;
}): Promise<"ready" | "fallback"> {
  if (scriptFontsReady(ports.fonts)) return Promise.resolve("ready");
  return loadScriptFonts({
    fonts: ports.fonts,
    makeFace: ports.makeFace,
    faces: scriptFaces(),
    wait: ports.wait,
  });
}
