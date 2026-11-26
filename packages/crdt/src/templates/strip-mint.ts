// Pure strip and mint routines for Show and News script and rundown templates.
import { canonicalBlock, sectionize } from "@manent/schema";
import type {
  BlockJSON,
  DocJSON,
  MarkJSON,
  RundownCellJSON,
  RundownColumnId,
  RundownJSON,
  RundownRowJSON,
  TextJSON,
} from "@manent/schema";
import { compareStrings, keysBetween } from "../rundown/rundown-order.ts";
import {
  STRIPPED_BLOCK_ATTRS,
  STRIPPED_TEMPLATE_MARKS,
  TEMPLATE_RUNDOWN_CELL_COLUMNS,
} from "./model.ts";
import type {
  RundownTemplateSkeleton,
  ScriptTemplateSkeleton,
  TemplateBlockJSON,
  TemplateRundownRowJSON,
} from "./model.ts";

const DEFAULT_STRIPPED_SCRIPT_ATTRS: Readonly<Record<string, unknown>> = {
  synopsis: "",
  noContd: false,
  noTiming: false,
};

function stripRunMarks(runs: readonly TextJSON[]): TextJSON[] {
  const stripped: TextJSON[] = [];
  for (const run of runs) {
    if (run.text === "") continue;
    const marks = (run.marks ?? [])
      .filter((mark) => !STRIPPED_TEMPLATE_MARKS.has(mark.type))
      .map((mark): MarkJSON =>
        mark.attrs === undefined
          ? { type: mark.type }
          : { type: mark.type, attrs: { ...mark.attrs } },
      );
    stripped.push(
      marks.length === 0
        ? { type: "text", text: run.text }
        : { type: "text", text: run.text, marks },
    );
  }
  return stripped;
}

function stripBlock(block: BlockJSON): TemplateBlockJSON {
  const canonical = canonicalBlock({
    type: "block",
    attrs: block.attrs,
    content: stripRunMarks(block.content ?? []),
  });
  const attrs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(canonical.attrs ?? {})) {
    if (STRIPPED_BLOCK_ATTRS.has(key)) continue;
    if (
      Object.hasOwn(DEFAULT_STRIPPED_SCRIPT_ATTRS, key) &&
      DEFAULT_STRIPPED_SCRIPT_ATTRS[key] === value
    )
      continue;
    attrs[key] = Array.isArray(value) ? [...value] : value;
  }
  if (typeof attrs.type !== "string" || attrs.type === "")
    attrs.type = "action";
  const result: TemplateBlockJSON = { type: "block", attrs };
  if (canonical.content !== undefined && canonical.content.length > 0)
    result.content = canonical.content.map((run) =>
      run.marks === undefined
        ? { type: "text", text: run.text }
        : {
            type: "text",
            text: run.text,
            marks: run.marks.map((mark) =>
              mark.attrs === undefined
                ? { type: mark.type }
                : { type: mark.type, attrs: { ...mark.attrs } },
            ),
          },
    );
  return result;
}

/**
 * Strips block IDs, provenance (`from`/`num`/`omitted`), writer assignments, links and suggestion marks
 * from a script document into a reusable `ScriptTemplateSkeleton`. Does not mutate `doc`.
 */
export function stripScriptForTemplate(doc: DocJSON): ScriptTemplateSkeleton {
  const blocks = (doc.content ?? []).flatMap(
    (section) => section.content ?? [],
  );
  return {
    v: 1,
    kind: "script",
    blocks: blocks.map(stripBlock),
  };
}

/**
 * Instantiates a fresh `DocJSON` from a `ScriptTemplateSkeleton`, minting a new unique block ID
 * for every block via `options.newId()`. Does not mutate `skeleton`.
 */
export function mintScriptFromTemplate(
  skeleton: ScriptTemplateSkeleton,
  options: { newId(): string },
): DocJSON {
  const blocks: BlockJSON[] = skeleton.blocks.map((block) => {
    const attrs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(block.attrs)) {
      if (STRIPPED_BLOCK_ATTRS.has(key)) continue;
      attrs[key] = Array.isArray(value) ? [...value] : value;
    }
    attrs.id = options.newId();
    const minted: BlockJSON = { type: "block", attrs };
    if (block.content !== undefined && block.content.length > 0)
      minted.content = block.content.map((run) =>
        run.marks === undefined
          ? { type: "text", text: run.text }
          : {
              type: "text",
              text: run.text,
              marks: run.marks.map((mark) =>
                mark.attrs === undefined
                  ? { type: mark.type }
                  : { type: mark.type, attrs: { ...mark.attrs } },
              ),
            },
      );
    return minted;
  });
  return sectionize(blocks);
}

const isTemplateCellColumn = (colId: string): colId is RundownColumnId =>
  TEMPLATE_RUNDOWN_CELL_COLUMNS.some((col) => col === colId);

/**
 * Strips row IDs, order keys, air dates, story links, timings (`dur`, `durationMs`, `prompter`)
 * and cell `previous`/writer metadata into a reusable `RundownTemplateSkeleton`. Does not mutate `rundown`.
 */
export function stripRundownForTemplate(
  rundown: RundownJSON,
): RundownTemplateSkeleton {
  const ordered = rundown.rows.toSorted(
    (a, b) => compareStrings(a.order, b.order) || compareStrings(a.id, b.id),
  );
  const rows: TemplateRundownRowJSON[] = ordered.map((row) => {
    const cells: Partial<Record<RundownColumnId, string | number | null>> = {};
    for (const [colId, cell] of Object.entries(row.cells)) {
      if (!isTemplateCellColumn(colId) || cell === undefined) continue;
      cells[colId] = cell.value;
    }
    return {
      kind: row.kind,
      cells,
      unnumbered: row.unnumbered,
    };
  });
  return {
    v: 1,
    kind: "rundown",
    rundown: {
      windowLeadMs: rundown.rundown.windowLeadMs,
      targetMs: rundown.rundown.targetMs,
    },
    columns: [...rundown.columns],
    rows,
  };
}

/**
 * Instantiates a fresh `RundownJSON` from a `RundownTemplateSkeleton`, minting fresh row IDs,
 * evenly spaced base-62 order keys, clean cells with `previous: null`, and cleared links/timings.
 * Does not mutate `skeleton`.
 */
export function mintRundownFromTemplate(
  skeleton: RundownTemplateSkeleton,
  options: {
    newId(): string;
    userId: string;
    now(): number;
    airDate?: string;
    airAt?: number | null;
  },
): RundownJSON {
  const keys = keysBetween(null, null, skeleton.rows.length);
  const setAt = options.now();
  const rows: RundownRowJSON[] = skeleton.rows.map((tplRow, index) => {
    const cells: Partial<Record<RundownColumnId, RundownCellJSON>> = {};
    for (const [colId, value] of Object.entries(tplRow.cells)) {
      if (!isTemplateCellColumn(colId) || value === undefined) continue;
      cells[colId] = {
        value,
        userId: options.userId,
        setAt,
        previous: null,
      };
    }
    return {
      id: options.newId(),
      order: keys[index]!,
      kind: tplRow.kind,
      cells,
      docId: null,
      blockId: null,
      durationMs: null,
      prompter: null,
      unnumbered: tplRow.unnumbered,
    };
  });
  return {
    rundown: {
      airDate: options.airDate ?? "",
      airAt: options.airAt ?? null,
      windowLeadMs: skeleton.rundown.windowLeadMs,
      targetMs: skeleton.rundown.targetMs,
    },
    columns: [...skeleton.columns],
    rows,
  };
}
