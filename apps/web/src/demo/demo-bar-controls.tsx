// The demo bar's controls, start to end: the person, the Connection, Add writers, the server, Timings, Reorganise,
// Reset, and at the far end the Tour.
import { Avatar, Button, CommandButton, useSubscribable } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PanelRightIcon, PowerIcon } from "lucide-react";
import { useContext } from "react";
import type { ReactNode } from "react";
import { initialsOf } from "../initials.ts";
import { personLabel } from "../session.ts";
import type { TabPerson } from "../session.ts";
import { useEnvironment } from "../services/context.tsx";
import type { ConnectionMode } from "../services/sync/device-memory.ts";
import { asUiSubscribable } from "../services/sync/subscribable.ts";
import { usePanel } from "../state/panels.store.ts";
import { FactsContext } from "../state/bridge-contexts.ts";
import { TEXT, serverStatusText } from "../text.ts";
import { BarButton } from "./bar-button.tsx";
import { ConnectionChoice, useConnectionControl } from "./connection.tsx";
import { BarLabelled } from "./demo-bar-control.tsx";
import { ReorganiseControl } from "./reorganise-control.tsx";
import { ResetControl } from "./reset-control.tsx";
import { Timings } from "./timings.tsx";
import { POLL_MS, SERVER_STATUS_QUERY } from "./use-demo.ts";
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
}): ReactNode {
  // the shell provides the services and the commands together with the bridge's contexts
  const inShell = useContext(FactsContext) !== null;
  const { control } = props;
  return (
    <>
      <Person person={props.person} onClick={props.onPersonClick} />
      {inShell ? (
        <ShellControls control={control} />
      ) : (
        control && <ServerControl {...control} />
      )}
    </>
  );
}

/** Before the Connection is known the tab is online, as its sync starts. */
const ONLINE: Subscribable<ConnectionMode> = Object.freeze({
  get: () => "online",
  subscribe: () => () => {},
});

function ShellControls(props: { control: DemoControl | null }): ReactNode {
  const { control } = props;
  const connection = useConnectionControl();
  const mode = useSubscribable(
    connection === null ? ONLINE : asUiSubscribable(connection.mode),
  );
  const offline = mode === "offline";
  const { docId } = useSubscribable(useEnvironment().shellState);
  return (
    <>
      {connection && <ConnectionChoice control={connection} />}
      <WritersControl docId={docId} offline={offline} />
      {control && <ServerControl {...control} />}
      <Timings docId={docId} offline={offline} />
      <ReorganiseControl docId={docId} offline={offline} />
      {control && <ResetControl {...control} />}
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
        aria-label={personLabel(person)}
        onClick={onClick}
      >
        <Avatar
          name={person.name}
          initials={initialsOf(person.name)}
          colour={null}
          size="sm"
          decorative
        />
        <span data-slot="button-label">{person.name}</span>
      </Button>
    </BarLabelled>
  );
}

function ServerControl(props: DemoControl): ReactNode {
  const { client } = props;
  const queryClient = useQueryClient();
  const queryKey = [SERVER_STATUS_QUERY, props.id];

  const status = useQuery({
    queryKey,
    queryFn: client.status,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
  });
  const action = useMutation({
    mutationFn: (kind: "stop" | "start") =>
      kind === "stop" ? client.stop() : client.start(),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const state = status.data;
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
          disabled={action.isPending}
          onClick={() => action.mutate(kind)}
        />
      )}
      {/* rendered before the first answer: a live region that appears together with its text is not announced; cut
          short where the bar runs out of room, the whole sentence is still what it says */}
      <p
        role="status"
        data-slot="bar-status"
        className="min-w-0 truncate text-fg-muted"
      >
        {state && serverStatusText(state)}
      </p>
    </div>
  );
}

/** Pressed while the side panel shows the Tour. */
function Tour(): ReactNode {
  const showing = usePanel("side").tab === "tour";
  return (
    <div className="ms-auto flex shrink-0">
      <CommandButton
        id="demo.tour"
        variant="outline"
        size="sm"
        icon={<PanelRightIcon aria-hidden="true" className="size-icon" />}
        pressed={showing}
      />
    </div>
  );
}
