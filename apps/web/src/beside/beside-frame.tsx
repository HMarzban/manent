// The frame of what is beside the page: over the page's right half, a header row of its title, both status slots and
// ✕, the lines under that row, and its body. The page moves aside, out from under it.
import { CloseButton, DOCUMENT_WORDS } from "@manent/ui";
import type { StatusFacts, Subscribable } from "@manent/ui";
import { useLayoutEffect } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useStatusSlots } from "../screens/document/status-button.tsx";
import type { BesideKindId } from "./kinds.ts";

const PAGE_REGION = "[data-region='page']";
const PAGE_AREA = Object.freeze({ gridArea: "page" });

/** The status in the header's two slots, as the title bar says it. */
function BesideStatus(props: { source: Subscribable<StatusFacts> }): ReactNode {
  const { root, deviceSlot, serverSlot } = useStatusSlots(props.source);
  return (
    <span
      ref={root}
      className="group flex shrink-0 tabular-nums data-[tone=alert]:text-danger data-[tone=attention]:text-attention data-[tone=quiet]:text-fg-muted"
    >
      <span ref={deviceSlot} className="group-data-spans:hidden" />
      <span className="whitespace-pre group-data-spans:hidden">{" · "}</span>
      <span ref={serverSlot} />
    </span>
  );
}

/**
 * `kind` is what the frame holds: a version of the page's own document, which counts as part of the page, or a kind of
 * `BESIDE_KINDS`, which is the side position. `status` is null for an output, which has none. Nothing is drawn while
 * the window has no page.
 */
export function BesideFrame(props: {
  kind: BesideKindId | "version";
  title: string;
  status: Subscribable<StatusFacts> | null;
  onClose(): void;
  /** Under the header row, inside the header. */
  lines: ReactNode;
  children: ReactNode;
}): ReactNode {
  const { kind, title, status, onClose, lines, children } = props;
  const page = document.querySelector<HTMLElement>(PAGE_REGION);
  useLayoutEffect(() => {
    if (page === null) return undefined;
    page.style.paddingRight = "50%";
    return () => {
      page.style.paddingRight = "";
    };
  }, [page]);
  const grid = page?.parentElement ?? null;
  if (grid === null) return null;
  return createPortal(
    <div
      data-beside={kind}
      data-region={kind === "version" ? "page" : "side_panel"}
      className="z-10 flex min-h-0 w-1/2 flex-col justify-self-end border-l border-line bg-desk"
      style={PAGE_AREA}
    >
      <header className="flex flex-col gap-1 px-3 py-2 text-ui">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate">{title}</span>
          {status === null ? null : <BesideStatus source={status} />}
          <CloseButton
            label={DOCUMENT_WORDS.closeBeside(title)}
            onClick={onClose}
          />
        </div>
        {lines}
      </header>
      {children}
    </div>,
    grid,
  );
}
