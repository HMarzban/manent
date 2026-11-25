// Windows-1252 and UTF-8 encoders for prompter text files.

export type PrompterEncoding = "utf-8" | "windows-1252";

export interface EncodedPrompterText {
  readonly bytes: Uint8Array;
  readonly replaced: number;
}

/** The 27 standard Windows-1252 characters mapped into 0x80..0x9F. */
const WINDOWS_1252_EXTRA: ReadonlyMap<number, number> = new Map([
  [0x20ac, 0x80], // €
  [0x201a, 0x82], // ‚
  [0x0192, 0x83], // ƒ
  [0x201e, 0x84], // „
  [0x2026, 0x85], // …
  [0x2020, 0x86], // †
  [0x2021, 0x87], // ‡
  [0x02c6, 0x88], // ˆ
  [0x2030, 0x89], // ‰
  [0x0160, 0x8a], // Š
  [0x2039, 0x8b], // ‹
  [0x0152, 0x8c], // Œ
  [0x017d, 0x8e], // Ž
  [0x2018, 0x91], // ‘
  [0x2019, 0x92], // ’
  [0x201c, 0x93], // “
  [0x201d, 0x94], // ”
  [0x2022, 0x95], // •
  [0x2013, 0x96], // –
  [0x2014, 0x97], // —
  [0x02dc, 0x98], // ˜
  [0x2122, 0x99], // ™
  [0x0161, 0x9a], // š
  [0x203a, 0x9b], // ›
  [0x0153, 0x9c], // œ
  [0x017e, 0x9e], // ž
  [0x0178, 0x9f], // Ÿ
]);

const QUESTION_MARK = 0x3f;
const UTF8_ENCODER = new TextEncoder();

/**
 * Encodes `text` as Windows-1252 using the hand-coded table: ASCII (0x00..0x7F),
 * Latin-1 Supplement (0xA0..0xFF), and the 27 Windows-1252 characters in 0x80..0x9F.
 * Every other Unicode scalar value becomes `?` (0x3F) and increments `replaced` once.
 */
export function encodeWindows1252(text: string): EncodedPrompterText {
  const out: number[] = [];
  let replaced = 0;
  for (const ch of text) {
    const codePoint = ch.codePointAt(0);
    if (codePoint === undefined) continue;
    if (codePoint <= 0x7f || (codePoint >= 0xa0 && codePoint <= 0xff)) {
      out.push(codePoint);
      continue;
    }
    const mapped = WINDOWS_1252_EXTRA.get(codePoint);
    if (mapped !== undefined) {
      out.push(mapped);
    } else {
      out.push(QUESTION_MARK);
      replaced += 1;
    }
  }
  return { bytes: new Uint8Array(out), replaced };
}

/** Encodes `text` as UTF-8 (no BOM) or Windows-1252, returning bytes and replacement count. */
export function encodePrompterText(
  text: string,
  encoding: PrompterEncoding,
): EncodedPrompterText {
  if (encoding === "windows-1252") return encodeWindows1252(text);
  return { bytes: UTF8_ENCODER.encode(text), replaced: 0 };
}
