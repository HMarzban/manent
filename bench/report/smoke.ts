// The desktop smoke's result files, one per system, as CI writes them: read and checked field by field.

import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { isRecord } from "../budgets.ts";
import { NOT_MEASURED, formatBytes, formatMs, table } from "./format.ts";
import { VERDICT_WORDS } from "./text.ts";

export type SmokeVerdict = "within" | "over_budget" | "hard_fail";

/** The shape the desktop smoke writes; copied, because the benchmark never imports the tools. */
export interface SmokeResult {
  platform: string;
  version: string;
  firstFrameMs: number;
  coldStartMs: number;
  /** null where the system gives no reading. */
  idleRssBytes: number | null;
  coldStart: SmokeVerdict;
  idleMemory: SmokeVerdict | null;
  saved: boolean;
  synced: boolean;
  secondInstanceDeferred: boolean;
  offlineSaved: boolean;
  /** null when no update was offered. */
  updatedWithOutbox: boolean | null;
  noticesBeside: boolean;
}

const SMOKE_FILE = /^desktop-smoke-.+\.json$/;
const SMOKE_VERDICTS: readonly SmokeVerdict[] = [
  "within",
  "over_budget",
  "hard_fail",
];

function readSmoke(path: string, value: unknown): SmokeResult {
  if (!isRecord(value)) throw new Error(`${path} is not an object`);
  const refuse = (key: string, wanted: string): Error =>
    new Error(
      `${path}: ${key} must be ${wanted}, not ${JSON.stringify(value[key])}`,
    );
  const text = (key: string): string => {
    const v = value[key];
    if (typeof v !== "string") throw refuse(key, "a string");
    return v;
  };
  const number = (key: string): number => {
    const v = value[key];
    if (typeof v !== "number" || !Number.isFinite(v))
      throw refuse(key, "a finite number");
    return v;
  };
  const flag = (key: string): boolean => {
    const v = value[key];
    if (typeof v !== "boolean") throw refuse(key, "true or false");
    return v;
  };
  const verdict = (key: string): SmokeVerdict => {
    const v = SMOKE_VERDICTS.find((s) => s === value[key]);
    if (v === undefined) throw refuse(key, SMOKE_VERDICTS.join(", "));
    return v;
  };
  const orNull = <T>(key: string, read: (key: string) => T): T | null =>
    value[key] === null ? null : read(key);
  return {
    platform: text("platform"),
    version: text("version"),
    firstFrameMs: number("firstFrameMs"),
    coldStartMs: number("coldStartMs"),
    idleRssBytes: orNull("idleRssBytes", number),
    coldStart: verdict("coldStart"),
    idleMemory: orNull("idleMemory", verdict),
    saved: flag("saved"),
    synced: flag("synced"),
    secondInstanceDeferred: flag("secondInstanceDeferred"),
    offlineSaved: flag("offlineSaved"),
    updatedWithOutbox: orNull("updatedWithOutbox", flag),
    noticesBeside: flag("noticesBeside"),
  };
}

/** Every `desktop-smoke-<platform>.json` in `dir`, by name; none when `dir` does not exist. Throws naming the file it refuses. */
export async function readSmokeResults(dir: string): Promise<SmokeResult[]> {
  if (!existsSync(dir)) return [];
  const names = (await readdir(dir))
    .filter((name) => SMOKE_FILE.test(name))
    .toSorted();
  const results: SmokeResult[] = [];
  for (const name of names) {
    const path = join(dir, name);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await Bun.file(path).text());
    } catch (cause) {
      throw new Error(`${path} is not JSON`, { cause });
    }
    results.push(readSmoke(path, parsed));
  }
  return results;
}

/** What each smoke verdict reads as in the budget table. */
export const SMOKE_VERDICT_KINDS: Readonly<
  Record<SmokeVerdict, "pass" | "over_budget" | "hard_fail">
> = Object.freeze({
  within: "pass",
  over_budget: "over_budget",
  hard_fail: "hard_fail",
});

const yesNo = (value: boolean | null): string =>
  value === null ? NOT_MEASURED : value ? "yes" : "no";

const word = (v: SmokeVerdict): string => VERDICT_WORDS[SMOKE_VERDICT_KINDS[v]];

/** The desktop part of the budgets: one row per system the smoke ran on. */
export function desktopSection(smoke: readonly SmokeResult[]): string {
  const rows = smoke.map((s) => [
    s.platform,
    s.version,
    `${formatMs(s.coldStartMs)} ms ${word(s.coldStart)}`,
    `${formatMs(s.firstFrameMs)} ms`,
    s.idleRssBytes === null || s.idleMemory === null
      ? NOT_MEASURED
      : `${formatBytes(s.idleRssBytes)} ${word(s.idleMemory)}`,
    yesNo(s.saved),
    yesNo(s.synced),
    yesNo(s.secondInstanceDeferred),
    yesNo(s.offlineSaved),
    yesNo(s.updatedWithOutbox),
    yesNo(s.noticesBeside),
  ]);
  const header = [
    "System",
    "Version",
    "Cold start",
    "First frame",
    "Idle memory",
    "Saved",
    "Synced",
    "Second instance defers",
    "Offline save",
    "Update with an outbox",
    "Notices beside",
  ];
  return `### Desktop\n\n${table(header, rows)}`;
}
