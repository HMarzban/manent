// The Export form's frame, loaded apart from the entry: a clean PDF of the whole script, written from the pages
// on screen.
import type { Pagination } from "@manent/pagination";
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
 * The Export form: its rows from the first frame; the checks, the pages and the export itself once the document's
 * editor is open.
 */
export function LiveExport(props: SendFormProps): ReactNode {
  const { docId } = props;
  const p = useLivePagination(docId);
  const { library, messages } = useServices();
  const { frame, now } = useEnvironment();
  const navigate = useNavigate();
  const title =
    useSubscribable(library.documentTitle(docId)) ??
    LIBRARY_WORDS.untitledScript;
  const checks = useMemo(() => (p === null ? null : outsideFontRow(p)), [p]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // the form's lifetime: work still under way when it leaves stops where it is
  const left = useRef(new AbortController());
  useEffect(() => {
    const controller = new AbortController();
    left.current = controller;
    return () => controller.abort();
  }, []);

  const write = async (pages: Pagination): Promise<void> => {
    const { signal } = left.current;
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      const [fonts, { writePdf }] = await Promise.all([
        loadPdfFonts(fetchBytes),
        import("@manent/formats"),
      ]);
      // a copy over an ArrayBuffer of its own, which a Blob takes
      bytes = new Uint8Array(
        await writePdf(pages, { fonts, title, createdAt: now() }),
      );
    } catch {
      // the person is told the file was not written and may try again; nothing was saved
      if (signal.aborted) return;
      setProblem(WORDS.exportFailed(title));
      setBusy(false);
      return;
    }
    if (signal.aborted) return;
    save(bytes, fileName(title));
    messages.push({
      id: "exported",
      text: WORDS.exported(title),
      actions: [],
      lifetime: "brief",
      ownWork: false,
    });
    void navigate({ to: "/s/$docId", params: { docId }, replace: true });
  };
  const run = (pages: Pagination): void => {
    setBusy(true);
    setProblem(null);
    // one frame first, so that the busy label paints before the page is written
    const cancel = frame(() => void write(pages));
    left.current.signal.addEventListener("abort", cancel, { once: true });
  };

  const rows: SendRow[] = [
    ...(checks === null ? [] : [checks]),
    { id: "what", content: WORDS.wholeScript },
    { id: "as", content: WORDS.cleanPdf },
  ];
  return (
    <SendFrame
      title={WORDS.exportTitle(1)}
      aside={null}
      rows={rows}
      pages={p === null ? null : <PageTiles p={p} />}
      action={{
        label: WORDS.exportTitle(1),
        busyLabel: WORDS.exporting(1),
        busy,
        // written in one call on the main thread, which nothing can interrupt
        progress: null,
        cancel: null,
        disabledReason: null,
        problem,
        // nothing leaves before the pages, and the checks drawn from them, are on screen
        run: () => {
          if (p !== null) run(p);
        },
      }}
    />
  );
}
