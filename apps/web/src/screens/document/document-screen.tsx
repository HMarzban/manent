// The document screen: its frame drawn in the shell's areas around the page, which the shell keeps mounted.
import { DOCUMENT_WORDS, createValue, useSubscribable } from "@manent/ui";
import type { StatusFacts, Subscribable } from "@manent/ui";
import { getRouteApi } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useState } from "react";
import type { ReactNode } from "react";
import { focusHeading } from "../../focus.ts";
import { useEnvironment, useServices } from "../../services/context.tsx";
import type { DocumentServices } from "../../services/ports.ts";
import { DocumentStateBar } from "./document-state-bar.tsx";
import { StatusBar } from "./status-bar.tsx";
import { TitleBar } from "./title-bar.tsx";

const route = getRouteApi("/s/$docId");

// drawn over the page, which stays mounted under it
const PAGE_AREA = Object.freeze({ gridArea: "page" });

/** The services of `docId` while it is shown: opened before the first frame is drawn and closed when it goes. */
function useOpenDocument(docId: string): DocumentServices | null {
  const { documents } = useServices();
  const [opened, setOpened] = useState<{
    docId: string;
    doc: DocumentServices;
  } | null>(null);
  useLayoutEffect(() => {
    setOpened({ docId, doc: documents.open(docId) });
    return () => documents.close(docId);
  }, [documents, docId]);
  return opened?.docId === docId ? opened.doc : null;
}

/** In the test build, `window.__manent.setStatus(facts)` lays facts over the source's status, so the end-to-end tests can show any. */
function useTestStatus(
  source: Subscribable<StatusFacts>,
): Subscribable<StatusFacts> {
  const { flavour } = useEnvironment();
  const [status] = useState(() =>
    flavour === "test" ? createValue(source.get()) : null,
  );
  useEffect(() => {
    if (status === null) return;
    const stop = source.subscribe(status.set);
    const hook: unknown = Reflect.get(window, "__manent");
    if (typeof hook !== "object" || hook === null) return stop;
    Reflect.set(hook, "setStatus", (facts: Partial<StatusFacts>) =>
      status.set({ ...status.get(), ...facts }),
    );
    return () => {
      stop();
      Reflect.deleteProperty(hook, "setStatus");
    };
  }, [source, status]);
  return status ?? source;
}

/** A person whose access was removed sees why in the page's place. */
function NoAccess(props: { status: Subscribable<StatusFacts> }): ReactNode {
  if (useSubscribable(props.status).server !== "access_removed") return null;
  return (
    <div
      className="z-10 flex items-center justify-center bg-desk text-heading"
      style={PAGE_AREA}
    >
      <p>{DOCUMENT_WORDS.noAccess}</p>
    </div>
  );
}

function Frame(props: { docId: string; doc: DocumentServices }): ReactNode {
  const { docId } = props;
  const status = useTestStatus(props.doc.status);
  const doc = { ...props.doc, status };
  useEffect(() => {
    focusHeading(document);
  }, [docId]);
  return (
    <>
      <TitleBar docId={docId} doc={doc} />
      <DocumentStateBar docId={docId} facts={doc.stateFacts} />
      <NoAccess status={status} />
      <StatusBar />
    </>
  );
}

/** The frame of `docId`; the stand-in screen of the test build draws it around the stand-in editor. */
export function DocumentFrame(props: { docId: string }): ReactNode {
  const doc = useOpenDocument(props.docId);
  return doc === null ? null : <Frame docId={props.docId} doc={doc} />;
}

export function DocumentScreen(): ReactNode {
  const { docId }: { docId: string } = route.useParams();
  return <DocumentFrame docId={docId} />;
}
