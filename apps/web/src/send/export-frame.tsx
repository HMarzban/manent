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

const WORDS = EDITOR_WORDS.send;

/**
 * The Checks row: the script's checks for a file drawn in the script font, else what the file leaves out, worked out
 * again when the type or the open editor changes. Nothing while the pages are not known.
 */
function useChecksRow(
  docId: string,
  title: string,
  type: ExportFileType | null,
  p: Pagination | null,
): SendRow | null {
  const leftOut = type?.leftOut ?? null;
  const checks = useMemo(
    () => (p === null || leftOut !== null ? null : checksRow(docId)),
    [docId, p, leftOut],
  );
  const [said, setSaid] = useState<SendRow | null>(null);
  useEffect(() => {
    setSaid(null);
    if (leftOut === null || p === null) return undefined;
    let shown = true;
    leftOut({ docId, title }).then(
      (sentence) => {
        if (shown && sentence !== null)
          setSaid({ id: "checks", content: sentence });
      },
      () => {
        // nothing is said before export; the export itself says it could not write the file
      },
    );
    return () => {
      shown = false;
    };
  }, [docId, title, leftOut, p]);
  return leftOut === null ? checks : said;
}

/**
 * Writes `pages` as a file of `file`'s type, one frame on so that the busy label paints first, and saves it. Rejects,
 * saving nothing, when the file cannot be written or `signal` aborts.
 */
async function exportScript(work: {
  file: ExportFileType;
  docId: string;
  title: string;
  pages: Pagination;
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
  run: (file: ExportFileType, pages: Pagination) => Promise<void>;
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
    pages: Pagination,
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

/** The As row: the file type chosen among those offered. */
function asRow(
  type: ExportFileType,
  types: readonly ExportFileType[],
  choose: (id: string) => void,
): SendRow {
  return {
    id: "as",
    content: (
      <div data-tour="send:as">
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
  const types = typesOffered("export", to);
  const askedType = useSearchChoice("as");
  const [chosenId, choose] = useState(askedType);
  const type = types.find((entry) => entry.id === chosenId) ?? types[0] ?? null;
  const what = useWhatRow("export", type?.id ?? null, to.locked);
  const { p, pages, title, tiles, back } = useSendPages(
    docId,
    what?.option ?? null,
  );
  const checks = useChecksRow(docId, title, type, p);
  const { busy, problem, run } = useExportAction(docId, title, back);
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
      action={{
        label: WORDS.exportTitle(1),
        busyLabel: WORDS.exporting(1),
        busy,
        // written in one call on the main thread, which nothing can interrupt
        progress: null,
        cancel: null,
        disabledReason: null,
        problem,
        run:
          pages === null || type === null ? null : () => void run(type, pages),
      }}
    />
  );
}
