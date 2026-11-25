// The Export form's frame for a script, loaded apart from the entry: a file of a type its As row offers, of what its
// What row chose, written from the pages on screen or from the open editor's script.
import type { Pagination } from "@manent/pagination";
import { EDITOR_WORDS, SEND_WORDS, Segmented } from "@manent/ui";
import type { Message } from "@manent/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { checksRow } from "../checks/send-row.tsx";
import type { SendFormProps } from "../screens/send/forms.ts";
import { SendFrame } from "../screens/send/send-frame.tsx";
import type { SendRow } from "../screens/send/send-frame.tsx";
import { useEnvironment, useServices } from "../services/context.tsx";
import type { Environment } from "../services/ports.ts";
import { useOfferedTo, useSearchChoice, useWhatRow } from "./export-form.tsx";
import { typesOffered } from "./file-types.ts";
import { useSendPages } from "./page-tiles.tsx";
import { save } from "./script-file.ts";
import type { ExportFileType } from "./script-file.ts";
import { clearSidesRange } from "./sides-file.tsx";

const WORDS = EDITOR_WORDS.send;
const WRAP_AS_THRESHOLD = 4;

function splitInkProjectLines(sentence: string): {
  readonly checks: readonly string[];
  readonly notices: readonly string[];
} {
  const checks: string[] = [];
  const notices: string[] = [];
  for (const line of sentence.split("\n")) {
    if (line.startsWith("! ")) checks.push(line);
    else if (line !== "") notices.push(line);
  }
  return { checks, notices };
}

/**
 * The Checks row: the script's checks for a file drawn in the script font, else what the file leaves out, worked out
 * again when the type or the open editor changes. For Whole project as Ink, S4-IK-31/32 notices sit above Export.
 */
