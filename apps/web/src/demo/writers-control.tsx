// Add writers: people the demo's server simulates, typing in the open script, each in a scene of its own or all in
// the caret's scene.
import {
  Button,
  DEMO_WORDS,
  Popover,
  PopoverContent,
  Segmented,
} from "@manent/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { WRITER_PLACEMENTS } from "@manent/sync-protocol";
import type {
  WriterPlacement,
  WritersRequest,
  WritersResponse,
} from "@manent/sync-protocol";
import { UsersIcon } from "lucide-react";
import { Fragment, useState } from "react";
import type { ReactNode } from "react";
import { useCanEdit } from "../screens/document/ruler-bar.tsx";
import { useServices } from "../services/context.tsx";
import { useEditorFact } from "../state/facts.store.ts";
import { BarButton } from "./bar-button.tsx";
import { POLL_MS } from "./use-demo.ts";

const TOUR = "demo:writers";
const CHOICES = [1, 5, 20].map((n) => ({ value: String(n), label: String(n) }));
/** The first element of the running writers query's key. */
const WRITERS_QUERY = "demo-writers";
/** The line over each placement's choice of how many. */
const PLACEMENT_LINES: Readonly<Record<WriterPlacement, string>> =
  Object.freeze({
    own_scenes: DEMO_WORDS.writersChoice,
    caret_scene: DEMO_WORDS.writersHereChoice,
  });

/** The writers typing in the script, as the server last told; null when none is. */
type Running = WritersResponse | null;

function labelOf(running: Running): string {
  if (running === null) return DEMO_WORDS.addWriters;
  const { count, asked } = running;
  return count < asked
    ? DEMO_WORDS.writersShort(count, asked)
    : DEMO_WORDS.writersTyping(count);
}

const isCount = (value: number): value is WritersRequest["count"] =>
  value === 0 || value === 1 || value === 5 || value === 20;

/** Unavailable without a script or a connection, and for a person who cannot edit the script. */
export function WritersControl(props: {
  docId: string | null;
  offline: boolean;
}): ReactNode {
  const { docId, offline } = props;
  if (docId === null) return <Unavailable reason={DEMO_WORDS.needsScript} />;
  return <ScriptWriters docId={docId} offline={offline} />;
}

function Unavailable(props: { reason: string }): ReactNode {
  return (
    <BarButton
      label={DEMO_WORDS.addWriters}
      icon={UsersIcon}
      drops="later"
      tour={TOUR}
      unavailable={props.reason}
    />
  );
}

/** The writers are asked of the server again every POLL_MS, so that every tab shows them, whichever started them. */
function ScriptWriters(props: { docId: string; offline: boolean }): ReactNode {
  const { docId, offline } = props;
  const { api } = useServices();
  const queryClient = useQueryClient();
  const caret = useEditorFact("blockId");
  const [open, setOpen] = useState(false);
  const canEdit = useCanEdit(docId);
  const queryKey = [WRITERS_QUERY, docId];
  const answer = useQuery({
    queryKey,
    queryFn: () => api.runningWriters(docId),
    enabled: canEdit && !offline,
    refetchInterval: POLL_MS,
  }).data;
  // checked before the connection, so that the reason does not change when the connection does
  if (!canEdit) return <Unavailable reason={DEMO_WORDS.needsEdit} />;
  if (offline) return <Unavailable reason={DEMO_WORDS.needsConnection} />;
  const running: Running =
    answer === undefined || answer.asked === 0 ? null : answer;
  const ask = (
    count: WritersRequest["count"],
    placement: WriterPlacement,
  ): void => {
    setOpen(false);
    const afterBlockId = count === 0 ? null : caret;
    api.writers({ docId, count, afterBlockId, placement }).then(
      // an answer to a question asked before this change would undo it on the bar
      async (next) => {
        await queryClient.cancelQueries({ queryKey });
        queryClient.setQueryData(queryKey, next);
      },
      () => {
        // a request the server refused or never heard leaves the writers as they were
      },
    );
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <BarButton
        label={labelOf(running)}
        icon={UsersIcon}
        // while writers run its words say how many, so it keeps them
        drops={running === null ? "later" : undefined}
        tour={TOUR}
        hint={DEMO_WORDS.addWritersHint}
        opens
      />
      <PopoverContent
        data-surface="demo"
        align="start"
        className="w-auto gap-2"
      >
        {WRITER_PLACEMENTS.map((placement) => (
          <Fragment key={placement}>
            <p aria-hidden="true" className="text-ui text-fg-muted">
              {PLACEMENT_LINES[placement]}
            </p>
            <Segmented
              label={PLACEMENT_LINES[placement]}
              size="sm"
              value={
                running?.placement === placement ? String(running.asked) : ""
              }
              options={CHOICES}
              onChange={(value) => {
                const count = Number(value);
                if (isCount(count)) ask(count, placement);
              }}
            />
          </Fragment>
        ))}
        {running === null || running.count === 0 ? null : (
          <Button
            variant="outline"
            size="sm"
            // stopping seats no one, whatever the placement
            onClick={() => ask(0, "own_scenes")}
          >
            {DEMO_WORDS.stopWriters}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
