// The demo bar's controls, start to end: the person, the Connection, Add writers, the server, Timings, Reorganise,
// Reset, and at the far end the Tour.
import {
  Avatar,
  Button,
  CommandButton,
  DEMO_WORDS,
  Popover,
  PopoverContent,
  PopoverTrigger,
  useCommandState,
  useSubscribable,
} from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PanelRightIcon, PowerIcon, SlidersHorizontalIcon } from "lucide-react";
import { useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { initialsOf } from "../initials.ts";
import { useAnnouncer } from "../shell/announcer-region.tsx";
import type { TabPerson } from "../session.ts";
import { useEnvironment } from "../services/context.tsx";
import type { ConnectionMode } from "../services/sync/device-memory.ts";
import { asUiSubscribable } from "../services/sync/subscribable.ts";
import { usePanel } from "../state/panels.store.ts";
import { useTourActive } from "../state/tour.store.ts";
import { FactsContext } from "../state/bridge-contexts.ts";
import { TEXT, serverStatusText } from "../text.ts";
import { BarButton } from "./bar-button.tsx";
import { ConnectionChoice, useConnectionControl } from "./connection.tsx";
import { BarLabelled } from "./demo-bar-control.tsx";
import { ReorganiseControl } from "./reorganise-control.tsx";
import { ResetControl } from "./reset-control.tsx";
import { Timings } from "./timings.tsx";
import { SERVER_STATUS_QUERY, useServerState } from "./use-demo.ts";
import type { DemoControl } from "./use-demo.ts";
import { WritersControl } from "./writers-control.tsx";

/**
 * Before a person is chosen the bar holds only the server: every other control acts on the person's sync, or needs the
 * shell, which exists once the tab has a person.
 */
export function DemoBarControls(props: {
  person: TabPerson | null;
  onPersonClick: () => void;
  control: DemoControl | null;
  resetting: boolean;
}): ReactNode {
  // the shell provides the services and the commands together with the bridge's contexts
  const inShell = useContext(FactsContext) !== null;
  const { control } = props;
  // always one row: short of room labels drop, then secondary controls fold into DemoToolsPopover below sm
  return (
    <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-x-2 sm:gap-x-3">
      <Person person={props.person} onClick={props.onPersonClick} />
      {inShell ? (
        <ShellControls control={control} />
      ) : (
        control && <ServerControl {...control} resetting={props.resetting} />
      )}
    </div>
  );
}

/** Before the Connection is known the tab is online, as its sync starts. */
const ONLINE: Subscribable<ConnectionMode> = Object.freeze({
  get: () => "online",
  subscribe: () => () => {},
});

/** Compact menu holding secondary demo controls on viewports below `sm` so the bar stays one 32 px row. */
function DemoToolsPopover(props: { children: ReactNode }): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex shrink-0 sm:hidden">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={TEXT.demoTools}
              title={TEXT.demoTools}
            />
          }
        >
          <SlidersHorizontalIcon aria-hidden="true" className="size-icon" />
        </PopoverTrigger>
        <PopoverContent
          align="end"
          data-surface="demo"
          className="flex w-auto flex-col gap-2 p-3"
        >
          {props.children}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function ShellControls(props: { control: DemoControl | null }): ReactNode {
  const { control } = props;
  const connection = useConnectionControl();
  const mode = useSubscribable(
    connection === null ? ONLINE : asUiSubscribable(connection.mode),
  );
  const offline = mode === "offline";
  // before its first answer, and without a control, the server is taken to be running
  const server = useServerState(control);
  const unreachable = offline
    ? DEMO_WORDS.needsConnection
    : server === null || server === "running"
      ? null
      : DEMO_WORDS.needsServer;
  const { docId } = useSubscribable(useEnvironment().shellState);
  // Sign in to sync is offered until the person is signed in
  const signedIn = !useCommandState("app.signInToSync").visible;
  const secondary = (
    <>
      <WritersControl
        docId={docId}
        signedIn={signedIn}
        unreachable={unreachable}
      />
      {/* the shell is not drawn while the demo resets */}
      {control && <ServerControl {...control} resetting={false} />}
      <Timings docId={docId} offline={offline} />
      <ReorganiseControl
        docId={docId}
        signedIn={signedIn}
        unreachable={unreachable}
      />
      {control && <ResetControl {...control} />}
    </>
  );
  return (
    <>
      {connection && <ConnectionChoice control={connection} />}
      <div className="hidden sm:contents">{secondary}</div>
      <DemoToolsPopover>{secondary}</DemoToolsPopover>
      <Tour />
    </>
  );
}

