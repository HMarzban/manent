// The Export form's frame, loaded apart from the entry: a clean PDF of the whole script, written from the pages
// on screen, or its FDX or Fountain file, written from the open editor's script.
import type { KeptItem, KeptKind } from "@manent/formats";
import type { Pagination } from "@manent/pagination";
import type { Choice } from "@manent/settings";
import {
  EDITOR_WORDS,
  IMPORT_WORDS,
  SEND_WORDS,
  Segmented,
  joinNames,
} from "@manent/ui";
import type { Message } from "@manent/ui";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { scriptForExport } from "../editor-host/export-source.ts";
import type { SendFormProps } from "../screens/send/forms.ts";
import { SendFrame } from "../screens/send/send-frame.tsx";
import type { SendRow } from "../screens/send/send-frame.tsx";
import { useEnvironment, useServices } from "../services/context.tsx";
import { useSendPages } from "./page-tiles.tsx";
import { loadPdfFonts } from "./pdf-fonts.ts";
import {
  EXPORT_KINDS,
  fileFor,
  fileName,
  fileType,
  save,
} from "./script-file.ts";
import type { ExportKind } from "./script-file.ts";

const WORDS = EDITOR_WORDS.send;
const KEPT = IMPORT_WORDS.kept;

// a clean PDF first: what is sent the first time
const AS_CHOICES: readonly Choice<ExportKind>[] = Object.freeze([
  { value: "pdf", label: WORDS.cleanPdf },
  { value: "fdx", label: IMPORT_WORDS.asFdx },
  { value: "fountain", label: IMPORT_WORDS.asFountain },
]);

const FORMAT_NAMES: Readonly<Record<"fdx" | "fountain", string>> =
  Object.freeze({ fdx: IMPORT_WORDS.asFdx, fountain: IMPORT_WORDS.asFountain });

/** The name a kept item is said by, given the other format's element names joined; null for a lock that could not be placed, which has no row. */
const KEPT_NAMES: Readonly<
  Record<KeptKind, (item: KeptItem, elements: string) => string | null>
> = Object.freeze({
  title_page: () => KEPT.title_page,
  document_part: (item) => KEPT.document_part(item.name),
  paragraph_part: () => KEPT.paragraph_part,
  run_part: () => KEPT.run_part,
  element_type: (_item, elements) => KEPT.element_type(elements),
  scene_number: () => KEPT.scene_number,
  note_part: () => KEPT.note_part,
  boneyard: () => KEPT.boneyard,
  fountain_markup: () => KEPT.fountain_markup,
  unplaced_lock: () => null,
});

/**
 * The Checks row of a file in `kind`: what it leaves out, each name once in the order first met. An element the
 * writer turned into another is said by its own label; null when nothing is left out.
 */
