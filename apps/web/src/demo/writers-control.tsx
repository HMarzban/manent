// Add writers: inline 3-step writer slider (1, 5, 20) and scene placement switch inside Demo controls.
import { Button, DEMO_WORDS, Segmented, joinNames } from "@manent/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  WriterPlacement,
  WritersRequest,
  WritersResponse,
} from "@manent/sync-protocol";
import { UsersIcon } from "lucide-react";
import { useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useCanEdit } from "../screens/document/ruler-bar.tsx";
import { useServices } from "../services/context.tsx";
import { useAnnouncer } from "../shell/announcer-region.tsx";
import { FactsContext } from "../state/bridge-contexts.ts";
import { BarButton } from "./bar-button.tsx";
import { POLL_MS } from "./use-demo.ts";

const TOUR = "demo:writers";
const WRITER_STEPS = [1, 5, 20] as const;
const PLACEMENT_OPTIONS: readonly { value: WriterPlacement; label: string }[] =
  Object.freeze([
    { value: "own_scenes", label: DEMO_WORDS.writersOtherScenes },
    { value: "caret_scene", label: DEMO_WORDS.writersThisScene },
  ]);
/** The first element of the running writers query's key. */
export const WRITERS_QUERY = "demo-writers";
/** The accessible label for the active placement's count buttons. */
const PLACEMENT_LINES: Readonly<Record<WriterPlacement, string>> =
  Object.freeze({
    own_scenes: DEMO_WORDS.writersChoice,
    caret_scene: DEMO_WORDS.writersHereChoice,
  });

/** The writers typing in the script, as the server last told; null when none is. */
export type RunningWriters = WritersResponse | null;

function labelOf(running: RunningWriters): string {
  if (running === null) return DEMO_WORDS.addWriters;
  const { count, asked } = running;
  return count < asked
    ? DEMO_WORDS.writersShort(count, asked)
    : DEMO_WORDS.writersTyping(count);
}

const isPlacement = (value: string): value is WriterPlacement =>
  value === "own_scenes" || value === "caret_scene";

function stepIndexOf(count: number | undefined): number {
  const index = WRITER_STEPS.indexOf(count as (typeof WRITER_STEPS)[number]);
  return index === -1 ? 1 : index;
}

/** Shared live query + mutation hook for simulated writers on `docId`. */
export function useScriptWriters(props: {
  docId: string | null;
  signedIn: boolean;
  unreachable: string | null;
}): {
  canEdit: boolean;
  running: RunningWriters;
  pending: boolean;
  ask: (count: WritersRequest["count"], placement: WriterPlacement) => void;
} {
  const { docId, signedIn, unreachable } = props;
  const { api } = useServices();
  const announcer = useAnnouncer();
  const queryClient = useQueryClient();
  const facts = useContext(FactsContext);
  const canEdit = useCanEdit(docId ?? "");
  const enabled = docId !== null && signedIn && canEdit && unreachable === null;
  const queryKey = [WRITERS_QUERY, docId];
  const answer = useQuery({
    queryKey,
    queryFn: () => api.runningWriters(docId!),
    enabled,
    refetchInterval: POLL_MS,
  }).data;

  const [pending, setPending] = useState(false);
  const requestSeq = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    setPending(false);
    requestSeq.current += 1;
    return () => {
      mounted.current = false;
    };
  }, [docId]);

  const running: RunningWriters =
    !enabled || answer === undefined || answer.asked === 0 ? null : answer;

  const ask = (
    count: WritersRequest["count"],
    placement: WriterPlacement,
  ): void => {
    if (docId === null || !enabled) return;
    if (
      count > 0 &&
      running?.placement === placement &&
      running.asked === count
    )
      return;
    const seq = ++requestSeq.current;
    setPending(true);
    const afterBlockId = count === 0 ? null : (facts?.get("blockId") ?? null);
    api.writers({ docId, count, afterBlockId, placement }).then(
      async (next) => {
        if (!mounted.current || seq !== requestSeq.current) return;
        await queryClient.cancelQueries({ queryKey });
        queryClient.setQueryData(queryKey, next);
        if (mounted.current && seq === requestSeq.current) setPending(false);
      },
      () => {
        if (!mounted.current || seq !== requestSeq.current) return;
        setPending(false);
        announcer.announce(DEMO_WORDS.writersRefused);
      },
    );
  };

  return { canEdit, running, pending, ask };
}

/**
 * Unavailable without a script, for a person who has not signed in (the server holds none of their scripts), for a
 * person who cannot edit the script, and while `unreachable` says why the server cannot be asked.
 */
