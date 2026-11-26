// The Send screen: the form its route names, inside the frame, over the document it sends.
import { COMMANDS } from "@manent/commands";
import { markEnd, markStart } from "@manent/perf";
import {
  Button,
  LIBRARY_WORDS,
  MessageSlot,
  SEND_WORDS,
  useSubscribable,
} from "@manent/ui";
import {
  getRouteApi,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { LockIcon } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { EmptyHeroCard } from "../../empty-hero-card.tsx";
import { useServices } from "../../services/context.tsx";
import { safeNext } from "../../session.ts";
import { CommandsButton } from "../../shell/commands-button.tsx";
import { ShellRegion } from "../../shell/regions.tsx";
import { SidePosition } from "../../shell/side-position.tsx";
import { panelsActions, usePanel } from "../../state/panels.store.ts";
import { SIDE_PANEL_TABS } from "../document/side-tabs.ts";
import { SEND_FORMS } from "./forms.ts";
import type { SendAvailability, SendForm } from "./forms.ts";
import { SendFormSkeleton, SendLayout } from "./send-frame.tsx";
import type { SendPlace } from "./send-frame.tsx";
import { testSendForm } from "./test-form.tsx";

// the build's define; absent outside a build
declare const MANENT_FLAVOUR: string | undefined;

const route = getRouteApi("/s/$docId/send/$form");

// below 1,024 px the open side panel overlays the Send form instead of squeezing it
const OVERLAY_BREAKPOINT_PX = 1_024;

// the test build adds a form no release registers, so the frame can be driven from its address
const DEFAULT_FORMS: readonly SendForm[] =
  typeof MANENT_FLAVOUR !== "undefined" && MANENT_FLAVOUR === "test"
    ? Object.freeze([...SEND_FORMS, testSendForm])
    : SEND_FORMS;

const isCommandId = (id: string): boolean =>
  COMMANDS.some((command) => command.id === id);

function subscribeResize(listener: () => void): () => void {
  window.addEventListener("resize", listener);
  return () => window.removeEventListener("resize", listener);
}

function useOverlaySide(): boolean {
  const widthPx = useSyncExternalStore(
    subscribeResize,
    () => window.innerWidth,
    () => OVERLAY_BREAKPOINT_PX,
  );
  return widthPx < OVERLAY_BREAKPOINT_PX;
}

/** True only when the open side tab is actually present on SendScreen (e.g. Tour in demo mode). */
function useHasVisibleSideTab(): boolean {
  const { tab } = usePanel("side");
  const states = SIDE_PANEL_TABS.map((entry) => ({
    id: entry.id,
    present: entry.useTab(null).present,
  }));
  return states.some((entry) => entry.present && entry.id === tab);
}

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
      <CommandsButton />
    </ShellRegion>
  );
}

function SendOverlayPanel(props: { open: boolean }): ReactNode {
  if (!props.open) return null;
  return (
    <>
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-titlebar bottom-statusbar z-10 bg-scrim animate-in fade-in-0 duration-(--dur-fast) ease-out"
        onClick={() => panelsActions.close("side")}
      />
      <div
        data-overlay=""
        className="absolute top-titlebar end-0 bottom-statusbar z-20 flex max-w-full border-s border-line shadow-overlay animate-in fade-in-0 slide-in-from-end-4 duration-(--dur-base) ease-out [&>[data-region='side_panel']]:max-w-full"
      >
        <SidePosition docId={null} tabs={SIDE_PANEL_TABS} />
      </div>
    </>
  );
}

function SendHeaderOnly(props: { place: SendPlace }): ReactNode {
  const { place } = props;
  return (
    <header className="flex h-titlebar shrink-0 items-center gap-2 border-b border-line px-2">
      <Button variant="ghost" className="text-fg-muted" onClick={place.back}>
        {SEND_WORDS.back(place.name)}
      </Button>
    </header>
  );
}

function UnavailableForm(props: {
  place: SendPlace;
  reason: string;
  overlay: boolean;
  sideOpen: boolean;
}): ReactNode {
  const { place, reason, overlay, sideOpen } = props;
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-x-clip">
      <SendHeaderOnly place={place} />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 flex-1 overflow-y-auto p-6">
          <div className="flex min-h-full w-full flex-col items-center justify-center">
            <EmptyHeroCard
              icon={<LockIcon aria-hidden="true" className="size-5" />}
              title={SEND_WORDS.unavailableTitle}
              headingAs="h2"
              description={reason}
              actions={
                <Button onClick={place.back}>{SEND_WORDS.backToScript}</Button>
              }
            />
          </div>
        </div>
        {overlay ? null : <SidePosition docId={null} tabs={SIDE_PANEL_TABS} />}
      </div>
      {overlay ? <SendOverlayPanel open={sideOpen} /> : null}
      <SendStatusBar />
    </div>
  );
}

function LoadingForm(props: {
  place: SendPlace;
  overlay: boolean;
  sideOpen: boolean;
}): ReactNode {
  const { place, overlay, sideOpen } = props;
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-x-clip">
      <SendHeaderOnly place={place} />
      <div className="flex min-h-0 flex-1">
        <SendFormSkeleton rows={5} />
        {overlay ? null : <SidePosition docId={null} tabs={SIDE_PANEL_TABS} />}
      </div>
      {overlay ? <SendOverlayPanel open={sideOpen} /> : null}
      <SendStatusBar />
    </div>
  );
}

function normaliseAvailability(
  value: boolean | SendAvailability,
): "redirect" | SendAvailability {
  if (value === true) return "available";
  if (value === false) return "redirect";
  return value;
}

/** The screen around one form when it is available here; otherwise it hydrates, explains why not, or goes back. */
function FormScreen(props: { form: SendForm; docId: string }): ReactNode {
  const { form, docId } = props;
  const availability = normaliseAvailability(form.useAvailable(docId));
  const place = usePlaceOpenedFrom(docId);
  const overlay = useOverlaySide();
  const sideOpen = useHasVisibleSideTab();

  if (availability === "redirect") return <BackToDocument docId={docId} />;
  if (availability === "loading")
    return <LoadingForm place={place} overlay={overlay} sideOpen={sideOpen} />;
  if (typeof availability === "object") {
    return (
      <UnavailableForm
        place={place}
        reason={availability.reason}
        overlay={overlay}
        sideOpen={sideOpen}
      />
    );
  }
  const { Body } = form;
  return (
    // positioned, so that WebKit finds the screen, not the scrolled page under it, beneath the pointer
    <div className="relative flex min-h-0 flex-1 flex-col overflow-x-clip">
      <SendLayout
        place={place}
        side={
          overlay ? null : <SidePosition docId={null} tabs={SIDE_PANEL_TABS} />
        }
      >
        <Body docId={docId} />
      </SendLayout>
      {overlay ? <SendOverlayPanel open={sideOpen} /> : null}
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