function leftOutRow(
  kind: "fdx" | "fountain",
  leftOut: readonly KeptItem[],
): SendRow | null {
  const made = (item: KeptItem): boolean =>
    item.kind === "element_type" && item.from === kind;
  const elements = joinNames([
    ...new Set(
      leftOut
        .filter((item) => item.kind === "element_type" && !made(item))
        .map((item) => item.name),
    ),
  ]);
  const names = [
    ...new Set(
      leftOut.flatMap((item) => {
        const name = made(item)
          ? item.name
          : KEPT_NAMES[item.kind](item, elements);
        return name === null ? [] : [name];
      }),
    ),
  ];
  const [only] = names;
  if (only === undefined) return null;
  const format = FORMAT_NAMES[kind];
  return {
    id: "checks",
    content:
      names.length === 1
        ? IMPORT_WORDS.leftOutOne(only, format)
        : IMPORT_WORDS.leftOut(joinNames(names), format),
  };
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`the font file ${url} answered ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Writes the clean PDF of `pages` and hands it to the browser as a download; nothing is saved once `signal` has
 * aborted. Rejects when the fonts or the writer fail.
 */
async function exportPdf(work: {
  pages: Pagination;
  title: string;
  now: () => number;
  signal: AbortSignal;
}): Promise<void> {
  const { pages, title, now, signal } = work;
  const [fonts, { writePdf }] = await Promise.all([
    loadPdfFonts(fetchBytes),
    import("@manent/formats"),
  ]);
  // a copy over an ArrayBuffer of its own, which a Blob takes
  const bytes = new Uint8Array(
    await writePdf(pages, { fonts, title, createdAt: now() }),
  );
  if (!signal.aborted) save(bytes, fileName(title, "pdf"), fileType("pdf"));
}

/** Writes the script's file in `kind` from the open editor and saves it; rejects when no editor holds it or the writer fails. */
async function exportScriptFile(work: {
  kind: "fdx" | "fountain";
  docId: string;
  title: string;
  signal: AbortSignal;
}): Promise<void> {
  const { kind, docId, title, signal } = work;
  const script = await scriptForExport(docId, title);
  if (script === null) throw new Error(`no open editor holds ${docId}`);
  const file = await fileFor(kind, script);
  if (!signal.aborted) save(new Uint8Array(file.bytes), file.name, file.type);
}

/** What a file in `kind` leaves out, worked out again when the choice or the open editor changes; null for a PDF. */
function useLeftOutRow(
  docId: string,
  title: string,
  kind: ExportKind,
  open: boolean,
): SendRow | null {
  const [row, setRow] = useState<SendRow | null>(null);
  useEffect(() => {
    setRow(null);
    if (kind === "pdf" || !open) return undefined;
    let shown = true;
    scriptForExport(docId, title)
      .then((script) => (script === null ? null : fileFor(kind, script)))
      .then(
        (file) => {
          if (shown && file !== null) setRow(leftOutRow(kind, file.leftOut));
        },
        () => {
          // nothing is said before export; the export itself says it could not write the file
        },
      );
    return () => {
      shown = false;
    };
  }, [docId, title, kind, open]);
  return row;
}

function exportedMessage(title: string): Message {
  return {
    id: "exported",
    text: WORDS.exported(title),
    actions: [],
    lifetime: "brief",
    ownWork: false,
  };
}

/**
 * The Export form: its rows from the first frame; the checks, the pages and the export itself once the document's
 * editor is open.
 */
export function LiveExport(props: SendFormProps): ReactNode {
  const { p, title, rows, tiles, back } = useSendPages(props.docId);
  const { messages } = useServices();
  const { frame, now } = useEnvironment();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [kind, setKind] = useState<ExportKind>("pdf");
  const leftOut = useLeftOutRow(props.docId, title, kind, p !== null);
  // the form's lifetime: work still under way when it leaves stops where it is
  const left = useRef(new AbortController());
  useEffect(() => {
    const controller = new AbortController();
    left.current = controller;
    return () => controller.abort();
  }, []);

  const run = (pages: Pagination): void => {
    const { signal } = left.current;
    setBusy(true);
    setProblem(null);
    // one frame first, so that the busy label paints before the page is written
    const cancel = frame(() => {
      const written =
        kind === "pdf"
          ? exportPdf({ pages, title, now, signal })
          : exportScriptFile({ kind, docId: props.docId, title, signal });
      written.then(
        () => {
          if (signal.aborted) return;
          messages.push(exportedMessage(title));
          back();
        },
        () => {
          // the person is told the file was not written and may try again; nothing was saved
          if (signal.aborted) return;
          setProblem(WORDS.exportFailed(title));
          setBusy(false);
        },
      );
    });
    signal.addEventListener("abort", cancel, { once: true });
  };

  return (
    <SendFrame
      title={WORDS.exportTitle(1)}
      aside={null}
      rows={[
        // a file other than the PDF is not drawn in the script font: what it leaves out is its check
        ...(kind === "pdf"
          ? rows
          : [
              ...rows.filter((row) => row.id !== "checks"),
              ...(leftOut === null ? [] : [leftOut]),
            ]),
        {
          id: "as",
          content: (
            <Segmented
              label={SEND_WORDS.as}
              value={kind}
              options={AS_CHOICES}
              onChange={(chosen) => {
                const next = EXPORT_KINDS.find((k) => k === chosen);
                if (next !== undefined) setKind(next);
              }}
            />
          ),
        },
      ]}
      pages={tiles}
      action={{
        label: WORDS.exportTitle(1),
        busyLabel: WORDS.exporting(1),
        busy,
        // written in one call on the main thread, which nothing can interrupt
        progress: null,
        cancel: null,
        disabledReason: null,
        problem,
        run: p === null ? null : () => run(p),
      }}
    />
  );
}
