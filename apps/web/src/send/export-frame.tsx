// The Export form's frame, loaded apart from the entry: a clean PDF of the whole script, written from the pages
// on screen.
import type { Pagination } from "@manent/pagination";
import { EDITOR_WORDS } from "@manent/ui";
import type { Message } from "@manent/ui";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { SendFormProps } from "../screens/send/forms.ts";
import { SendFrame } from "../screens/send/send-frame.tsx";
import { useEnvironment, useServices } from "../services/context.tsx";
import { useSendPages } from "./page-tiles.tsx";
import { loadPdfFonts } from "./pdf-fonts.ts";

const WORDS = EDITOR_WORDS.send;
const NAME_LIMIT = 120;
const PDF_SUFFIX = ".pdf";
// the characters a file system refuses in a name
const REFUSED_IN_NAME = new RegExp('[/\\\\:*?"<>|]', "g");

/** `<title>.pdf`, each refused character turned into "-", at most NAME_LIMIT characters. */
function fileName(title: string): string {
  const base = [...title.replace(REFUSED_IN_NAME, "-")]
    .slice(0, NAME_LIMIT - PDF_SUFFIX.length)
    .join("");
  return `${base}${PDF_SUFFIX}`;
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`the font file ${url} answered ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

function save(bytes: Uint8Array<ArrayBuffer>, name: string): void {
  const href = URL.createObjectURL(
    new Blob([bytes], { type: "application/pdf" }),
  );
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  link.click();
  URL.revokeObjectURL(href);
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
  if (!signal.aborted) save(bytes, fileName(title));
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
      exportPdf({ pages, title, now, signal }).then(
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
      rows={[...rows, { id: "as", content: WORDS.cleanPdf }]}
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
