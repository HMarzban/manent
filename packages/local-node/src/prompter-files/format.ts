// Formatting for prompter run-order.txt and NN-<slug>.txt story files.
import { formatPrompterStory } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import type { PrompterRow } from "@manent/sync-protocol";
import { encodePrompterText } from "./encoding.ts";
import type { EncodedPrompterText, PrompterEncoding } from "./encoding.ts";

export const RUN_ORDER_FILE = "run-order.txt";
const MAX_SLUG_LENGTH = 40;
const FALLBACK_SLUG = "story";
const CRLF = "\r\n";

/**
 * Formats a duration in milliseconds as `4:05` under an hour, `1:02:07` from an hour,
 * and `0:00` at zero, rounded to the nearest second with halves rounded up (S3-TM-04).
 */
export function formatRunOrderDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000 + 0.5));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const secText = String(seconds).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${secText}`;
  }
  return `${minutes}:${secText}`;
}

function slugOf(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");
  return slug === "" ? FALLBACK_SLUG : slug;
}

function uniqueStoryFileName(
  rowNumber: number | null,
  title: string,
  usedLower: Set<string>,
): string {
  const prefix = String(Math.max(0, rowNumber ?? 0)).padStart(2, "0");
  const base = `${prefix}-${slugOf(title)}`;
  let candidate = `${base}.txt`;
  let suffix = 2;
  while (usedLower.has(candidate.toLowerCase())) {
    candidate = `${base}-${suffix}.txt`;
    suffix += 1;
  }
  usedLower.add(candidate.toLowerCase());
  return candidate;
}

function storyBlocksForRow(
  row: PrompterRow,
  stories: ReadonlyMap<string, readonly BlockJSON[]>,
): readonly BlockJSON[] | undefined {
  if (row.kind !== "story") return undefined;
  return (
    stories.get(row.rowId) ??
    (row.storyId !== null ? stories.get(row.storyId) : undefined)
  );
}

function toCrlfText(formatted: string): string {
  if (formatted === "") return "";
  return `${formatted.replace(/\r?\n/g, CRLF)}${CRLF}`;
}

function sanitizeField(value: string): string {
  return value.replace(/[\t\r\n]+/g, " ");
}

/**
 * Builds the encoded `run-order.txt` and per-story `NN-<slug>.txt` files for a snapshot.
 * Every line ends with `\r\n`, the last included; UTF-8 carries no BOM.
 */
export function buildPrompterFiles(
  runOrder: readonly PrompterRow[],
  stories: ReadonlyMap<string, readonly BlockJSON[]>,
  encoding: PrompterEncoding,
): Map<string, EncodedPrompterText> {
  const files = new Map<string, EncodedPrompterText>();
  const usedNames = new Set<string>([RUN_ORDER_FILE]);
  const orderLines: string[] = [];

  for (const row of runOrder) {
    const blocks = storyBlocksForRow(row, stories);
    let fileName = "";
    if (blocks !== undefined) {
      fileName = uniqueStoryFileName(row.number, row.title, usedNames);
      const storyText = toCrlfText(formatPrompterStory(blocks));
      files.set(fileName, encodePrompterText(storyText, encoding));
    }
    const numberCol =
      row.kind === "header" || row.number === null ? "" : String(row.number);
    const titleCol = sanitizeField(row.title);
    const durationCol =
      row.durationMs === null ? "" : formatRunOrderDuration(row.durationMs);
    orderLines.push(
      `${numberCol}\t${titleCol}\t${fileName}\t${durationCol}${CRLF}`,
    );
  }

  files.set(RUN_ORDER_FILE, encodePrompterText(orderLines.join(""), encoding));
  return files;
}
