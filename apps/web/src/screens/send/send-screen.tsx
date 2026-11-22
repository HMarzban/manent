// The Send screen: the form its route names, inside the frame, over the document it sends.
import { COMMANDS } from "@manent/commands";
import { markEnd, markStart } from "@manent/perf";
import {
  CommandButton,
  LIBRARY_WORDS,
  MessageSlot,
  useSubscribable,
} from "@manent/ui";
import {
  getRouteApi,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useServices } from "../../services/context.tsx";
import { ShellRegion } from "../../shell/regions.tsx";
import { SidePosition } from "../../shell/side-position.tsx";
import { safeNext } from "../../session.ts";
import { SIDE_PANEL_TABS } from "../document/side-tabs.ts";
import { SEND_FORMS } from "./forms.ts";
import type { SendForm } from "./forms.ts";
import { SendLayout } from "./send-frame.tsx";
import type { SendPlace } from "./send-frame.tsx";
import { testSendForm } from "./test-form.tsx";

// the build's define; absent outside a build
declare const MANENT_FLAVOUR: string | undefined;

const route = getRouteApi("/s/$docId/send/$form");

// the test build adds a form no release registers, so the frame can be driven from its address
const DEFAULT_FORMS: readonly SendForm[] =
  typeof MANENT_FLAVOUR !== "undefined" && MANENT_FLAVOUR === "test"
    ? Object.freeze([...SEND_FORMS, testSendForm])
    : SEND_FORMS;

const isCommandId = (id: string): boolean =>
  COMMANDS.some((command) => command.id === id);

/** The place `from` names: Library for `/`, else the document under the screen by its title. */
function usePlaceOpenedFrom(docId: string): SendPlace {
  const navigate = useNavigate();
  const { library } = useServices();
  const searchStr = useRouterState({
    select: (state): string => state.location.searchStr,
  });
  const from = new URLSearchParams(searchStr).get("from");
  const href = from === null ? `/s/${docId}` : safeNext(from);
  const title = useSubscribable(library.documentTitle(docId));
  const name =
    href === "/"
      ? LIBRARY_WORDS.title
      : (title ?? LIBRARY_WORDS.untitledScript);
  return useMemo(
    () => ({ name, back: () => void navigate({ href }) }),
    [name, href, navigate],
  );
}

function BackToDocument(props: { docId: string }): ReactNode {
  const { docId } = props;
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ to: "/s/$docId", params: { docId }, replace: true });
  }, [navigate, docId]);
  return null;
}

/** The status bar of a screen that shows no document: the message slot and Commands. */
function SendStatusBar(): ReactNode {
  const { messages, commands } = useServices();
  return (
    <ShellRegion
      region="status_bar"
      className="flex h-statusbar shrink-0 items-center gap-2 border-t border-line px-2"
    >
      <MessageSlot
        queue={messages}
        run={(id) => commands.run(id, "control")}
        registered={isCommandId}
      />
      <CommandButton id="app.palette" size="sm" />
    </ShellRegion>
  );
}

/** The screen around one form when it is available here; otherwise it goes back to the document in place of this address. */
function FormScreen(props: { form: SendForm; docId: string }): ReactNode {
  const { form, docId } = props;
  const available = form.useAvailable(docId);
  const place = usePlaceOpenedFrom(docId);
  if (!available) return <BackToDocument docId={docId} />;
  const { Body } = form;
  return (
    // positioned, so that WebKit finds the screen, not the scrolled page under it, beneath the pointer
    <div className="relative flex min-h-0 flex-1 flex-col">
      <SendLayout
        place={place}
        side={<SidePosition docId={null} tabs={SIDE_PANEL_TABS} />}
      >
        <Body docId={docId} />
      </SendLayout>
      <SendStatusBar />
    </div>
  );
}

/** The route's component; `forms` defaults to the forms this build registers. */
export function SendScreen(props: { forms?: readonly SendForm[] }): ReactNode {
  const { forms = DEFAULT_FORMS } = props;
  const params: { docId: string; form: string } = route.useParams();
  const { docId } = params;
  const [openedAt] = useState(markStart);
  useLayoutEffect(() => markEnd("ui.open.screen", openedAt), [openedAt]);
  const form = forms.find((entry) => entry.id === params.form);
  if (form === undefined) return <BackToDocument docId={docId} />;
  // a form's hook runs only for its own form
  return <FormScreen key={form.id} form={form} docId={docId} />;
}
