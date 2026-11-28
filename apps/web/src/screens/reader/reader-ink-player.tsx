// Full-window interactive Ink player for shared Ink drafts on `/r/$token`.
import type { DraftOpenResponse } from "@manent/sync-protocol";
import { Button, INK_WORDS, READER_WORDS } from "@manent/ui";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import {
  ChoicesList,
  StoryFaultAlert,
  TranscriptEntry,
  WorkerStoppedCard,
} from "../../ink/player/player-parts.tsx";
import { VariablesDrawer } from "../../ink/player/variables-drawer.tsx";
import { inkSourceFromContent } from "../../reader/reader-ink.ts";
import {
  createReaderInkController,
  hasRestartableProgress,
} from "../../reader/reader-ink-controller.ts";
import type { ReaderInkController } from "../../reader/reader-ink-controller.ts";
import { useEnvironment } from "../../services/context.tsx";
import {
  ReaderInkEmptyCard,
  ReaderInkLoading,
  ReaderInkProblemCard,
  handleReaderInkKeyDown,
} from "./reader-ink-parts.tsx";

const noopUnsub = (): (() => void) => () => {};
const readNull = (): null => null;

export function ReaderInkPlayer(props: {
  readonly token: string;
  readonly draft: DraftOpenResponse;
  readonly userId: string | null;
}): ReactNode {
  const { token, draft, userId } = props;
  const { storage, storageEvents, now } = useEnvironment();
  const [varsOpen, setVarsOpen] = useState(false);
  const varsDrawerId = useId();
  const choicesContainerRef = useRef<HTMLDivElement | null>(null);
  const transcriptRegionRef = useRef<HTMLDivElement | null>(null);
  const choiceRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const faultRef = useRef<HTMLDivElement | null>(null);
  const restartEndRef = useRef<HTMLButtonElement | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const [controller, setController] = useState<ReaderInkController | null>(
    null,
  );

  const source = useMemo(
    () => inkSourceFromContent(draft.content),
    [draft.content],
  );
  const playKey = `${token}:${draft.versionId}`;

  useEffect(() => {
    setVarsOpen(false);
    const ctrl = createReaderInkController({
      playKey,
      source,
      storage,
      storageEvents,
      userId,
      now,
    });
    setController(ctrl);
    return () => {
      ctrl.dispose();
      setController((current) => (current === ctrl ? null : current));
    };
  }, [playKey, source, storage, storageEvents, userId, now]);

  const snap = useSyncExternalStore(
    controller?.subscribe ?? noopUnsub,
    controller?.snapshot ?? readNull,
    controller?.snapshot ?? readNull,
  );

  useEffect(() => {
    if (snap === null || snap.workerStopped) return;
    if (snap.fault !== null && snap.choices.length === 0) {
      transcriptEndRef.current?.scrollIntoView?.({ block: "nearest" });
      faultRef.current?.focus();
      return;
    }
    if (snap.focusNonce === 0) return;
    transcriptEndRef.current?.scrollIntoView?.({ block: "nearest" });
    if (snap.choices.length > 0) {
      choiceRefs.current[0]?.focus();
    } else if (snap.ended) {
      restartEndRef.current?.focus();
    }
  }, [
    snap?.focusNonce,
    snap?.choices.length,
    snap?.ended,
    snap?.fault,
    snap?.workerStopped,
  ]);

  if (controller === null || snap === null) return null;

  const canBack =
    snap.started &&
    !snap.workerStopped &&
    snap.recordedChoices.length > 0 &&
    !snap.busy;
  const canRestart =
    snap.started &&
    !snap.workerStopped &&
    !snap.busy &&
    hasRestartableProgress(snap);

  const compilingInitial =
    !snap.started &&
    !snap.workerStopped &&
    snap.compile.state === "compiling" &&
    snap.compile.lastGood === null;
  const hasCompileProblems =
    !snap.workerStopped &&
    snap.compile.state !== "compiling" &&
    snap.compile.lastGood === null &&
    snap.compile.problems.length > 0;
  const emptyStory =
    snap.started &&
    !snap.workerStopped &&
    snap.ended &&
    snap.fault === null &&
    snap.transcript.length === 0 &&
    snap.choices.length === 0;

  return (
    <div
      data-region="page"
      data-reader-ink="true"
      aria-label={draft.name}
      className="flex min-h-0 flex-1 flex-col items-center bg-desk sm:px-6 sm:py-5"
    >
      <div
        data-tour="ink:player"
        onKeyDown={(event) =>
          handleReaderInkKeyDown(event, {
            choices: snap.choices,
            disabled: snap.workerStopped || snap.busy,
            choicesContainerRef,
            transcriptRegionRef,
            choiceRefs,
            onChoose: (choice) => controller.choose(choice),
          })
        }
        className="flex min-h-0 w-full max-w-[46rem] flex-1 flex-col overflow-hidden border-line bg-chrome text-fg sm:rounded-surface sm:border"
      >
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-line bg-chrome px-4 py-2 text-ui">
          {snap.place === null ? null : (
            <span className="truncate font-mono text-meta font-medium text-fg">
              {INK_WORDS.place(snap.place.knot, snap.place.stitch)}
            </span>
          )}
          {snap.editedVariables.length > 0 ? (
            <span className="mn-tag">{INK_WORDS.variablesEdited}</span>
          ) : null}
          <div className="ms-auto flex items-center gap-1.5">
            {snap.variables.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                aria-expanded={varsOpen}
                aria-controls={varsDrawerId}
                className="cursor-pointer gap-1 text-meta text-fg-muted hover:text-fg"
                onClick={() => setVarsOpen((open) => !open)}
              >
                {varsOpen ? (
                  <ChevronDownIcon aria-hidden="true" className="size-icon" />
                ) : (
                  <ChevronRightIcon aria-hidden="true" className="size-icon" />
                )}
                <span>{INK_WORDS.variablesToggle(snap.variables.length)}</span>
              </Button>
            ) : null}
            <span
              className="inline-flex"
              title={canBack ? undefined : INK_WORDS.backUnavailable}
            >
              <Button
                variant="outline"
                size="sm"
                disabled={!canBack}
                title={canBack ? undefined : INK_WORDS.backUnavailable}
                className={canBack ? "cursor-pointer" : "cursor-not-allowed"}
                onClick={() => controller.back()}
              >
                {INK_WORDS.back}
              </Button>
            </span>
            <span
              className="inline-flex"
              title={canRestart ? undefined : INK_WORDS.restartUnavailable}
            >
              <Button
                variant="outline"
                size="sm"
                disabled={!canRestart}
                title={canRestart ? undefined : INK_WORDS.restartUnavailable}
                className={canRestart ? "cursor-pointer" : "cursor-not-allowed"}
                onClick={() => controller.restart()}
              >
                {INK_WORDS.restart}
              </Button>
            </span>
          </div>
        </div>

        {varsOpen ? (
          <VariablesDrawer
            id={varsDrawerId}
            variables={snap.variables}
            onChange={(name, value) => controller.editVariable(name, value)}
          />
        ) : null}

        {snap.workerStopped ? (
          <WorkerStoppedCard
            busy={snap.busy}
            onRestartWorker={() => controller.restartWorker()}
          />
        ) : compilingInitial ? (
          <ReaderInkLoading />
        ) : hasCompileProblems ? (
          <ReaderInkProblemCard problems={snap.compile.problems} />
        ) : emptyStory ? (
          <ReaderInkEmptyCard />
        ) : (
          <>
            <div
              ref={transcriptRegionRef}
              role="region"
              aria-label={INK_WORDS.transcriptLabel}
              className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-raised px-6 py-6 sm:px-8"
            >
              <div
                role="log"
                aria-live="polite"
                aria-relevant="additions"
                aria-atomic="false"
                className="flex flex-col gap-2"
              >
                {snap.transcript.map((item, index) => (
                  <TranscriptEntry
                    key={`${item.kind}:${index}`}
                    item={item}
                    onJumpLine={null}
                  />
                ))}
              </div>

              {snap.fault !== null ? (
                <StoryFaultAlert
                  fault={snap.fault}
                  alertRef={faultRef}
                  onJumpLine={null}
                />
              ) : null}

              {snap.ended && snap.fault === null ? (
                <div className="mt-4 flex items-center gap-3 border-t border-line pt-4">
                  <span
                    role="status"
                    aria-live="polite"
                    className="text-ui font-medium text-fg-muted"
                  >
                    {INK_WORDS.theEnd}
                  </span>
                  <Button
                    ref={restartEndRef}
                    variant="outline"
                    size="sm"
                    className="cursor-pointer"
                    onClick={() => controller.restart()}
                  >
                    {INK_WORDS.restart}
                  </Button>
                </div>
              ) : null}
              <div ref={transcriptEndRef} />
            </div>

            <ChoicesList
              choices={snap.choices}
              busy={snap.busy}
              containerRef={choicesContainerRef}
              buttonRefs={choiceRefs}
              onChoose={(choice) => controller.choose(choice)}
            />
          </>
        )}

        {draft.watermark !== null ? (
          <footer
            data-reader-watermark="true"
            className="shrink-0 border-t border-line bg-chrome px-4 py-2 text-center font-mono text-meta text-fg-muted"
          >
            {READER_WORDS.inkWatermark(draft.watermark)}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
