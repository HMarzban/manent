// What a scene's row or card draws of other features: its marks in their fixed order, the people in it, and the text
// in place of its length; and the heading the marks are drawn after.
import { AvatarStack, DOCUMENT_WORDS, SCENES_WORDS } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import { useEffect, useMemo, useReducer } from "react";
import type { ReactNode } from "react";
import { SCENE_LENGTH_SOURCES } from "../screens/document/scene-lengths.ts";
import { SCENE_MARK_SOURCES } from "../screens/document/scene-marks.ts";
import type { SceneMark } from "../screens/document/scene-marks.ts";
import type { OutlineRow } from "../state/outline.store.ts";
import type { SceneRowItem } from "./row-items.ts";

/** The value of each of `sources` for `docId`, read again when one changes. */
function useSources<T>(
  sources: readonly ((docId: string) => Subscribable<T>)[],
  docId: string,
): readonly Subscribable<T>[] {
  const opened = useMemo(
    () => sources.map((source) => source(docId)),
    [sources, docId],
  );
  const [, changed] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const stops = opened.map((source) => source.subscribe(changed));
    return () => {
      for (const stop of stops) stop();
    };
  }, [opened]);
  return opened;
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
}

/** What a scene's row or card draws of it beside its heading, and the menu it opens. */
export interface SceneParts {
  docId: string;
  extras: SceneExtras;
  items: readonly SceneRowItem[];
}

export function useSceneExtras(docId: string): SceneExtras {
  const marks = useSources(SCENE_MARK_SOURCES, docId);
  const lengths = useSources(SCENE_LENGTH_SOURCES, docId);
  return {
    marks: (blockId) =>
      marks
        .flatMap((source) => source.get().get(blockId) ?? [])
        .toSorted((a, b) => MARK_ORDER[a.kind] - MARK_ORDER[b.kind]),
    length(row) {
      for (const source of lengths) {
        const text = source.get().get(row.blockId);
        if (text !== undefined) return text;
      }
      return row.eighths === null ? null : SCENES_WORDS.length(row.eighths);
    },
  };
}

type PersonMark = Extract<SceneMark, { kind: "person" }>;
type TitleMark = Exclude<SceneMark, { kind: "revised" | "person" }>;

export const isPersonMark = (mark: SceneMark): mark is PersonMark =>
  mark.kind === "person";

const isTitleMark = (mark: SceneMark): mark is TitleMark =>
  mark.kind !== "revised" && mark.kind !== "person";

/** A mark drawn after the heading. */
function Mark(props: { mark: TitleMark }): ReactNode {
  const { mark } = props;
  switch (mark.kind) {
    case "count":
      return (
        <span className="text-meta text-fg-muted tabular-nums">
          {mark.label} {mark.count}
        </span>
      );
    case "text":
      return <span className="text-meta text-fg-muted">{mark.label}</span>;
  }
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
        className="hidden tabular-nums @max-3xs:inline"
      >
        {DOCUMENT_WORDS.moreAvatars(people.length)}
      </span>
    </>
  );
}

/** A scene's heading, read as revised when it is marked so, then its marks other than the people in it. */
export function SceneTitle(props: {
  heading: string;
  marks: readonly SceneMark[];
}): ReactNode {
  const { heading, marks } = props;
  const after = marks
    .filter(isTitleMark)
    .map((mark, index) => <Mark key={index} mark={mark} />);
  return (
    <>
      {marks.some((mark) => mark.kind === "revised") ? (
        <>
          <span aria-hidden="true">{heading}</span>
          <span className="sr-only">{DOCUMENT_WORDS.revisedName(heading)}</span>
        </>
      ) : (
        heading
      )}
      {after.length === 0 ? null : (
        <span className="ms-2 inline-flex gap-1 align-middle">{after}</span>
      )}
    </>
  );
}
