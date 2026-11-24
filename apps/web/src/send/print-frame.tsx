// The Print form's frame for a script, loaded apart from the entry: the pages of what its What row chose, built for
// the printer a batch at a time.
import type { FrontPage, Pagination } from "@manent/pagination";
import type { Frames } from "@manent/sync-client";
import { EDITOR_WORDS } from "@manent/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { checksRow } from "../checks/send-row.tsx";
import { liveFrontPages, liveFurniture } from "../editor-host/live-editor.ts";
import type { PageFurnitureOptions } from "../editor-host/live-editor.ts";
import type { SendFormProps } from "../screens/send/forms.ts";
import { SendFrame } from "../screens/send/send-frame.tsx";
import { useEnvironment, useServices } from "../services/context.tsx";
import type { Environment } from "../services/ports.ts";
import { useOfferedTo, useWhatRow } from "./export-form.tsx";
import { typesPrinted } from "./file-types.ts";
import { useSendPages } from "./page-tiles.tsx";
import { PRINT_ID, printCss, printPages } from "./print-pages.ts";

const WORDS = EDITOR_WORDS.send;

function isoDay(at: number): string {
  const date = new Date(at);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Builds the `front` pages and `pages` for the printer, telling `onBuilt` how many of `pages` are built after each
 * frame, and opens the print dialogue; what was built goes once printing ends. Rejects, leaving nothing behind, when
 * the build fails or `signal` aborts.
 */
async function printScript(work: {
  pages: Pagination;
  front: readonly FrontPage[];
  furniture: PageFurnitureOptions;
  frame: Environment["frame"];
  signal: AbortSignal;
  onBuilt: (built: number) => void;
}): Promise<void> {
  const { pages, front, furniture, frame, signal, onBuilt } = work;
  const style = document.createElement("style");
  style.textContent = printCss(pages);
  document.head.append(style);
  const counted: Frames = {
    request: (fn) =>
      frame(() => {
        fn();
        const sheets = document.getElementById(PRINT_ID)?.childElementCount;
        onBuilt(Math.max(0, (sheets ?? 0) - front.length));
      }),
  };
  let root: HTMLElement;
  try {
    root = await printPages(pages, {
      frames: counted,
      signal,
      front,
      furniture,
    });
  } catch (reason) {
    style.remove();
    throw reason;
  }
  window.addEventListener(
    "afterprint",
    () => {
      root.remove();
      style.remove();
    },
    { once: true },
  );
  window.print();
}

/**
 * The Print action's state: `built` counts the pages built so far; `run` builds and prints its pages, then goes `back`;
 * `cancel` aborts a build under way.
 */
interface PrintAction {
  busy: boolean;
  built: number;
  problem: string | null;
  run: (pages: Pagination) => Promise<void>;
  cancel: () => void;
}

function usePrintAction(
  docId: string,
  title: string,
  back: () => void,
): PrintAction {
  const { frame, now } = useEnvironment();
  const { history } = useServices();
  const [busy, setBusy] = useState(false);
  const [built, setBuilt] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const building = useRef<AbortController | null>(null);
  // Back aborts a build under way
  useEffect(() => () => building.current?.abort(), []);

  const run = async (pages: Pagination): Promise<void> => {
    const controller = new AbortController();
    building.current = controller;
    setBusy(true);
    setProblem(null);
    setBuilt(0);
    const live = liveFurniture(docId);
    const furniture: PageFurnitureOptions = {
      ...live,
      sections: undefined,
      day: live.day ?? isoDay(now()),
    };
    try {
      await printScript({
        pages,
        front: liveFrontPages(docId) ?? [],
        furniture,
        frame,
        signal: controller.signal,
        onBuilt: setBuilt,
      });
    } catch {
      // a build that was cancelled ends quietly; any other is said, and the person may try again
      building.current = null;
      setBusy(false);
      if (!controller.signal.aborted) setProblem(WORDS.printFailed(title));
      return;
    }
    building.current = null;
    void history.save(docId, "export");
    back();
  };
  return { busy, built, problem, run, cancel: () => building.current?.abort() };
}

/**
 * The Print form: its rows from the first frame, titled Print; the checks, the pages, the page count and the print
 * itself once the document's editor is open.
 */
export function LivePrint(props: SendFormProps): ReactNode {
  const { docId } = props;
  const to = useOfferedTo(docId);
  const [printed] = typesPrinted(to);
  const what = useWhatRow("print", printed?.id ?? null, to.locked);
  const { p, pages, title, tiles, back } = useSendPages(
    docId,
    what?.option ?? null,
  );
  const checks = useMemo(
    () => (p === null ? null : checksRow(docId)),
    [docId, p],
  );
  const { busy, built, problem, run, cancel } = usePrintAction(
    docId,
    title,
    back,
  );
  const count = pages === null ? null : pages.pages.length;
  const heading = count === null ? WORDS.print : WORDS.printTitle(count);
  return (
    <SendFrame
      title={heading}
      aside={null}
      rows={[
        ...(checks === null ? [] : [checks]),
        ...(what === null ? [] : [what.row]),
      ]}
      pages={tiles}
      action={{
        label: heading,
        // never shown before the count is known: the button is disabled until then
        busyLabel: count === null ? heading : WORDS.preparing(count),
        busy,
        progress: busy && count !== null ? WORDS.progress(built, count) : null,
        cancel: busy ? cancel : null,
        disabledReason: null,
        problem,
        run: pages === null ? null : () => void run(pages),
      }}
    />
  );
}
