// Add writers: people the demo's server simulates, typing in the open script, each in a scene of its own.
import {
  Button,
  DEMO_WORDS,
  Popover,
  PopoverContent,
  Segmented,
} from "@manent/ui";
import type { WritersRequest, WritersResponse } from "@manent/sync-protocol";
import { UsersIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useCanEdit } from "../screens/document/ruler-bar.tsx";
import { useEnvironment, useServices } from "../services/context.tsx";
import { useEditorFact } from "../state/facts.store.ts";
import { BarButton } from "./bar-button.tsx";

const TOUR = "demo:writers";
const CHOICES = [1, 5, 20].map((n) => ({ value: String(n), label: String(n) }));

/** What the server answered for the writers last asked for, and in which script; null after Stop writers or `endsAt`. */
type Running = (WritersResponse & { docId: string }) | null;

function labelOf(running: Running): string {
  if (running === null) return DEMO_WORDS.addWriters;
  const { count, asked } = running;
  return count < asked
    ? DEMO_WORDS.writersShort(count, asked)
    : DEMO_WORDS.writersTyping(count);
}

const isCount = (value: number): value is WritersRequest["count"] =>
  value === 0 || value === 1 || value === 5 || value === 20;

/** Disabled without a script or a connection; absent for a person who cannot edit the script. */
export function WritersControl(props: {
  docId: string | null;
  offline: boolean;
}): ReactNode {
  const { docId, offline } = props;
  // kept while the person is away from the script: the writers go on typing in it
  const [running, setRunning] = useState<Running>(null);
  const { now, schedule } = useEnvironment();
  const endsAt = running?.endsAt ?? null;
  useEffect(() => {
    if (endsAt === null) return undefined;
    return schedule(() => setRunning(null), Math.max(0, endsAt - now()));
  }, [endsAt, now, schedule]);
  if (docId === null) return <Unavailable reason={DEMO_WORDS.needsScript} />;
  return (
    <ScriptWriters
      docId={docId}
      offline={offline}
      running={running?.docId === docId ? running : null}
      onAnswer={setRunning}
    />
  );
}

function Unavailable(props: { reason: string }): ReactNode {
  return (
    <BarButton
      label={DEMO_WORDS.addWriters}
      icon={UsersIcon}
      tour={TOUR}
      unavailable={props.reason}
    />
  );
}

function ScriptWriters(props: {
  docId: string;
  offline: boolean;
  running: Running;
  onAnswer(running: Running): void;
}): ReactNode {
  const { docId, offline, running, onAnswer } = props;
  const { api } = useServices();
  const caret = useEditorFact("blockId");
  const [open, setOpen] = useState(false);
  if (!useCanEdit(docId)) return null;
  if (offline) return <Unavailable reason={DEMO_WORDS.needsConnection} />;
  const ask = (count: WritersRequest["count"]): void => {
    setOpen(false);
    const afterBlockId = count === 0 ? null : caret;
    api.writers({ docId, count, afterBlockId }).then(
      (answer) => onAnswer(answer.asked === 0 ? null : { ...answer, docId }),
      () => {
        // a request the server refused or never heard leaves the writers as they were
      },
    );
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <BarButton label={labelOf(running)} icon={UsersIcon} tour={TOUR} opens />
      <PopoverContent data-surface="demo" align="start" className="w-auto">
        <Segmented
          label={DEMO_WORDS.addWriters}
          size="sm"
          value={running === null ? "" : String(running.asked)}
          options={CHOICES}
          onChange={(value) => {
            const count = Number(value);
            if (isCount(count)) ask(count);
          }}
        />
        {running === null || running.count === 0 ? null : (
          <Button variant="outline" size="sm" onClick={() => ask(0)}>
            {DEMO_WORDS.stopWriters}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