export function WritersControl(props: {
  docId: string | null;
  signedIn: boolean;
  unreachable: string | null;
}): ReactNode {
  const { docId, signedIn, unreachable } = props;
  if (docId === null) return <Unavailable reason={DEMO_WORDS.needsScript} />;
  if (!signedIn) return <Unavailable reason={DEMO_WORDS.needsSyncedScript} />;
  return <ScriptWriters key={docId} docId={docId} unreachable={unreachable} />;
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

/** Keyed by `docId` so slider and pending state never leak across script switches. */
function ScriptWriters(props: {
  docId: string;
  unreachable: string | null;
}): ReactNode {
  const { docId, unreachable } = props;
  const [previewStep, setPreviewStep] = useState(1);
  const [preferredPlacement, setPreferredPlacement] =
    useState<WriterPlacement>("own_scenes");
  const { canEdit, running, pending, ask } = useScriptWriters({
    docId,
    signedIn: true,
    unreachable,
  });

  if (!canEdit) return <Unavailable reason={DEMO_WORDS.needsEdit} />;
  if (unreachable !== null) return <Unavailable reason={unreachable} />;

  const active = running !== null;
  const stepIndex = active ? stepIndexOf(running.asked) : previewStep;
  const placement: WriterPlacement =
    active && running.placement !== null
      ? running.placement
      : preferredPlacement;
  const stepCount = WRITER_STEPS[stepIndex] ?? 5;
  const fillRatio = !active
    ? 0
    : stepIndex === 0
      ? 0.06
      : stepIndex / (WRITER_STEPS.length - 1);

  const chooseStep = (index: number): void => {
    const clamped = Math.max(0, Math.min(WRITER_STEPS.length - 1, index));
    const count = WRITER_STEPS[clamped]!;
    setPreviewStep(clamped);
    ask(count, placement);
  };

  return (
    <div
      data-tour={TOUR}
      data-active={active ? "true" : undefined}
      className="mn-demo-writers-box"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-meta font-medium text-fg">
          {active ? (
            <span aria-hidden="true" className="mn-demo-dot" data-tone="ok" />
          ) : (
            <UsersIcon
              aria-hidden="true"
              className="size-3.5 shrink-0 text-fg-muted"
            />
          )}
          <span className="truncate">{labelOf(running)}</span>
        </span>
        {active ? (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            className="h-6 shrink-0 px-2 text-micro"
            onClick={() => ask(0, "own_scenes")}
          >
            {DEMO_WORDS.stopWriters}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <div className="mn-demo-slider-wrap">
          <div aria-hidden="true" className="mn-demo-slider-track">
            <div
              className="mn-demo-slider-fill"
              style={{ transform: `scaleX(${fillRatio})` }}
            />
          </div>
          <div aria-hidden="true" className="mn-demo-slider-ticks">
            {WRITER_STEPS.map((count, i) => (
              <span
                key={count}
                className="mn-demo-slider-tick"
                data-filled={active && i <= stepIndex ? "true" : undefined}
              />
            ))}
          </div>
          <input
            type="range"
            min={0}
            max={WRITER_STEPS.length - 1}
            step={1}
            value={stepIndex}
            disabled={pending}
            data-active={active ? "true" : "false"}
            aria-label={DEMO_WORDS.addWriters}
            aria-valuetext={DEMO_WORDS.writersTyping(stepCount)}
            className="mn-demo-slider"
            onChange={(event) => chooseStep(Number(event.currentTarget.value))}
            onClick={() => {
              if (!active && !pending) chooseStep(stepIndex);
            }}
          />
        </div>

        <div
          role="group"
          aria-label={PLACEMENT_LINES[placement]}
          className="flex items-center justify-between"
        >
          {WRITER_STEPS.map((count, i) => (
            <button
              key={count}
              type="button"
              disabled={pending}
              aria-pressed={active && running.asked === count}
              className="mn-demo-step-btn focus-visible:outline-2 focus-visible:outline-focus"
              onClick={() => chooseStep(i)}
            >
              {count}
            </button>
          ))}
        </div>
      </div>

      <div className="mn-demo-segmented-full flex w-full">
        <Segmented
          label={DEMO_WORDS.writersWhereLabel}
          size="sm"
          value={placement}
          options={PLACEMENT_OPTIONS}
          onChange={(value) => {
            if (!isPlacement(value)) return;
            setPreferredPlacement(value);
            if (active) ask(stepCount, value);
          }}
        />
      </div>

      {running !== null && running.names.length > 0 ? (
        <p className="line-clamp-2 text-micro text-fg-muted">
          {joinNames(running.names)}
        </p>
      ) : null}
    </div>
  );
}
