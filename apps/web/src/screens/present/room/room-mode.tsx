// The room window: the document's page as the shell draws it, held read-only, with nothing around it.
import { DEMO_PEOPLE } from "@manent/demo";
import { DOCUMENT_WORDS, PRESENT_WORDS, useSubscribable } from "@manent/ui";
import type { StatusFacts, Subscribable } from "@manent/ui";
import { useEffect } from "react";
import type { ReactNode } from "react";
import {
  liveEditor,
  subscribeLiveEditors,
} from "../../../editor-host/live-editor.ts";
import { focusHeading } from "../../../focus.ts";
import { useServices } from "../../../services/context.tsx";
import { pageTitle } from "../../../text.ts";
import { useOpenDocument } from "../../document/open-document.ts";
import { useDocumentTitle } from "../../document/title-bar.tsx";

// laid over the page, which the shell keeps mounted under it; the page below still takes the wheel
const PAGE_AREA = Object.freeze({ gridArea: "page" });

/** Each editor the shell builds for `docId` takes no input and draws no caret, however often it is built again. */
function useReadOnlyPage(docId: string): void {
  useEffect(() => {
    const hold = (): void => {
      liveEditor(docId)?.view.setProps({ editable: () => false });
    };
    hold();
    return subscribeLiveEditors(hold);
  }, [docId]);
}

/** The tab's title: the room window's, and the person. */
function useWindowTitle(title: string): void {
  const { userId } = useServices();
  useEffect(() => {
    const person = DEMO_PEOPLE.find((p) => p.userId === userId);
    document.title = pageTitle(
      PRESENT_WORDS.roomWindowTitle(title),
      person?.name ?? null,
    );
  }, [userId, title]);
}

/** A document the person cannot open says so in the page's place. */
function NoAccess(props: { status: Subscribable<StatusFacts> }): ReactNode {
  const { server } = useSubscribable(props.status);
  if (server !== "access_removed") return null;
  return (
    <p className="h-full bg-desk p-12 text-ui">{DOCUMENT_WORDS.noAccess}</p>
  );
}

export function RoomMode(props: { docId: string }): ReactNode {
  const { docId } = props;
  const doc = useOpenDocument(docId);
  const title = useDocumentTitle(docId);
  useReadOnlyPage(docId);
  useWindowTitle(title);
  useEffect(() => {
    focusHeading(document);
  }, [docId]);
  return (
    <div
      data-tour="present_window"
      className="pointer-events-none z-10 min-h-0"
      style={PAGE_AREA}
    >
      <h1 tabIndex={-1} className="sr-only">
        {PRESENT_WORDS.roomWindowTitle(title)}
      </h1>
      {doc === null ? null : <NoAccess status={doc.status} />}
    </div>
  );
}
