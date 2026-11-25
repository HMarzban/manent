// React hook connecting a script's daily goal in the person's private index (`goals` map) with live progress today.
import type { JsonMapView } from "@manent/crdt";
import { indexDocId } from "@manent/sync-protocol";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  liveContentPageCount,
  liveEditor,
  livePagination,
  subscribeLiveEditors,
} from "../editor-host/live-editor.ts";
import { useEnvironment, useServices } from "../services/context.tsx";
import { liveMap } from "../services/sync/private-index.ts";
import { useEditorFact } from "../state/facts.store.ts";
import {
  countDocWords,
  dailyGoalDone,
  localDayKey,
  msUntilNextLocalMidnight,
  parseScriptGoal,
} from "./goal-model.ts";
import type { GoalKind, ScriptGoal } from "./goal-model.ts";

export interface ScriptGoalState {
  readonly goal: ScriptGoal | null;
  readonly done: number;
  setGoal(kind: GoalKind, target: number): void;
  removeGoal(): void;
}

function readCurrentCount(
  docId: string,
  kind: GoalKind,
  pageCountFact: number | null,
): number {
  if (kind === "pages") {
    return (
      liveContentPageCount(docId) ??
      livePagination(docId)?.pages.length ??
      pageCountFact ??
      0
    );
  }
  const editor = liveEditor(docId);
  return editor === null ? 0 : countDocWords(editor.doc);
}

/** Subscribes to the person's private index `goals` entry for `docId` and tracks daily progress added today. */
export function useScriptGoal(docId: string): ScriptGoalState {
  const services = useServices();
  const { now, schedule } = useEnvironment();
  const pageCountFact = useEditorFact("pageCount");
  const editor = useSyncExternalStore(subscribeLiveEditors, () =>
    liveEditor(docId),
  );

  const [goal, setGoalState] = useState<ScriptGoal | null>(null);
  const [today, setToday] = useState<string>(() => localDayKey(now()));
  const [wordTick, setWordTick] = useState(0);

  const mapRef = useRef<JsonMapView | null>(null);
  const goalRef = useRef<ScriptGoal | null>(null);
  goalRef.current = goal;

  // Open this person's private index `goals` map and keep it synced across tabs.
  useEffect(() => {
    let live = true;
    let stopMap = (): void => {};
    let handleToClose: { close(): Promise<void> } | null = null;
    mapRef.current = null;
    setGoalState(null);

    void services
      .openHandle(indexDocId("user", services.userId))
      .then((handle) => {
        if (!live) {
          void handle.close();
          return;
        }
        handleToClose = handle;
        const map = liveMap(handle, "goals");
        mapRef.current = map;
        const sync = (): void => {
          if (!live) return;
          const next = parseScriptGoal(map.get(docId));
          goalRef.current = next;
          setGoalState(next);
        };
        stopMap = map.subscribe((keys) => {
          if (keys.includes(docId)) sync();
        });
        sync();
      })
      .catch(() => {
        // private index unavailable: keep session-only goal state
      });

    return () => {
      live = false;
      stopMap();
      mapRef.current = null;
      if (handleToClose !== null) void handleToClose.close();
    };
  }, [docId, services]);

  // Roll `today` forward cleanly at local midnight.
  useEffect(() => {
    const cancel = schedule(
      () => {
        setToday(localDayKey(now()));
      },
      msUntilNextLocalMidnight(now()) + 100,
    );
    return cancel;
  }, [today, now, schedule]);

  // Recompute word count when the open script's CRDT document changes.
  useEffect(() => {
    if (editor === null || goal?.kind !== "words") return undefined;
    return editor.doc.subscribe(() => setWordTick((n) => n + 1));
  }, [editor, goal?.kind]);

  // Re-read current count on editor / page / word changes.
  void wordTick;
  const currentCount =
    goal === null ? 0 : readCurrentCount(docId, goal.kind, pageCountFact);

  // Establish or roll over today's baseline once the live editor is available.
  useEffect(() => {
    if (goal === null || editor === null) return;
    if (goal.day === today && goal.baseline !== null) return;
    const updated: ScriptGoal = {
      kind: goal.kind,
      target: goal.target,
      setAt: goal.setAt,
      day: today,
      baseline: readCurrentCount(docId, goal.kind, pageCountFact),
    };
    goalRef.current = updated;
    setGoalState(updated);
    mapRef.current?.set(docId, updated);
  }, [docId, editor, goal, today, pageCountFact]);

  const setGoal = useCallback(
    (kind: GoalKind, target: number): void => {
      if (!Number.isInteger(target) || target < 1) return;
      const currentDay = localDayKey(now());
      const prev = goalRef.current;
      const keepBaseline =
        prev !== null &&
        prev.kind === kind &&
        prev.day === currentDay &&
        prev.baseline !== null;
      const baseline = keepBaseline
        ? prev.baseline
        : readCurrentCount(docId, kind, pageCountFact);
      const next: ScriptGoal = {
        kind,
        target,
        setAt: now(),
        day: currentDay,
        baseline,
      };
      goalRef.current = next;
      setGoalState(next);
      mapRef.current?.set(docId, next);
    },
    [docId, now, pageCountFact],
  );

  const removeGoal = useCallback((): void => {
    goalRef.current = null;
    setGoalState(null);
    mapRef.current?.delete(docId);
  }, [docId]);

  const done = goal === null ? 0 : dailyGoalDone(goal, currentCount, today);
  return { goal, done, setGoal, removeGoal };
}
