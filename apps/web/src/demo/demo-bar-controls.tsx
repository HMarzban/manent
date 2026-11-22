// The demo bar's controls, start to end: the person, the Connection, the server, and at the far end the Tour.
import {
  Avatar,
  Button,
  CommandButton,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@manent/ui";
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
import { BarLabelled } from "./demo-bar-control.tsx";
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
    <BarLabelled label={TEXT.person}>
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

  const label = kind === "stop" ? TEXT.stopServer : TEXT.startServer;
  // the server is not a command, so this is drawn by hand as a command button with an icon is
  return (
    <div className="flex min-w-0 items-center gap-2">
      {kind && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                disabled={action.isPending}
                onClick={() => action.mutate(kind)}
              />
            }
          >
            <PowerIcon aria-hidden="true" className="size-icon" />
            <span data-slot="button-label">{label}</span>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
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
