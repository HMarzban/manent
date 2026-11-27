// What is open beside the page, drawn by its kind in the frame, with its own state bar and its own status.
import {
  BESIDE_WORDS,
  Button,
  StateBar,
  stateBarLines,
  useSubscribable,
} from "@manent/ui";
import { CloudOffIcon, LockIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { EmptyHeroCard } from "../empty-hero-card.tsx";
import { useOpenDocument } from "../screens/document/open-document.ts";
import { useEnvironment, useServices } from "../services/context.tsx";
import type { DocumentServices } from "../services/ports.ts";
import { BesideFrame } from "./beside-frame.tsx";
import { BESIDE_KINDS } from "./kinds.ts";
import type { BesideKind } from "./kinds.ts";
import { BESIDE_BODY, closeBeside } from "./open-beside.ts";
import type { BesideOpen } from "./open-beside.ts";

// Beside displays the document's state sentence without exposing action buttons that would target the main page's document.
const NO_ACTION = (): boolean => false;
const NO_RUN = (): void => {};

function BesideStateCard(props: {
  icon: ReactNode;
  description: string;
  onClose(): void;
}): ReactNode {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex min-h-full flex-col items-center justify-center p-6">
        <EmptyHeroCard
          compact
          icon={props.icon}
          description={props.description}
          actions={
            <Button variant="outline" size="sm" onClick={props.onClose}>
              {BESIDE_WORDS.close}
            </Button>
          }
        />
      </div>
    </div>
  );
}

/** The state bar of the document beside the page, then its body, or why it cannot be opened in its place. */
function BesideContent(props: {
  kind: BesideKind;
  open: BesideOpen;
  doc: DocumentServices;
  onClose(): void;
}): ReactNode {
  const { kind, open, doc, onClose } = props;
  const { onDevice, ready } = useServices();
  const status = useSubscribable(doc.status);
  const { left, right } = stateBarLines(useSubscribable(doc.stateFacts));
  const [localState, setLocalState] = useState<"pending" | "held" | "absent">(
    "pending",
  );

  useEffect(() => {
    if (status.network !== "offline") {
      setLocalState("pending");
      return undefined;
    }
    let live = true;
    void ready
      .then(() => onDevice([open.docId]))
      .then(
        (held) => {
          if (live) setLocalState(held.has(open.docId) ? "held" : "absent");
        },
        () => {
          if (live) setLocalState("absent");
        },
      );
    return () => {
      live = false;
    };
  }, [status.network, open.docId, onDevice, ready]);

  if (status.server === "deleted") {
    return (
      <BesideStateCard
        icon={<Trash2Icon aria-hidden="true" className="size-5" />}
        description={BESIDE_WORDS.deleted}
        onClose={onClose}
      />
    );
  }
  if (status.server === "access_removed") {
    return (
      <BesideStateCard
        icon={<LockIcon aria-hidden="true" className="size-5" />}
        description={BESIDE_WORDS.noAccess}
        onClose={onClose}
      />
    );
  }
  if (status.network === "offline" && localState === "absent") {
    return (
      <BesideStateCard
        icon={<CloudOffIcon aria-hidden="true" className="size-5" />}
        description={BESIDE_WORDS.needsConnection}
        onClose={onClose}
      />
    );
  }
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

function OutputBesideOf(props: {
  kind: BesideKind;
  open: BesideOpen;
}): ReactNode {
  const { kind, open } = props;
  const { dom } = useEnvironment();
  const title = kind.title(open.docId);
  const { Body } = kind;
  return (
    <BesideFrame
      kind={kind.id}
      title={title}
      status={null}
      onClose={() => closeBeside(() => dom.focusPage())}
      lines={null}
    >
      <div {...{ [BESIDE_BODY]: "" }} className="contents">
        <Body docId={open.docId} at={open.at} />
      </div>
    </BesideFrame>
  );
}

function BesideOf(props: { kind: BesideKind; open: BesideOpen }): ReactNode {
  const { kind, open } = props;
  const { dom } = useEnvironment();
  const title = kind.title(open.docId);
  const doc = useOpenDocument(open.docId);
  const handleClose = (): void => closeBeside(() => dom.focusPage());
  return (
    <BesideFrame
      kind={kind.id}
      title={title}
      status={kind.hasStatus ? (doc?.status ?? null) : null}
      onClose={handleClose}
      lines={null}
    >
      {doc === null ? (
        <div
          role="status"
          aria-live="polite"
          className="flex min-h-0 flex-1 items-center justify-center p-6 text-ui text-fg-muted"
        >
          {BESIDE_WORDS.opening}
        </div>
      ) : (
        <BesideContent
          kind={kind}
          open={open}
          doc={doc}
          onClose={handleClose}
        />
      )}
    </BesideFrame>
  );
}

/** `open` drawn by its kind; nothing for a kind no line of `BESIDE_KINDS` draws. */
export function BesidePanel(props: { open: BesideOpen }): ReactNode {
  const kind = BESIDE_KINDS.find((entry) => entry.id === props.open.kind);
  // a kind's title reads through hooks, so each kind and document is drawn afresh
  if (kind === undefined) return null;
  const key = `${kind.id}:${props.open.docId}`;
  return kind.hasStatus ? (
    <BesideOf key={key} kind={kind} open={props.open} />
  ) : (
    <OutputBesideOf key={key} kind={kind} open={props.open} />
  );
}
