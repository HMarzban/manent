// Where am I?: the caret's element, character, scene and page (with its revision), the status and the mode, read
// once through the shell's polite announcer each time it is asked.
import type { LayoutBlock } from "@manent/pagination";
import { PLACE_WORDS, READOUT_WORDS, statusText } from "@manent/ui";
import { useContext, useEffect, useRef } from "react";
import { livePagination } from "../../editor-host/live-editor.ts";
import { useAnnouncer } from "../../shell/announcer-region.tsx";
import { FactsContext } from "../../state/bridge-contexts.ts";
import { useWhereAsked } from "../../state/where.store.ts";
import { useOpenDocument } from "./open-document.ts";
import { pageReadoutOf } from "./status-bar.tsx";

// the elements of a speech after its cue
const SPEECH: ReadonlySet<string> = new Set(["parenthetical", "dialogue"]);

/** The cue of the speech the block `blockId` is in, as typed; null outside a speech. */
function cueOf(
  blocks: readonly LayoutBlock[],
  blockId: string | null,
): string | null {
  for (let i = blocks.findIndex((b) => b.id === blockId); i >= 0; i--) {
    const { type, text } = blocks[i]!;
    if (type === "character") return text;
    if (!SPEECH.has(type)) return null;
  }
  return null;
}

/** `mode` is the state bar's right-hand sentence; null when it says nothing. The facts are read when asked, never rendered. */
export function useWhereAmI(docId: string, mode: string | null): void {
  const asked = useWhereAsked();
  const facts = useContext(FactsContext);
  const status = useOpenDocument(docId)?.status ?? null;
  const announcer = useAnnouncer();
  const heard = useRef(asked);
  useEffect(() => {
    if (asked === heard.current || facts === null || status === null) return;
    heard.current = asked;
    const scene = facts.get("scene");
    const blockId = facts.get("blockId");
    const { device, server } = statusText(status.get());
    const page = pageReadoutOf({
      page: facts.get("page"),
      pageCount: facts.get("pageCount"),
      pageRevision: facts.get("pageRevision"),
      pageOrdinal: facts.get("pageOrdinal"),
    });
    const element = facts.get("element");
    const parts = [
      element,
      cueOf(livePagination(docId)?.blocks ?? [], blockId),
      scene === null ? null : READOUT_WORDS.scene(scene),
      page,
      device,
      server,
      mode,
    ];
    announcer.announce(
      PLACE_WORDS.whereAmI(parts.filter((part) => part !== null)),
      "polite",
    );
  }, [asked, docId, facts, status, announcer, mode]);
}
