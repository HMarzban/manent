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
import { useOfferedTo, useSearchChoice, useWhatRow } from "./export-form.tsx";
import { typesOffered } from "./file-types.ts";
import { useSendPages } from "./page-tiles.tsx";
import { fileName, save } from "./script-file.ts";
import type { ExportFileType } from "./script-file.ts";
import { pagesFor } from "./what-options.ts";

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
 * editor is open. The address's `as` (a file type's id) and `what` (a What option's id) are chosen when it opens, when
 * they are offered.
 */
export function LiveExport(props: SendFormProps): ReactNode {
  const { docId } = props;
  const { p, title, tiles, back } = useSendPages(docId);
  const { messages, history, documents } = useServices();
  const { frame, now } = useEnvironment();
  const to = useOfferedTo(docId);
  const types = typesOffered("export", to);
  const askedType = useSearchChoice("as");
  const [chosenId, choose] = useState(askedType);
  const type = types.find((entry) => entry.id === chosenId) ?? types[0] ?? null;
  const what = useWhatRow("export", type?.id ?? null, to.locked);
  const option = what?.option ?? null;
  const pages = useMemo(
    () =>
      p === null || option === null
        ? null
        : pagesFor(option, docId, p, () =>
            documents.open(docId).material.materialSnapshotOf(docId),
          ),
    [p, option, docId, documents],
  );
  const checks = useChecksRow(docId, title, type, p);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // the form's lifetime: work still under way when it leaves stops where it is
  const left = useRef(new AbortController());
  useEffect(() => {
    const controller = new AbortController();
    left.current = controller;
    return () => controller.abort();
  }, []);

  const run = (file: ExportFileType, sent: Pagination): void => {
    const { signal } = left.current;
    setBusy(true);
    setProblem(null);
    // one frame first, so that the busy label paints before the file is written
    const cancel = frame(() => {
      file.write({ docId, title, pages: sent, now }).then(
        (bytes) => {
          if (signal.aborted) return;
          save(bytes, fileName(title, file.extension), file.mime);
          void history.save(docId, "export");
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
        ...(checks === null ? [] : [checks]),
        ...(what === null ? [] : [what.row]),
        ...(type === null
          ? []
          : [
              {
                id: "as" as const,
                content: (
                  <div data-tour="send:as">
                    <Segmented
                      label={SEND_WORDS.as}
                      value={type.id}
                      options={types.map(({ id, label }) => ({
                        value: id,
                        label,
                      }))}
                      onChange={choose}
                    />
                  </div>
                ),
              },
            ]),
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
        run: pages === null || type === null ? null : () => run(type, pages),
      }}
    />
  );
}
