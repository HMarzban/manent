// Shared hex/RGB colour tables for Word (.docx) reading and writing.
import { nearestColour } from "../fdx/colours.ts";

type Rgb = readonly [number, number, number];

export const TEXT_COLOUR_HEX: Readonly<Record<string, string>> = Object.freeze({
  red: "B42318",
  orange: "B54708",
  green: "067647",
  blue: "175CD3",
  violet: "6941C6",
});

export const HIGHLIGHT_FILL_HEX: Readonly<Record<string, string>> =
  Object.freeze({
    yellow: "FEF08A",
    green: "BBF7D0",
    pink: "FBCFE8",
    orange: "FED7AA",
    violet: "DDD6FE",
  });

const TEXT_HEX_TO_NAME = new Map(
  Object.entries(TEXT_COLOUR_HEX).map(([name, hex]) => [
    hex.toUpperCase(),
    name,
  ]),
);

const HIGHLIGHT_HEX_TO_NAME = new Map(
  Object.entries(HIGHLIGHT_FILL_HEX).map(([name, hex]) => [
    hex.toUpperCase(),
    name,
  ]),
);

const TEXT_COLOUR_RGB: Readonly<Record<string, Rgb>> = Object.freeze({
  red: [0xb4, 0x23, 0x18],
  orange: [0xb5, 0x47, 0x08],
  green: [0x06, 0x76, 0x47],
  blue: [0x17, 0x5c, 0xd3],
  violet: [0x69, 0x41, 0xc6],
});

const HIGHLIGHT_RGB: Readonly<Record<string, Rgb>> = Object.freeze({
  yellow: [0xfe, 0xf0, 0x8a],
  green: [0xbb, 0xf7, 0xd0],
  pink: [0xfb, 0xcf, 0xe8],
  orange: [0xfe, 0xd7, 0xaa],
  violet: [0xdd, 0xd6, 0xfe],
});

const WORD_HIGHLIGHT_MAP: Readonly<Record<string, string>> = Object.freeze({
  yellow: "yellow",
  green: "green",
  magenta: "pink",
  red: "pink",
  darkyellow: "orange",
  cyan: "green",
  blue: "violet",
  darkmagenta: "violet",
});

const SIX_HEX = /^[0-9a-f]{6}$/i;

function parseHexRgb(raw: string): Rgb | null {
  const clean = raw.startsWith("#") ? raw.slice(1) : raw;
  if (!SIX_HEX.test(clean)) return null;
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
  ];
}

/** Maps a Word `<w:color w:val="..."/>` hex string to a Manent text colour name, or null for black/auto. */
export function mapWordTextColour(
  raw: string,
): { readonly name: string; readonly exact: boolean } | null {
  const upper = raw.trim().replace(/^#/, "").toUpperCase();
  if (upper === "" || upper === "AUTO" || upper === "000000") return null;
  const exact = TEXT_HEX_TO_NAME.get(upper);
  if (exact !== undefined) return { name: exact, exact: true };
  const rgb = parseHexRgb(upper);
  if (rgb === null) return null;
  const mapped = nearestColour(rgb, TEXT_COLOUR_RGB, [0, 0, 0]);
  return mapped.name === null ? null : { name: mapped.name, exact: false };
}

/** Maps a Word `<w:shd w:fill="..."/>` or `<w:highlight w:val="..."/>` value to a Manent highlight colour name. */
export function mapWordHighlight(
  raw: string,
): { readonly name: string; readonly exact: boolean } | null {
  const trimmed = raw.trim().replace(/^#/, "");
  const lower = trimmed.toLowerCase();
  if (
    lower === "" ||
    lower === "auto" ||
    lower === "none" ||
    lower === "ffffff"
  )
    return null;
  const exactHex = HIGHLIGHT_HEX_TO_NAME.get(trimmed.toUpperCase());
  if (exactHex !== undefined) return { name: exactHex, exact: true };
  if (Object.hasOwn(WORD_HIGHLIGHT_MAP, lower)) {
    const mapped = WORD_HIGHLIGHT_MAP[lower]!;
    return { name: mapped, exact: mapped === lower };
  }
  const rgb = parseHexRgb(trimmed);
  if (rgb === null) return null;
  const mapped = nearestColour(rgb, HIGHLIGHT_RGB, [255, 255, 255]);
  return mapped.name === null ? null : { name: mapped.name, exact: false };
}
