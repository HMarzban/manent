// Synchronizes a script editor's page furniture context (headers, footers, date format, per-page sections, timing).
import { DEFAULT_READ_RATE, durationMs, timeScript } from "@manent/pagination";
import type { Pagination, TimedBlock } from "@manent/pagination";
import type { FormatId } from "@manent/schema";
import type { HeaderSlot, HeaderSlots } from "@manent/settings";
import type { Node } from "prosemirror-model";
import { Plugin } from "prosemirror-state";
import type { EditorState } from "prosemirror-state";
import type {
  DateFormat,
  PageFurnitureOptions,
} from "../page/furniture/page-furniture.ts";
import type { PageScaffold } from "../page/scaffold.ts";
import { paginationKey } from "../pagination/plugin.ts";
import { productionOf } from "../revisions/derive.ts";
import type { SettingsReader, Timers } from "./ports.ts";

const SLOT_KINDS: ReadonlySet<string> = new Set([
  "none",
  "page_number",
  "page_of_total",
  "date",
  "title",
  "section",
  "duration",
  "revision_label",
]);

function isRecord(input: unknown): input is Readonly<Record<string, unknown>> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function parseSlot(input: unknown): HeaderSlot | null {
  if (!isRecord(input)) return null;
  const { kind, text } = input;
  if (kind === "custom" && typeof text === "string") return { kind, text };
  if (typeof kind === "string" && SLOT_KINDS.has(kind))
    return { kind: kind as Exclude<HeaderSlot, { kind: "custom" }>["kind"] };
  return null;
}

function parseSlots(input: unknown): HeaderSlots | null {
  if (!isRecord(input)) return null;
  const left = parseSlot(input["left"]);
  const center = parseSlot(input["center"]);
  const right = parseSlot(input["right"]);
  const firstPage = input["firstPage"];
  const rule = input["rule"];
  if (
    left === null ||
    center === null ||
    right === null ||
    typeof firstPage !== "boolean" ||
    typeof rule !== "boolean"
  )
    return null;
  return { left, center, right, firstPage, rule };
}

function parseDateFormat(input: unknown): DateFormat | null {
  if (
    input === "day_month_year" ||
    input === "month_day_year" ||
    input === "iso"
  )
    return input;
  return null;
}

function isoDay(at: number): string {
  const date = new Date(at);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Nearest Act or Section heading above each page's first line. */
export function sectionsOf(p: Pagination): readonly (string | null)[] {
  const result: (string | null)[] = [];
  let current: string | null = null;
  let blockIdx = 0;
  for (const page of p.pages) {
    while (blockIdx <= page.block && blockIdx < p.blocks.length) {
      const block = p.blocks[blockIdx]!;
      if (
        block.type === "group" ||
        (block.type === "act_break" && block.kind !== "end_of_act")
      ) {
        const text = block.text.trim();
        if (text !== "") current = text;
      }
      blockIdx++;
    }
    result.push(current);
  }
  return result;
}

function durationOfDoc(doc: Node, format: FormatId): number | null {
  if (format !== "variety") return null;
  const blocks: TimedBlock[] = [];
  doc.forEach((section) => {
    section.forEach((block) => {
      blocks.push({
        id: typeof block.attrs["id"] === "string" ? block.attrs["id"] : "",
        type:
          typeof block.attrs["type"] === "string"
            ? block.attrs["type"]
            : "general",
        text: block.textContent,
        noTiming: block.attrs["noTiming"] === true,
      });
    });
  });
  const { total } = timeScript(blocks);
  return durationMs([total], DEFAULT_READ_RATE);
}

export interface FurnitureSync {
  read(state: EditorState): PageFurnitureOptions;
  sync(state: EditorState): void;
  plugin(): Plugin;
}

export function createFurnitureSync(options: {
  script: SettingsReader;
  title: { get(): string };
  timers: Timers;
  format: () => FormatId;
  scaffold: () => PageScaffold | null;
}): FurnitureSync {
  let lastPagination: Pagination | undefined;
  let lastSections: readonly (string | null)[] = [];
  let lastDoc: Node | null = null;
  let lastFormat: FormatId | null = null;
  let lastDuration: number | null = null;
  let lastSnapshotKey = "";

  const read = (state: EditorState): PageFurnitureOptions => {
    const pagination = paginationKey.getState(state)?.pagination;
    if (pagination !== undefined && pagination !== lastPagination) {
      lastPagination = pagination;
      lastSections = sectionsOf(pagination);
    }
    const fmt = options.format();
    if (state.doc !== lastDoc || fmt !== lastFormat) {
      lastDoc = state.doc;
      lastFormat = fmt;
      lastDuration = durationOfDoc(state.doc, fmt);
    }
    return {
      title: options.title.get(),
      header: parseSlots(options.script.get("script.header")),
      footer: parseSlots(options.script.get("script.footer")),
      dateFormat: parseDateFormat(options.script.get("script.dateFormat")),
      sections: lastSections,
      revisionLabel: productionOf(state)?.view.active.name ?? null,
      day: isoDay(options.timers.now()),
      durationMs: lastDuration,
    };
  };

  const sync = (state: EditorState): void => {
    const frame = options.scaffold();
    if (frame === null) return;
    const next = read(state);
    const key = JSON.stringify(next);
    if (key === lastSnapshotKey) return;
    lastSnapshotKey = key;
    frame.setFurniture(next);
  };

  return {
    read,
    sync,
    plugin: () =>
      new Plugin({
        view() {
          return {
            update(view) {
              sync(view.state);
            },
          };
        },
      }),
  };
}
