// Selective, bounded extraction of a Word (.docx) zip: only word/document.xml and word/styles.xml are inflated,
// each checked against DOCX_PART_LIMIT_BYTES before any bytes are allocated or inflated.
import { unzipSync } from "fflate";
import type { UnzipFileInfo } from "fflate";
import { IMPORT_LIMIT_BYTES } from "../script/decode.ts";
import { FormatError } from "../script/model.ts";

/** Maximum uncompressed size of any extracted Word XML part: 64 MiB. */
export const DOCX_PART_LIMIT_BYTES = 64 * 1024 * 1024;

const BODY_PART = "word/document.xml";
const STYLES_PART = "word/styles.xml";
const WANTED_PARTS = new Set([BODY_PART, STYLES_PART]);
/** Cap on central-directory entries inspected, to refuse pathological zip headers. */
const DOCX_ENTRY_LIMIT = 4096;
/** Zip local-file / central-directory signature prefix ("PK"). */
const ZIP_MAGIC_0 = 0x50;
const ZIP_MAGIC_1 = 0x4b;
/** Minimum empty zip archive size (end-of-central-directory record). */
const ZIP_MIN_BYTES = 22;

export interface DocxParts {
  readonly body: Uint8Array;
  readonly styles: Uint8Array | null;
}

function checkHeader(info: UnzipFileInfo, seen: Set<string>): void {
  if (seen.has(info.name))
    throw new FormatError(
      "malformed",
      `the zip holds more than one ${info.name} entry`,
    );
  seen.add(info.name);
  if (
    !Number.isSafeInteger(info.originalSize) ||
    info.originalSize < 0 ||
    !Number.isSafeInteger(info.size) ||
    info.size < 0
  )
    throw new FormatError(
      "malformed",
      `${info.name} states an invalid size in its zip header`,
    );
  const stated = Math.max(info.originalSize, info.size);
  if (stated > DOCX_PART_LIMIT_BYTES)
    throw new FormatError(
      "too_large",
      `${info.name} unpacks to ${stated} bytes, over ${DOCX_PART_LIMIT_BYTES}`,
    );
  if (info.compression !== 0 && info.compression !== 8)
    throw new FormatError(
      "unsupported",
      `${info.name} uses unsupported zip compression ${info.compression}`,
    );
}

/**
 * Extracts only `word/document.xml` and `word/styles.xml` from `bytes`. Refuses archives over IMPORT_LIMIT_BYTES
 * or parts whose stated uncompressed size exceeds DOCX_PART_LIMIT_BYTES before inflating.
 */
export function extractDocxParts(bytes: Uint8Array): DocxParts {
  if (bytes.length > IMPORT_LIMIT_BYTES)
    throw new FormatError(
      "too_large",
      `a file may be ${IMPORT_LIMIT_BYTES} bytes, not ${bytes.length}`,
    );
  if (
    bytes.length < ZIP_MIN_BYTES ||
    bytes[0] !== ZIP_MAGIC_0 ||
    bytes[1] !== ZIP_MAGIC_1
  )
    throw new FormatError(
      "not_this_format",
      "the bytes do not carry a zip signature",
    );
  let entries = 0;
  const seen = new Set<string>();
  let extracted: Record<string, Uint8Array>;
  try {
    extracted = unzipSync(bytes, {
      filter(info) {
        entries += 1;
        if (entries > DOCX_ENTRY_LIMIT)
          throw new FormatError(
            "malformed",
            `a Word zip may list at most ${DOCX_ENTRY_LIMIT} entries`,
          );
        if (!WANTED_PARTS.has(info.name)) return false;
        checkHeader(info, seen);
        return true;
      },
    });
  } catch (cause) {
    if (cause instanceof FormatError) throw cause;
    throw new FormatError("malformed", "the file is not a readable zip", {
      cause,
    });
  }
  const body = Object.hasOwn(extracted, BODY_PART)
    ? extracted[BODY_PART]
    : undefined;
  if (body === undefined)
    throw new FormatError(
      "not_this_format",
      `the zip holds no ${BODY_PART} part`,
    );
  const styles = Object.hasOwn(extracted, STYLES_PART)
    ? (extracted[STYLES_PART] ?? null)
    : null;
  if (body.byteLength > DOCX_PART_LIMIT_BYTES)
    throw new FormatError(
      "too_large",
      `${BODY_PART} unpacked to ${body.byteLength} bytes, over ${DOCX_PART_LIMIT_BYTES}`,
    );
  if (styles !== null && styles.byteLength > DOCX_PART_LIMIT_BYTES)
    throw new FormatError(
      "too_large",
      `${STYLES_PART} unpacked to ${styles.byteLength} bytes, over ${DOCX_PART_LIMIT_BYTES}`,
    );
  return { body, styles };
}
