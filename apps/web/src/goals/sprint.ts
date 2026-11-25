// Timed writing sprint controller: palette duration prompt, 1-second countdown, and completion/end messages.
import { WRITING_TOOLS_WORDS } from "@manent/ui";
import type { Message, MessageQueue } from "@manent/ui";
import {
  liveEditor,
  subscribeLiveEditors,
} from "../editor-host/live-editor.ts";
import type { HandlerDeps } from "../handlers/index.ts";
import { paletteActions } from "../state/palette.store.ts";
import { sprintActions } from "../state/sprint.store.ts";
import { countDocWords, formatMmSs, parseSprintMinutes } from "./goal-model.ts";

/** Offered choices, with the default 25 minutes first so pressing Enter starts a 25-minute sprint immediately. */
const SPRINT_MINUTES = [25, 10, 45, 60] as const;

type ScheduleFn = (fn: () => void, delayMs: number) => () => void;

interface RunningController {
  readonly messages: MessageQueue;
  readonly now: () => number;
  lastWords: number;
  cancelTick: (() => void) | null;
  stopEditors: (() => void) | null;
}

let running: RunningController | null = null;

const defaultSchedule: ScheduleFn = (fn, delayMs) => {
  const id = globalThis.setTimeout(fn, delayMs);
  return () => globalThis.clearTimeout(id);
};

const briefMessage = (id: string, text: string): Message => ({
  id,
  text,
  actions: [],
  lifetime: "brief",
  ownWork: false,
});

function currentWordsOf(docId: string): number | null {
  const editor = liveEditor(docId);
  return editor === null ? null : countDocWords(editor.doc);
}

function clearTimer(): void {
  running?.cancelTick?.();
  running?.stopEditors?.();
  if (running !== null) {
    running.cancelTick = null;
    running.stopEditors = null;
  }
}

/** Starts a timed sprint for `docId` and ticks every second until `0:00` or `endSprint()`. */
export function startSprintSession(options: {
  readonly docId: string;
  readonly durationMs: number;
  readonly messages: MessageQueue;
  readonly now: () => number;
  readonly schedule?: ScheduleFn;
}): void {
  if (sprintActions.get()) return;
  const {
    docId,
    durationMs,
    messages,
    now,
    schedule = defaultSchedule,
  } = options;
  const startedAt = now();
  const startWords = currentWordsOf(docId) ?? 0;
  sprintActions.start({
    docId,
    durationMs,
    startedAt,
    remainingMs: durationMs,
    startWords,
  });

  const controller: RunningController = {
    messages,
    now,
    lastWords: startWords,
    cancelTick: null,
    stopEditors: null,
  };
  running = controller;

  const sampleWords = (): number => {
    const live = currentWordsOf(docId);
    if (live !== null) controller.lastWords = live;
    return controller.lastWords;
  };

  controller.stopEditors = subscribeLiveEditors(() => {
    sampleWords();
  });

  const step = (): void => {
    const active = sprintActions.active();
    if (active === null || running !== controller) return;
    const wordsNow = sampleWords();
    const remainingMs = Math.max(
      0,
      active.startedAt + active.durationMs - now(),
    );
    if (remainingMs <= 0) {
      clearTimer();
      running = null;
      const written = Math.max(0, wordsNow - active.startWords);
      sprintActions.stop();
      messages.push(
        briefMessage(
          "sprint_over",
          WRITING_TOOLS_WORDS.sprintOver(
            written,
            formatMmSs(Math.round(active.durationMs / 1000)),
          ),
        ),
      );
      return;
    }
    sprintActions.tick(remainingMs);
    const delay = remainingMs % 1000 === 0 ? 1000 : remainingMs % 1000;
    controller.cancelTick = schedule(step, Math.max(50, delay));
  };

  controller.cancelTick = schedule(step, Math.min(1000, durationMs));
}

/** Ends the active sprint early and posts the elapsed-time summary message. */
export function endSprint(): void {
  const active = sprintActions.active();
  if (active === null) return;
  const controller = running;
  const finalWords =
    currentWordsOf(active.docId) ?? controller?.lastWords ?? active.startWords;
  clearTimer();
  running = null;
  const now = controller?.now ?? (() => active.startedAt);
  const remainingSec = Math.ceil(
    Math.max(0, active.startedAt + active.durationMs - now()) / 1000,
  );
  const totalSec = Math.round(active.durationMs / 1000);
  const elapsedSec = Math.max(0, Math.min(totalSec, totalSec - remainingSec));
  const written = Math.max(0, finalWords - active.startWords);
  sprintActions.stop();
  controller?.messages.push(
    briefMessage(
      "sprint_ended",
      WRITING_TOOLS_WORDS.sprintEnded(written, formatMmSs(elapsedSec)),
    ),
  );
}

/** Opens the palette ask step to choose a sprint duration and starts the sprint on submit. */
export function promptStartSprint(deps: HandlerDeps): void {
  const docId = deps.shellState().docId;
  if (docId === null || sprintActions.get()) return;
  paletteActions.ask({
    prompt: WRITING_TOOLS_WORDS.sprintPrompt,
    choices: SPRINT_MINUTES.map(WRITING_TOOLS_WORDS.sprintChoice),
    initial: "",
    submit(value) {
      const minutes = parseSprintMinutes(value) ?? 25;
      startSprintSession({
        docId,
        durationMs: minutes * 60_000,
        messages: deps.services.messages,
        now: deps.now,
      });
    },
  });
}
