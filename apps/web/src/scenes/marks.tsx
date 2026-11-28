// What a scene's row or card draws of other features: its marks in their fixed order, the people in it, and the text
// in place of its length; and the heading the marks are drawn after.
import {
  AvatarStack,
  DOCUMENT_WORDS,
  SCENES_WORDS,
  WRITING_TOOLS_WORDS,
} from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { SCENE_LENGTH_SOURCES } from "../screens/document/scene-lengths.ts";
import { SCENE_MARK_SOURCES } from "../screens/document/scene-marks.ts";
import type { SceneMark } from "../screens/document/scene-marks.ts";
import type { OutlineRow } from "../state/outline.store.ts";
import type { SceneRowItem } from "./row-items.ts";

/** The current values of `sources` for `docId`, keeping one array reference while none changed. */
function useSources<T>(
  sources: readonly ((docId: string) => Subscribable<T>)[],
  docId: string,
): readonly T[] {
  const opened = useMemo(
    () => sources.map((source) => source(docId)),
    [sources, docId],
  );
  const snapshot = useRef<readonly T[]>([]);
  const subscribe = useCallback(
    (listener: () => void) => {
      const stops = opened.map((source) => source.subscribe(listener));
      return () => {
        for (const stop of stops) stop();
      };
    },
    [opened],
  );
  const read = (): readonly T[] => {
    const next = opened.map((source) => source.get());
    const prev = snapshot.current;
    if (
      prev.length !== next.length ||
      prev.some((value, index) => !Object.is(value, next[index]))
    )
      snapshot.current = next;
    return snapshot.current;
  };
  return useSyncExternalStore(subscribe, read, read);
}

// the order a row draws its marks in, whichever source gives them
const MARK_ORDER: Readonly<Record<SceneMark["kind"], number>> = Object.freeze({
  revised: 0,
  count: 1,
  person: 2,
  text: 3,
});

/** What a scene's row or card draws besides its heading: its marks in their order, and its length. */
export interface SceneExtras {
  marks(blockId: string): readonly SceneMark[];
  /** The text a source gives in place of the scene's length, else its length in pages; null when it has neither. */
  length(row: OutlineRow): string | null;
  /** Tooltip explaining the length readout in pages; null for timed durations or when absent. */
  lengthTitle?(row: OutlineRow): string | null;
}

/** What a scene's row or card draws of it beside its heading, and the menu it opens. */
export interface SceneParts {
  docId: string;
  extras: SceneExtras;
  items: readonly SceneRowItem[];
}

export function useSceneExtras(docId: string, format?: string): SceneExtras {
  const marks = useSources(SCENE_MARK_SOURCES, docId);
  const lengths = useSources(SCENE_LENGTH_SOURCES, docId);
  return useMemo(
    () => ({
      marks: (blockId) =>
        marks
          .flatMap((source) => source.get(blockId) ?? [])
          .toSorted((a, b) => MARK_ORDER[a.kind] - MARK_ORDER[b.kind]),
      length(row) {
        for (const source of lengths) {
          const text = source.get(row.blockId);
          if (text !== undefined) return text;
        }
        if (row.eighths === null) return null;
        return format === "manuscript"
          ? SCENES_WORDS.chapterPages(row.eighths)
          : SCENES_WORDS.length(row.eighths);
      },
      lengthTitle(row) {
        for (const source of lengths) {
          if (source.get(row.blockId) !== undefined) return null;
        }
        return row.eighths === null
          ? null
          : SCENES_WORDS.lengthPages(row.eighths);
      },
    }),
    [marks, lengths, format],
  );
}

type PersonMark = Extract<SceneMark, { kind: "person" }>;
type MetaMark = Exclude<SceneMark, { kind: "revised" | "person" }>;

export const isPersonMark = (mark: SceneMark): mark is PersonMark =>
  mark.kind === "person";

export const isMetaMark = (mark: SceneMark): mark is MetaMark =>
  mark.kind !== "revised" && mark.kind !== "person";

/** A quiet tag drawn in the row's meta line or beneath a card's heading. */
function Mark(props: { mark: MetaMark }): ReactNode {
  const { mark } = props;
  switch (mark.kind) {
    case "count":
      return (
        <span className="mn-tag shrink-0 tabular-nums">
          {mark.count} {mark.label}
        </span>
      );
    case "text":
      return <span className="mn-tag shrink-0">{mark.label}</span>;
  }
}

/** Assignment and open-comment tags for a scene, rendered outside the truncated heading line. */
export function SceneMetaMarks(props: {
  marks: readonly SceneMark[];
}): ReactNode {
  const meta = props.marks.filter(isMetaMark);
  if (meta.length === 0) return null;
  return (
    <>
      {meta.map((mark, index) => (
        <Mark key={index} mark={mark} />
      ))}
    </>
  );
}

/** The second line of a scene row: assignment, comment and optional chapter word-target tags beside any synopsis. */
export function sceneRowMeta(
  marks: readonly SceneMark[],
  synopsis: string,
  chapterProgress?: {
    readonly words: number;
    readonly targetWords: number;
  } | null,
): ReactNode | undefined {
  const hasMarks = marks.some(isMetaMark);
  const hasProgress = chapterProgress !== undefined && chapterProgress !== null;
  if (!hasMarks && !hasProgress) return synopsis === "" ? undefined : synopsis;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {hasMarks ? <SceneMetaMarks marks={marks} /> : null}
      {hasProgress ? (
        <span className="mn-tag shrink-0 tabular-nums">
          {WRITING_TOOLS_WORDS.numbersChapterProgress(
            chapterProgress.words,
            chapterProgress.targetWords,
          )}
        </span>
      ) : null}
      {synopsis === "" ? null : (
        <span className="min-w-0 truncate">{synopsis}</span>
      )}
    </span>
  );
}

/**
 * The people in a scene, at the end of its row or card before its length, where a long heading never hides them: a
 * stack of their avatars overlapping, each moving while its person types, so that the heading keeps its room; in a
 * narrow panel, how many they are. Nothing when no one is in it.
 */
export function ScenePeople(props: { marks: readonly SceneMark[] }): ReactNode {
  const people = props.marks.filter(isPersonMark);
  if (people.length === 0) return null;
  const moving = new Set(people.flatMap((p) => (p.moving ? [p.userId] : [])));
  return (
    <>
      {/* the Scenes panel's container query */}
      <span className="flex @max-3xs:hidden">
        <AvatarStack
          people={people}
          size="sm"
          moving={moving}
          layout="overlapping"
        />
      </span>
      <span
        role="img"
        aria-label={DOCUMENT_WORDS.moreAvatarsName(people.length)}
        className="hidden @max-3xs:inline"
      >
        {DOCUMENT_WORDS.moreAvatars(people.length)}
      </span>
    </>
  );
}

/** A scene's heading, read as revised when it is marked so. */
export function SceneTitle(props: {
  heading: string;
  marks: readonly SceneMark[];
}): ReactNode {
  const { heading, marks } = props;
  if (!marks.some((mark) => mark.kind === "revised")) return heading;
  return (
    <>
      <span aria-hidden="true">{heading}</span>
      <span className="sr-only">{DOCUMENT_WORDS.revisedName(heading)}</span>
    </>
  );
}
