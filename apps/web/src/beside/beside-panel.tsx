// What is open beside the page, drawn by its kind in the frame, with its own state bar and its own status.
import {
  BESIDE_WORDS,
  StateBar,
  stateBarLines,
  useSubscribable,
} from "@manent/ui";
import type { ReactNode } from "react";
import { useOpenDocument } from "../screens/document/open-document.ts";
import { useEnvironment } from "../services/context.tsx";
import type { DocumentServices } from "../services/ports.ts";
import { BesideFrame } from "./beside-frame.tsx";
import { BESIDE_KINDS } from "./kinds.ts";
import type { BesideKind } from "./kinds.ts";
import { BESIDE_BODY, closeBeside } from "./open-beside.ts";
import type { BesideOpen } from "./open-beside.ts";

// Beside displays the document's state sentence without exposing action buttons that would target the main page's document.
const NO_ACTION = (): boolean => false;
const NO_RUN = (): void => {};

/** The state bar of the document beside the page, then its body, or why it cannot be opened in its place. */
function BesideContent(props: {
  kind: BesideKind;
  open: BesideOpen;
  doc: DocumentServices;
}): ReactNode {
  const { kind, open, doc } = props;
  const status = useSubscribable(doc.status);
  const { left, right } = stateBarLines(useSubscribable(doc.stateFacts));
  if (status.server === "access_removed")
    return <p className="p-12 text-ui">{BESIDE_WORDS.noAccess}</p>;
  const { Body } = kind;
  return (
    <>
      {kind.hasStatus ? (
        <StateBar
          left={left}
          right={right}
          run={NO_RUN}
          registered={NO_ACTION}
        />
      ) : null}
      <div {...{ [BESIDE_BODY]: "" }} className="contents">
        <Body docId={open.docId} at={open.at} />
      </div>
    </>
  );
}

function BesideOf(props: { kind: BesideKind; open: BesideOpen }): ReactNode {
  const { kind, open } = props;
  const { dom } = useEnvironment();
  const title = kind.title(open.docId);
  const doc = useOpenDocument(open.docId);
  return (
    <BesideFrame
      kind={kind.id}
      title={title}
      status={kind.hasStatus ? (doc?.status ?? null) : null}
      onClose={() => {
        closeBeside();
        dom.focusPage();
      }}
      lines={null}
    >
      {doc === null ? null : (
        <BesideContent kind={kind} open={open} doc={doc} />
      )}
    </BesideFrame>
  );
}

/** `open` drawn by its kind; nothing for a kind no line of `BESIDE_KINDS` draws. */
export function BesidePanel(props: { open: BesideOpen }): ReactNode {
  const kind = BESIDE_KINDS.find((entry) => entry.id === props.open.kind);
  // a kind's title reads through hooks, so each kind and document is drawn afresh
  return kind === undefined ? null : (
    <BesideOf
      key={`${kind.id}:${props.open.docId}`}
      kind={kind}
      open={props.open}
    />
  );
}
