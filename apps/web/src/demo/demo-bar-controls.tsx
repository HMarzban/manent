// The demo bar's controls: the person, the server and the Tour.
import { Button, CommandButton } from "@manent/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useContext } from "react";
import type { ReactNode } from "react";
import { FactsContext } from "../state/bridge-contexts.ts";
import { TEXT, serverStatusText } from "../text.ts";
import { POLL_MS, SERVER_STATUS_QUERY } from "./use-demo.ts";
import type { DemoControl } from "./use-demo.ts";

/** The Tour button is drawn only inside the shell, which exists once the tab has a person. */
export function DemoBarControls(props: {
  personLabel: string;
  onPersonClick: () => void;
  control: DemoControl | null;
}): ReactNode {
  // the shell provides the commands together with the bridge's contexts
  const inShell = useContext(FactsContext) !== null;
  return (
    <>
      <Button variant="ghost" size="sm" onClick={props.onPersonClick}>
        {props.personLabel}
      </Button>
      <div className="ml-auto flex items-center gap-2">
        {props.control && <ServerStatus {...props.control} />}
        {inShell && <CommandButton id="demo.tour" size="sm" />}
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
    <>
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
    </>
  );
}
