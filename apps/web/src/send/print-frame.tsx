// The Print form's frame, loaded apart from the entry: the pages on screen, built for the printer a batch at a
// time.
import type { Pagination } from "@manent/pagination";
import type { Frames } from "@manent/sync-client";
import { EDITOR_WORDS, LIBRARY_WORDS, useSubscribable } from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { SendFormProps } from "../screens/send/forms.ts";
import { SendFrame } from "../screens/send/send-frame.tsx";
import type { SendRow } from "../screens/send/send-frame.tsx";
import { useEnvironment, useServices } from "../services/context.tsx";
import { outsideFontRow } from "./output-checks.tsx";
import { PageTiles, useLivePagination } from "./page-tiles.tsx";
import { PRINT_ID, printCss, printPages } from "./print-pages.ts";

const WORDS = EDITOR_WORDS.send;

/**
 * The Print form: its rows from the first frame, titled Print; the checks, the pages, the page count and the print
 * itself once the document's editor is open.
 */
export function LivePrint(props: SendFormProps): ReactNode {
  const { docId } = props;
  const p = useLivePagination(docId);
  const { library } = useServices();
  const { frame } = useEnvironment();
  const navigate = useNavigate();
  const title =
    useSubscribable(library.documentTitle(docId)) ??
    LIBRARY_WORDS.untitledScript;
  const checks = useMemo(() => (p === null ? null : outsideFontRow(p)), [p]);
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
    const style = document.createElement("style");
    style.textContent = printCss(pages);
    document.head.append(style);
    const counted: Frames = {
      request: (fn) =>
        frame(() => {
          fn();
          setBuilt(document.getElementById(PRINT_ID)?.childElementCount ?? 0);
        }),
    };
    let root: HTMLElement;
    try {
      root = await printPages(pages, {
        frames: counted,
        signal: controller.signal,
      });
    } catch {
      // a build that was cancelled ends quietly; any other is said, and the person may try again
      style.remove();
      building.current = null;
      setBusy(false);
      if (!controller.signal.aborted) setProblem(WORDS.printFailed(title));
      return;
    }
    building.current = null;
    window.addEventListener(
      "afterprint",
      () => {
        root.remove();
        style.remove();
      },
      { once: true },
    );
    window.print();
    void navigate({ to: "/s/$docId", params: { docId }, replace: true });
  };

  const count = p === null ? null : p.pages.length;
  const heading = count === null ? WORDS.print : WORDS.printTitle(count);
  const rows: SendRow[] = [
    ...(checks === null ? [] : [checks]),
    { id: "what", content: WORDS.wholeScript },
  ];
  return (
    <SendFrame
      title={heading}
      aside={null}
      rows={rows}
      pages={p === null ? null : <PageTiles p={p} />}
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
