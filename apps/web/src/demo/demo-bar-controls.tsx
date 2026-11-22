// The demo bar's controls: the person, the Connection, Add writers, the server, Timings, Reorganise, Reset and the Tour.
import { Button, CommandButton, useSubscribable } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useContext } from "react";
import type { ReactNode } from "react";
import { useEnvironment } from "../services/context.tsx";
import type { ConnectionMode } from "../services/sync/device-memory.ts";
import { asUiSubscribable } from "../services/sync/subscribable.ts";
import { FactsContext } from "../state/bridge-contexts.ts";
import { TEXT, serverStatusText } from "../text.ts";
import { ConnectionChoice, useConnectionControl } from "./connection.tsx";
import { ReorganiseControl } from "./reorganise-control.tsx";
import { ResetControl } from "./reset-control.tsx";
import { Timings } from "./timings.tsx";
import { POLL_MS, SERVER_STATUS_QUERY } from "./use-demo.ts";
import type { DemoControl } from "./use-demo.ts";
import { WritersControl } from "./writers-control.tsx";

interface BarProps {
  personLabel: string;
  onPersonClick: () => void;
  control: DemoControl | null;
}

/** Before the Connection is known the tab is online, as its sync starts. */
const ONLINE: Subscribable<ConnectionMode> = Object.freeze({
  get: () => "online",
  subscribe: () => () => {},
});

/** The controls that act on the person's sync and scripts are drawn only inside the shell, which exists once the tab has a person. */
export function DemoBarControls(props: BarProps): ReactNode {
  // the shell provides the services together with the bridge's contexts
  const inShell = useContext(FactsContext) !== null;
  return inShell ? <ShellControls {...props} /> : <PersonControls {...props} />;
}

function PersonButton(props: BarProps): ReactNode {
  return (
    <Button
      variant="ghost"
      size="sm"
      data-tour="demo:person"
      onClick={props.onPersonClick}
    >
      {props.personLabel}
    </Button>
  );
}

/** Before a person is chosen: who this tab is, and the server. */
function PersonControls(props: BarProps): ReactNode {
  const { control } = props;
  return (
    <>
      <PersonButton {...props} />
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {control && <ServerStatus {...control} />}
      </div>
    </>
  );
}

function ShellControls(props: BarProps): ReactNode {
  const { control } = props;
  const connection = useConnectionControl();
  const mode = useSubscribable(
    connection === null ? ONLINE : asUiSubscribable(connection.mode),
  );
  const offline = mode === "offline";
  const { docId } = useSubscribable(useEnvironment().shellState);
  return (
    <>
      <PersonButton {...props} />
      {connection && <ConnectionChoice control={connection} />}
      <WritersControl docId={docId} offline={offline} />
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {control && <ServerStatus {...control} />}
        <Timings docId={docId} offline={offline} />
        <ReorganiseControl docId={docId} offline={offline} />
        {control && <ResetControl {...control} />}
        <CommandButton id="demo.tour" size="sm" />
      </div>
    </>
  );
}

function ServerStatus(props: DemoControl): ReactNode {
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
    <div data-tour="demo:server" className="flex items-center gap-2">
      {/* rendered before the first answer: a live region that appears together with its text is not announced */}
      <p role="status">{state && serverStatusText(state)}</p>
      {kind && (
        <Button
          variant="outline"
          size="sm"
          disabled={action.isPending}
          onClick={() => action.mutate(kind)}
        >
          {kind === "stop" ? TEXT.stopServer : TEXT.startServer}
        </Button>
      )}
    </div>
  );
}