function useChecksRow(
  docId: string,
  title: string,
  type: ExportFileType | null,
  p: Pagination | null,
  readyWithoutPages: boolean,
): { readonly row: SendRow | null; readonly notice: ReactNode } {
  const leftOut = type?.leftOut ?? null;
  const isInkProject = type?.id === "ink_project";
  const checks = useMemo(
    () => (p === null || leftOut !== null ? null : checksRow(docId)),
    [docId, p, leftOut],
  );
  const [said, setSaid] = useState<string | null>(null);
  useEffect(() => {
    setSaid(null);
    if (leftOut === null || (p === null && !readyWithoutPages))
      return undefined;
    let shown = true;
    leftOut({ docId, title }).then(
      (sentence) => {
        if (shown && sentence !== null) setSaid(sentence);
      },
      () => {
        // nothing is said before export; the export itself says it could not write the file
      },
    );
    return () => {
      shown = false;
    };
  }, [docId, title, leftOut, p, readyWithoutPages]);
  if (leftOut === null) return { row: checks, notice: null };
  if (said === null) return { row: null, notice: null };
  if (!isInkProject) {
    return {
      row: { id: "checks", content: said },
      notice: null,
    };
  }
  const split = splitInkProjectLines(said);
  const row: SendRow | null =
    split.checks.length === 0
      ? null
      : {
          id: "checks",
          content: (
            <ul className="flex flex-col gap-1">
              {split.checks.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          ),
        };
  const notice: ReactNode =
    split.notices.length === 0 ? null : (
      <div className="flex flex-col items-end gap-1 text-right text-ui text-fg-muted">
        {split.notices.map((line, index) => (
          <p key={index}>{line}</p>
        ))}
      </div>
    );
  return { row, notice };
}

/**
 * Writes `pages` as a file of `file`'s type, one frame on so that the busy label paints first, and saves it. Rejects,
 * saving nothing, when the file cannot be written or `signal` aborts.
 */
async function exportScript(work: {
  file: ExportFileType;
  docId: string;
  title: string;
  pages: Pagination | null;
  now: Environment["now"];
  frame: Environment["frame"];
  signal: AbortSignal;
}): Promise<void> {
  const { file, docId, title, pages, now, frame, signal } = work;
  await new Promise<void>((resolve, reject) => {
    const cancel = frame(resolve);
    signal.addEventListener(
      "abort",
      () => {
        cancel();
        reject(signal.reason);
      },
      { once: true },
    );
  });
  const written = await file.write({ docId, title, pages, now });
  signal.throwIfAborted();
  save(written.bytes, written.name, file.mime);
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

/** The Export action's state, and its `run`, which writes and saves a file of `file`'s type, then goes `back`. */
interface ExportAction {
  busy: boolean;
  problem: string | null;
  run: (file: ExportFileType, pages: Pagination | null) => Promise<void>;
}

function useExportAction(
  docId: string,
  title: string,
  back: () => void,
): ExportAction {
  const { messages, history } = useServices();
  const { frame, now } = useEnvironment();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // the form's lifetime: work still under way when it leaves stops where it is
  const left = useRef(new AbortController());
  useEffect(() => {
    const controller = new AbortController();
    left.current = controller;
    return () => controller.abort();
  }, []);

  const run = async (
    file: ExportFileType,
    pages: Pagination | null,
  ): Promise<void> => {
    const { signal } = left.current;
    setBusy(true);
    setProblem(null);
    try {
      await exportScript({ file, docId, title, pages, now, frame, signal });
    } catch {
      // a form that has left ends quietly; otherwise the person is told the file was not written and may try again
      if (signal.aborted) return;
      setProblem(WORDS.exportFailed(title));
      setBusy(false);
      return;
    }
    void history.save(docId, "export");
    messages.push(exportedMessage(title));
    back();
  };
  return { busy, problem, run };
}

/** The As row: the file type chosen among those offered, wrapping cleanly when many types are offered. */
function asRow(
  type: ExportFileType,
  types: readonly ExportFileType[],
  choose: (id: string) => void,
): SendRow {
  const wrapClass =
    types.length > WRAP_AS_THRESHOLD
      ? "[&_[data-slot=toggle-group]]:flex-wrap [&_[data-slot=toggle-group]]:gap-1 [&_[data-slot=toggle-group-item]]:rounded-md! [&_[data-slot=toggle-group-item]]:border-l!"
      : undefined;
  return {
    id: "as",
    content: (
      <div data-tour="send:as" className={wrapClass}>
        <Segmented
          label={SEND_WORDS.as}
          value={type.id}
          options={types.map(({ id, label }) => ({ value: id, label }))}
          onChange={choose}
        />
      </div>
    ),
  };
}

/**
 * The Export form: its rows from the first frame; the checks, the pages and the export itself once the document's
 * editor is open. The address's `as` (a file type's id) and `what` (a What option's id) are chosen when it opens, when
 * they are offered.
 */
export function LiveExport(props: SendFormProps): ReactNode {
  const { docId } = props;
  const to = useOfferedTo(docId);
  const isInk = to.docKind === "ink" || to.format === "ink";
  const types = typesOffered("export", to);
  const askedType = useSearchChoice("as");
  const [chosenId, choose] = useState(askedType);
  const type = types.find((entry) => entry.id === chosenId) ?? types[0] ?? null;
  const what = useWhatRow("export", type?.id ?? null, to.locked, docId);
  const whatId = what?.option.id ?? null;
  useEffect(() => {
    if (type?.id === "sides" && whatId !== null && whatId !== "sides_scenes")
      clearSidesRange(docId);
  }, [docId, type?.id, whatId]);
  const pagesOf =
    type?.id === "sides" && whatId !== "sides_scenes"
      ? null
      : (type?.pagesOf ?? null);
  const { p, pages, title, tiles, back } = useSendPages(
    docId,
    what?.option ?? null,
    pagesOf,
    what?.revision ?? 0,
  );
  const inkReady = isInk && type !== null && type.docKinds.includes("ink");
  const { row: checks, notice } = useChecksRow(docId, title, type, p, inkReady);
  const { busy, problem, run } = useExportAction(docId, title, back);
  const canRun = type !== null && (pages !== null || inkReady);
  return (
    <SendFrame
      title={WORDS.exportTitle(1)}
      aside={null}
      rows={[
        ...(checks === null ? [] : [checks]),
        ...(what === null ? [] : [what.row]),
        ...(type === null ? [] : [asRow(type, types, choose)]),
      ]}
      pages={tiles}
      hidePages={isInk}
      notice={notice}
      action={{
        label: WORDS.exportTitle(1),
        busyLabel: WORDS.exporting(1),
        busy,
        // written in one call on the main thread, which nothing can interrupt
        progress: null,
        cancel: null,
        disabledReason: null,
        problem,
        run: canRun ? () => void run(type, pages) : null,
      }}
    />
  );
}
