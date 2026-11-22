// The demo bar's controls, start to end: the person, the Connection, the server, and at the far end the Tour.
import { Avatar, Button, useCommandState, useCommands } from "@manent/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PanelRightIcon, PowerIcon } from "lucide-react";
import { useContext } from "react";
import type { ReactNode } from "react";
import { initialsOf } from "../initials.ts";
import { personLabel } from "../session.ts";
import type { TabPerson } from "../session.ts";
import { usePanel } from "../state/panels.store.ts";
import { FactsContext } from "../state/bridge-contexts.ts";
import { TEXT, serverStatusText } from "../text.ts";
import { Connection } from "./connection.tsx";
import { BarButton, BarLabelled } from "./demo-bar-control.tsx";
import { POLL_MS, SERVER_STATUS_QUERY } from "./use-demo.ts";
import type { DemoControl } from "./use-demo.ts";

/** The Connection and the Tour are drawn only inside the shell, which exists once the tab has a person. */
export function DemoBarControls(props: {
  person: TabPerson | null;
  onPersonClick: () => void;
  control: DemoControl | null;
}): ReactNode {
  // the shell provides the commands together with the bridge's contexts
  const inShell = useContext(FactsContext) !== null;
  return (
    <>
      <Person person={props.person} onClick={props.onPersonClick} />
      <Connection />
      {props.control && <ServerControl {...props.control} />}
      {inShell && <Tour />}
    </>
  );
}

/** Opens Choose who you are; its name is the label and the person together ("Person: Dana Reyes"). */
function Person(props: {
  person: TabPerson | null;
  onClick: () => void;
}): ReactNode {
  const { person, onClick } = props;
  if (person === null)
    return (
      <Button variant="ghost" size="sm" onClick={onClick}>
        {TEXT.person}
      </Button>
    );
  return (
    <BarLabelled label={TEXT.person}>
      <Button
        variant="ghost"
        size="sm"
        aria-label={personLabel(person)}
        onClick={onClick}
        className="max-sm:px-0.5"
      >
        <Avatar
          name={person.name}
          initials={initialsOf(person.name)}
          colour={null}
          size="sm"
          decorative
        />
        <span className="max-sm:hidden">{person.name}</span>
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
    <div className="flex items-center gap-2">
      {kind && (
        <BarButton
          label={kind === "stop" ? TEXT.stopServer : TEXT.startServer}
          icon={<PowerIcon aria-hidden="true" className="size-icon" />}
          disabled={action.isPending}
          onClick={() => action.mutate(kind)}
        />
      )}
      {/* rendered before the first answer: a live region that appears together with its text is not announced */}
      <p role="status" className="text-fg-muted max-sm:sr-only">
        {state && serverStatusText(state)}
      </p>
    </div>
  );
}

/** Pressed while the side panel shows the Tour. */
function Tour(): ReactNode {
  const { service } = useCommands();
  const { label, visible } = useCommandState("demo.tour");
  const showing = usePanel("side").tab === "tour";
  if (!visible) return null;
  return (
    <div className="ms-auto flex">
      <BarButton
        label={label}
        icon={<PanelRightIcon aria-hidden="true" className="size-icon" />}
        pressed={showing}
        tour="demo.tour"
        onClick={() => service.run("demo.tour", "control")}
      />
    </div>
  );
}
