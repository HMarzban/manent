// The words one open script's editor shows: element names and placeholders by format, project kind and act break.
import type { EditorWords } from "@manent/editor";
import { EDITOR_WORDS, GRAPHICS_WORDS } from "@manent/ui";
import type { ProjectKind } from "../services/ports.ts";

/** `table`'s entry for `key`; undefined when it has none. */
const lookUp = (
  table: Readonly<Record<string, string>>,
  key: string | null,
): string | undefined =>
  key !== null && Object.hasOwn(table, key) ? table[key] : undefined;

/** A stage play's own names first, then a podcast's, then the act break's kind, then the element's own; anything unknown is General. */
export function editorWords(kind: ProjectKind | null): EditorWords {
  const podcast = kind === "podcast";
  return {
    element: (format, type, breakKind) =>
      (type === "graphic" ? GRAPHICS_WORDS.graphic : undefined) ??
      (format === "stage_play"
        ? lookUp(EDITOR_WORDS.stagePlay, type)
        : undefined) ??
      (podcast ? lookUp(EDITOR_WORDS.podcast, type) : undefined) ??
      (type === "act_break"
        ? lookUp(EDITOR_WORDS.actBreaks, breakKind)
        : undefined) ??
      lookUp(EDITOR_WORDS.elements, type) ??
      EDITOR_WORDS.elements.general,
    placeholder(format, type, breakKind) {
      if (type === "page_break" || type === "graphic") return null;
      const general =
        format === "game"
          ? EDITOR_WORDS.gameGeneralPlaceholder
          : EDITOR_WORDS.placeholders.general;
      return (
        (format === "stage_play"
          ? lookUp(EDITOR_WORDS.stagePlayPlaceholders, type)
          : undefined) ??
        (podcast
          ? lookUp(EDITOR_WORDS.podcastPlaceholders, type)
          : undefined) ??
        (type === "act_break"
          ? lookUp(EDITOR_WORDS.actBreakPlaceholders, breakKind)
          : undefined) ??
        (type === "general"
          ? general
          : lookUp(EDITOR_WORDS.placeholders, type)) ??
        general
      );
    },
    picker: EDITOR_WORDS.picker,
    offFontNote: EDITOR_WORDS.offFontNote,
  };
}
