// The Print form's frame, loaded apart from the entry: the pages on screen, built for the printer a batch at a
// time.
import type { FrontPage, Pagination } from "@manent/pagination";
import type { Frames } from "@manent/sync-client";
import { EDITOR_WORDS } from "@manent/ui";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { liveFrontPages } from "../editor-host/live-editor.ts";
import type { SendFormProps } from "../screens/send/forms.ts";
import { SendFrame } from "../screens/send/send-frame.tsx";
import { useEnvironment } from "../services/context.tsx";
import type { Environment } from "../services/ports.ts";
import { useSendPages } from "./page-tiles.tsx";
import { PRINT_ID, printCss, printPages } from "./print-pages.ts";

const WORDS = EDITOR_WORDS.send;

/**
 * Builds the `front` pages and `pages` for the printer, telling `onBuilt` how many of `pages` are built after each
 * frame, and opens the print dialogue; what was built goes once printing ends. Rejects, leaving nothing behind, when
 * the build fails or `signal` aborts.
 */
async function printScript(work: {
  pages: Pagination;
  front: readonly FrontPage[];
  frame: Environment["frame"];
  signal: AbortSignal;
  onBuilt: (built: number) => void;
}): Promise<void> {
  const { pages, front, frame, signal, onBuilt } = work;
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
    root = await printPages(pages, { frames: counted, signal, front });
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
 * The Print form: its rows from the first frame, titled Print; the checks, the pages, the page count and the print
 * itself once the document's editor is open.
 */
export function LivePrint(props: SendFormProps): ReactNode {
  const { p, title, rows, tiles, back } = useSendPages(props.docId);
  const { frame } = useEnvironment();
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
    try {
      await printScript({
        pages,
        front: liveFrontPages(props.docId) ?? [],
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
    back();
  };

  const count = p === null ? null : p.pages.length;
  const heading = count === null ? WORDS.print : WORDS.printTitle(count);
  return (
    <SendFrame
      title={heading}
      aside={null}
      rows={rows}
      pages={tiles}
      action={{
        label: heading,
        // never shown before the count is known: the button is disabled until then
        busyLabel: count === null ? heading : WORDS.preparing(count),
        busy,
        progress: busy && count !== null ? WORDS.progress(built, count) : null,
        cancel: busy ? () => building.current?.abort() : null,
        disabledReason: null,
        problem,
        run: p === null ? null : () => void run(p),
      }}
    />
  );
}
