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
import { timingKey } from "../timing/timing-plugin.ts";
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

function hasSlotKind(
  slots: HeaderSlots | null,
  kind: HeaderSlot["kind"],
): boolean {
  return (
    slots !== null &&
    (slots.left.kind === kind ||
      slots.center.kind === kind ||
      slots.right.kind === kind)
  );
}

function usesDuration(
  header: HeaderSlots | null,
  footer: HeaderSlots | null,
): boolean {
  return hasSlotKind(header, "duration") || hasSlotKind(footer, "duration");
}

function usesSection(
  header: HeaderSlots | null,
  footer: HeaderSlots | null,
): boolean {
  return hasSlotKind(header, "section") || hasSlotKind(footer, "section");
}

/** Reads Variety total duration from timingPlugin's incremental state when enabled; null otherwise. */
function timingPluginDuration(state: EditorState): number | null {
  const timing = timingKey.getState(state);
  if (timing === undefined || !timing.enabled) return null;
  return durationMs([timing.script], DEFAULT_READ_RATE);
}

function isSameSlot(a: HeaderSlot, b: HeaderSlot): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind === "custom" && b.kind === "custom" ? a.text === b.text : true;
}

function isSameSlots(a: HeaderSlots | null, b: HeaderSlots | null): boolean {
  return (
    a === b ||
    (a !== null &&
      b !== null &&
      a.firstPage === b.firstPage &&
      a.rule === b.rule &&
      isSameSlot(a.left, b.left) &&
      isSameSlot(a.center, b.center) &&
      isSameSlot(a.right, b.right))
  );
}

function isSameSections(
  a: readonly (string | null)[] | undefined,
  b: readonly (string | null)[] | undefined,
): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function isSameFurnitureOptions(
  a: PageFurnitureOptions | null,
  b: PageFurnitureOptions,
): boolean {
  return (
    a !== null &&
    a.title === b.title &&
    a.dateFormat === b.dateFormat &&
    a.revisionLabel === b.revisionLabel &&
    a.day === b.day &&
    a.durationMs === b.durationMs &&
    isSameSlots(a.header ?? null, b.header ?? null) &&
    isSameSlots(a.footer ?? null, b.footer ?? null) &&
    isSameSections(a.sections, b.sections)
  );
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
  let lastSnapshot: PageFurnitureOptions | null = null;

  const durationFor = (state: EditorState): number | null => {
    const fmt = options.format();
    if (fmt !== "variety") return null;
    const fromPlugin = timingPluginDuration(state);
    if (fromPlugin !== null) {
      lastDoc = state.doc;
      lastFormat = fmt;
      lastDuration = fromPlugin;
      return fromPlugin;
    }
    if (state.doc !== lastDoc || fmt !== lastFormat) {
      lastDoc = state.doc;
      lastFormat = fmt;
      lastDuration = durationOfDoc(state.doc, fmt);
    }
    return lastDuration;
  };

  const snapshot = (
    state: EditorState,
    durationMsValue: number | null,
    header: HeaderSlots | null,
    footer: HeaderSlots | null,
    needSections: boolean,
  ): PageFurnitureOptions => {
    let sections = lastSections;
    if (needSections) {
      const pagination = paginationKey.getState(state)?.pagination;
      if (pagination !== undefined && pagination !== lastPagination) {
        lastPagination = pagination;
        lastSections = sectionsOf(pagination);
      }
      sections = lastSections;
    }
    return {
      title: options.title.get(),
      header,
      footer,
      dateFormat: parseDateFormat(options.script.get("script.dateFormat")),
      sections,
      revisionLabel: productionOf(state)?.view.active.name ?? null,
      day: isoDay(options.timers.now()),
      durationMs: durationMsValue,
    };
  };

  const read = (state: EditorState): PageFurnitureOptions => {
    const header = parseSlots(options.script.get("script.header"));
    const footer = parseSlots(options.script.get("script.footer"));
    return snapshot(state, durationFor(state), header, footer, true);
  };

  const sync = (state: EditorState): void => {
    const frame = options.scaffold();
    if (frame === null) return;
    const header = parseSlots(options.script.get("script.header"));
    const footer = parseSlots(options.script.get("script.footer"));
    const duration = usesDuration(header, footer) ? durationFor(state) : null;
    const next = snapshot(
      state,
      duration,
      header,
      footer,
      usesSection(header, footer),
    );
    if (isSameFurnitureOptions(lastSnapshot, next)) return;
    lastSnapshot = next;
    frame.setFurniture(next);
  };

  return {
    read,
    sync,
    plugin: () =>
      new Plugin({
        view() {
          return {
            update(view, prev) {
              if (
                view.state.doc === prev.doc &&
                paginationKey.getState(view.state)?.pagination ===
                  paginationKey.getState(prev)?.pagination &&
                productionOf(view.state)?.view.active.name ===
                  productionOf(prev)?.view.active.name
              )
                return;
              sync(view.state);
            },
          };
        },
      }),
  };
}
