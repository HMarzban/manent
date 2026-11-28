// Pure script counts and shared scene/page helpers over pagination blocks.
import type { LayoutBlock, Pagination } from "@manent/pagination";

export interface CharacterNumber {
  readonly name: string;
  readonly speeches: number;
  readonly words: number;
  readonly scenes: number;
  readonly firstPage: string | null;
}

export interface ScriptNumbers {
  readonly pages: number;
  readonly scenes: number;
  readonly chapters: number;
  readonly words: number;
  readonly estimatedRuntimeMinutes: number;
  readonly estimatedReadingMinutes: number;
  readonly characters: readonly CharacterNumber[];
}

export type SceneIntroKind = "interior" | "exterior" | "both" | null;

export interface ParsedSceneLocation {
  readonly location: string;
  readonly intro: SceneIntroKind;
}

const EIGHTHS_PER_PAGE = 8;
const WHITESPACE = /\s+/;
const BOTH_INTROS = new Set([
  "I/E",
  "I/E.",
  "INT/EXT",
  "INT./EXT",
  "INT/EXT.",
  "INT./EXT.",
  "EXT/INT",
  "EXT./INT",
  "EXT/INT.",
  "EXT./INT.",
]);

/** Character name as its cue writes it: everything before the first `(`, trimmed. */
export function cueName(text: string): string {
  const paren = text.indexOf("(");
  return (paren < 0 ? text : text.slice(0, paren)).trim();
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  return trimmed.split(WHITESPACE).length;
}

/** Extracts the location (after first space, before last ` - `) and interior/exterior intro from a scene heading. */
export function parseSceneLocation(heading: string): ParsedSceneLocation {
  const space = heading.indexOf(" ");
  if (space < 0) return { location: "", intro: null };
  const token = heading.slice(0, space).trim().toUpperCase();
  const rest = heading.slice(space + 1);
  const dash = rest.lastIndexOf(" - ");
  const location = (dash < 0 ? rest : rest.slice(0, dash)).trim();
  let intro: SceneIntroKind = null;
  if (BOTH_INTROS.has(token)) intro = "both";
  else if (token === "INT" || token === "INT.") intro = "interior";
  else if (token === "EXT" || token === "EXT.") intro = "exterior";
  return { location, intro };
}

/** The page label where each block index in `pagination.blocks` begins. */
export function pageLabelMap(pagination: Pagination): readonly string[] {
  const { blocks, pages } = pagination;
  if (blocks.length === 0) return [];
  const firstLabel = pages[0]?.label ?? "";
  const labels: string[] = [];
  let pageIndex = 0;
  for (let i = 0; i < blocks.length; i++) {
    while (pageIndex + 1 < pages.length) {
      const next = pages[pageIndex + 1]!;
      if (next.block < i || (next.block === i && next.line === 0)) {
        pageIndex += 1;
      } else {
        break;
      }
    }
    labels.push(pages[pageIndex]?.label ?? firstLabel);
  }
  return labels;
}

/** Formats a scene's length in eighths of a page (`3/8`, `1`, `1 3/8`). */
export function formatEighths(eighths: number): string {
  const whole = Math.floor(eighths / EIGHTHS_PER_PAGE);
  const rest = eighths % EIGHTHS_PER_PAGE;
  if (rest === 0) return String(whole);
  return whole === 0 ? `${rest}/8` : `${whole} ${rest}/8`;
}

interface CharacterAccumulator {
  readonly name: string;
  readonly order: number;
  speeches: number;
  words: number;
  readonly scenes: Set<number>;
  firstPage: string | null;
}

/**
 * Counts pages, scenes, estimated runtime (one minute per page) and per-character dialogue totals.
 * Characters are sorted most dialogue words first, breaking ties by order of first use.
 */
export function numbersOf(
  blocks: readonly LayoutBlock[],
  pageCount: number,
  pageLabels?: readonly string[],
): ScriptNumbers {
  let scenes = 0;
  let chapters = 0;
  let words = 0;
  let currentScene = -1;
  let activeSpeaker: CharacterAccumulator | null = null;
  let speechCounted = false;
  let cuePage: string | null = null;
  let order = 0;
  const byKey = new Map<string, CharacterAccumulator>();

  const ensureCharacter = (name: string): CharacterAccumulator => {
    const key = name.toLowerCase();
    let entry = byKey.get(key);
    if (entry === undefined) {
      entry = {
        name,
        order: order++,
        speeches: 0,
        words: 0,
        scenes: new Set<number>(),
        firstPage: null,
      };
      byKey.set(key, entry);
    }
    return entry;
  };

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    if (block.type !== "page_break" && block.type !== "group") {
      words += wordCount(block.text);
    }
    if (block.type === "chapter") {
      chapters += 1;
      activeSpeaker = null;
      speechCounted = false;
      continue;
    }
    if (block.type === "scene_heading") {
      scenes += 1;
      currentScene += 1;
      activeSpeaker = null;
      speechCounted = false;
      continue;
    }
    if (block.type === "character") {
      const name = cueName(block.text);
      if (name === "") {
        activeSpeaker = null;
        speechCounted = false;
      } else {
        activeSpeaker = ensureCharacter(name);
        speechCounted = false;
        cuePage = pageLabels?.[i] ?? null;
      }
      continue;
    }
    if (block.type === "dialogue" || block.type === "parenthetical") {
      if (activeSpeaker !== null) {
        if (!speechCounted) {
          activeSpeaker.speeches += 1;
          speechCounted = true;
          if (currentScene >= 0) activeSpeaker.scenes.add(currentScene);
          if (activeSpeaker.firstPage === null) {
            activeSpeaker.firstPage = cuePage ?? pageLabels?.[i] ?? null;
          }
        }
        if (block.type === "dialogue") {
          activeSpeaker.words += wordCount(block.text);
        }
      }
      continue;
    }
    activeSpeaker = null;
    speechCounted = false;
  }

  const characters: CharacterNumber[] = [...byKey.values()]
    .filter((entry) => entry.speeches > 0)
    .toSorted((a, b) => b.words - a.words || a.order - b.order)
    .map((entry) => ({
      name: entry.name,
      speeches: entry.speeches,
      words: entry.words,
      scenes: entry.scenes.size,
      firstPage: entry.firstPage,
    }));

  return {
    pages: pageCount,
    scenes,
    chapters,
    words,
    estimatedRuntimeMinutes: Math.round(pageCount),
    estimatedReadingMinutes:
      words === 0 ? 0 : Math.max(1, Math.round(words / 250)),
    characters,
  };
}
