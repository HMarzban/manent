import { expect, test } from "bun:test";
import fc from "fast-check";
import {
  FORMAT_ERROR_CODES,
  FormatError,
  IMPORT_LIMIT_BYTES,
  decodeText,
  parseXmlChecked,
} from "../src/index.ts";
import { XML_EXPECTED, bunXml, fixtureText } from "../src/testing/index.ts";

const bytes = (values: readonly number[]): Uint8Array => new Uint8Array(values);

type Attempt = { ok: true } | { ok: false; error: unknown };

function attempt(run: () => unknown): Attempt {
  try {
    run();
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

const FIXTURE_TEXTS = Object.keys(XML_EXPECTED).map((file) =>
  fixtureText(`xml/${file}`),
);
const CHARACTERS = ["<", ">", "&", '"', "/", "=", "a", " ", "!", "?"];

/** A fixture's text with one character cut, doubled or replaced, nested in `<a>` up to 70 times, or after a document type. */
const nearXml: fc.Arbitrary<string> = fc
  .constantFrom(...FIXTURE_TEXTS)
  .chain((text) =>
    fc.oneof(
      fc
        .nat(text.length - 1)
        .map((at) => text.slice(0, at) + text.slice(at + 1)),
      fc
        .nat(text.length - 1)
        .map((at) => text.slice(0, at + 1) + text.slice(at)),
      fc
        .tuple(fc.nat(text.length - 1), fc.constantFrom(...CHARACTERS))
        .map(([at, c]) => text.slice(0, at) + c + text.slice(at + 1)),
      fc
        .integer({ min: 1, max: 70 })
        .map(
          (n) =>
            "<a>".repeat(n) +
            text.replace(new RegExp("^<[?]xml[^>]*>"), "") +
            "</a>".repeat(n),
        ),
      fc.constant(`<!DOCTYPE Script>\n${text}`),
    ),
  );

test("text is decoded from each byte order mark, UTF-8 and Windows-1252", () => {
  expect([
    decodeText(bytes([0xef, 0xbb, 0xbf, 0x41])),
    decodeText(bytes([0xff, 0xfe, 0x41, 0x00])),
    decodeText(bytes([0xfe, 0xff, 0x00, 0x41])),
    decodeText(new TextEncoder().encode("Salt’s")),
    decodeText(bytes([0x53, 0x92, 0x73])),
  ]).toEqual(["A", "A", "A", "Salt’s", "S’s"]);
});

test("line ends become LF", () => {
  expect(decodeText(new TextEncoder().encode("a\r\nb\rc\n"))).toBe("a\nb\nc\n");
});

test("only the first byte order mark is taken off", () => {
  expect([
    decodeText(bytes([0xef, 0xbb, 0xbf, 0xef, 0xbb, 0xbf, 0x41])),
    decodeText(bytes([0xff, 0xfe, 0x41])),
  ]).toEqual(["﻿A", "�"]);
});

test("a file may be up to 32 MB", () => {
  expect(IMPORT_LIMIT_BYTES).toBe(33_554_432);
});

test("any bytes decode to text, and any text parses or is refused with its code", () => {
  fc.assert(
    fc.property(fc.uint8Array({ maxLength: 512 }), nearXml, (raw, text) => {
      expect(decodeText(raw).includes("\r")).toBe(false);
      const parsed = attempt(() => parseXmlChecked(text, bunXml));
      expect(
        parsed.ok ||
          (parsed.error instanceof FormatError &&
            FORMAT_ERROR_CODES.includes(parsed.error.code)),
      ).toBe(true);
    }),
    { numRuns: 200 },
  );
});

test("the texts near XML reach a tree and each refusal", () => {
  const outcomes = new Set(
    fc.sample(nearXml, { numRuns: 200, seed: 13 }).map((text) => {
      const parsed = attempt(() => parseXmlChecked(text, bunXml));
      if (parsed.ok) return "parsed";
      return parsed.error instanceof FormatError ? parsed.error.code : "thrown";
    }),
  );
  expect([...outcomes].toSorted()).toEqual([
    "malformed",
    "parsed",
    "unsupported",
  ]);
});