/**
 * Opens Choose who you are; its name is the label and the person together ("Person: Dana Reyes"). Not drawn before a
 * person is chosen, when the tab is on that screen and has no person to show.
 */
function Person(props: {
  person: TabPerson | null;
  onClick: () => void;
}): ReactNode {
  const { person, onClick } = props;
  if (person === null) return null;
  return (
    <BarLabelled label={TEXT.person} tour="demo:person">
      <Button
        variant="ghost"
        size="sm"
        aria-label={DEMO_WORDS.person(person.name)}
        onClick={onClick}
        className="px-1 sm:px-2"
      >
        <Avatar
          name={person.name}
          initials={initialsOf(person.name)}
          colour={null}
          size="sm"
          decorative
        />
        <span className="hidden sm:inline">{person.name}</span>
      </Button>
    </BarLabelled>
  );
}

function ServerControl(props: DemoControl & { resetting: boolean }): ReactNode {
  const { client } = props;
  const queryClient = useQueryClient();
  const queryKey = [SERVER_STATUS_QUERY, props.id];
  const answered = useServerState(props);
  // an answer to a question asked before the reset began says it is still running
  const state = props.resetting ? "resetting" : answered;
  const action = useMutation({
    mutationFn: (kind: "stop" | "start") =>
      kind === "stop" ? client.stop() : client.start(),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const announcer = useAnnouncer();
  // the bar shows the first answer; only a change is said, so a page that opens does not say the server is running
  const known = useRef(state);
  useEffect(() => {
    const before = known.current;
    known.current = state;
    if (before !== null && state !== null && state !== before)
      announcer.announce(serverStatusText(state));
  }, [announcer, state]);
  const kind =
    state === "running"
      ? "stop"
      : state === "stopped" || state === "failed"
        ? "start"
        : null;

  return (
    <div data-tour="demo:server" className="flex min-w-0 items-center gap-2">
      {kind && (
        <BarButton
          label={kind === "stop" ? TEXT.stopServer : TEXT.startServer}
          icon={PowerIcon}
          drops="later"
          hint={kind === "stop" ? DEMO_WORDS.stopServerHint : undefined}
          disabled={action.isPending}
          onClick={() => action.mutate(kind)}
        />
      )}
      {/* the first words to go where the bar runs out of room; the shell's announcer says the whole sentence */}
      <p data-slot="bar-status" className="min-w-0 truncate text-fg-muted">
        {state && serverStatusText(state)}
      </p>
    </div>
  );
}

/** Pressed while the side panel shows the Tour; carries a quiet dot while a scenario is in progress. */
function Tour(): ReactNode {
  const showing = usePanel("side").tab === "tour";
  const active = useTourActive() !== null;
  return (
    <div className="ms-auto flex shrink-0">
      <CommandButton
        id="demo.tour"
        variant="outline"
        size="sm"
        icon={
          <span className="relative inline-flex items-center">
            <PanelRightIcon aria-hidden="true" className="size-icon" />
            {active && !showing ? (
              <span
                aria-hidden="true"
                className="absolute -end-0.5 -top-0.5 size-1.5 rounded-full bg-primary"
              />
            ) : null}
          </span>
        }
        pressed={showing}
      />
    </div>
  );
}
