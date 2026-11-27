// Format-aware element lists, default measurements, and concise summaries for Project settings → Element style.
import { CELLS_PER_INCH, profileFor } from "@manent/pagination";
import type { ElementSpec, PageProfile, SpecKey } from "@manent/pagination";
import { ACT_BREAK_KINDS, FORMAT_ELEMENTS } from "@manent/schema";
import type { BlockType, FormatId } from "@manent/schema";
import type { ElementStyle } from "@manent/settings";
import { PROJECT_WORDS } from "@manent/ui";
import { editorWords } from "../editor-host/editor-words.ts";
import type { ProjectKind } from "../services/ports.ts";

export type StyleMap = Readonly<Record<string, ElementStyle>>;

export const EMPTY_ENTRY: ElementStyle = Object.freeze({
  capitalized: null,
  underlined: null,
  bold: null,
  colour: null,
  spaceBefore: null,
  indent: null,
  width: null,
});

const TEMPLATE_FORMATS: Readonly<Record<string, FormatId>> = Object.freeze({
  screenplay: "screenplay",
  drama: "screenplay",
  single_camera: "screenplay",
  multi_camera: "multicam",
  animation: "animation",
  variety: "variety",
  news: "variety",
  podcast: "screenplay",
  manuscript: "manuscript",
  game: "game",
  stage_play: "stage_play",
  custom: "screenplay",
});

const UNSTYLED_TYPES: ReadonlySet<BlockType> = new Set([
  "group",
  "page_break",
  "ink_line",
  "graphic",
]);

export interface StyleElement {
  readonly key: string;
  readonly label: string;
  readonly defaults: ElementDefaults | null;
}

export interface ElementDefaults {
  readonly capitalized: boolean;
  readonly spaceBefore: number;
  readonly indentInches: string;
  readonly widthInches: string;
}

function formatInches(cells: number): string {
  const inches = Math.round((cells / CELLS_PER_INCH) * 10) / 10;
  return Number.isInteger(inches) ? String(inches) : inches.toFixed(1);
}

function specFor(profile: PageProfile | null, key: string): ElementSpec | null {
  if (profile === null) return null;
  if (!Object.hasOwn(profile.elements, key)) return null;
  return profile.elements[key as SpecKey];
}

function defaultsOf(spec: ElementSpec | null): ElementDefaults | null {
  if (spec === null) return null;
  return {
    capitalized: spec.capitalized,
    spaceBefore: spec.spaceBefore,
    indentInches: formatInches(spec.indent),
    widthInches: formatInches(spec.width),
  };
}

export function elementsFor(
  template: string,
  kind: ProjectKind | null,
): StyleElement[] {
  const format = TEMPLATE_FORMATS[template] ?? "screenplay";
  const profile = profileFor(format);
  const words = editorWords(kind);
  const out: StyleElement[] = [];
  for (const type of FORMAT_ELEMENTS[format]) {
    if (UNSTYLED_TYPES.has(type)) continue;
    if (type === "act_break") {
      for (const actKind of ACT_BREAK_KINDS) {
        const key = `act_break.${actKind}`;
        out.push({
          key,
          label: words.element(format, "act_break", actKind),
          defaults: defaultsOf(specFor(profile, key)),
        });
      }
    } else {
      out.push({
        key: type,
        label: words.element(format, type, null),
        defaults: defaultsOf(specFor(profile, type)),
      });
    }
  }
  return out;
}

export function entryIsEmpty(entry: ElementStyle): boolean {
  return (
    entry.capitalized === null &&
    entry.underlined === null &&
    entry.bold === null &&
    entry.colour === null &&
    entry.spaceBefore === null &&
    entry.indent === null &&
    entry.width === null
  );
}

export function entryHasVisibleChanges(entry: ElementStyle): boolean {
  return (
    entry.capitalized !== null ||
    entry.spaceBefore !== null ||
    entry.indent !== null ||
    entry.width !== null
  );
}

/** Concise one-line summary of the fields changed on an element. */
export function changedSummary(entry: ElementStyle): string {
  const parts: string[] = [];
  if (entry.capitalized !== null)
    parts.push(PROJECT_WORDS.styleValueCapitals(entry.capitalized));
  if (entry.spaceBefore !== null)
    parts.push(PROJECT_WORDS.styleValueSpaceBefore(entry.spaceBefore));
  if (entry.indent !== null)
    parts.push(PROJECT_WORDS.styleValueIndent(String(entry.indent)));
  if (entry.width !== null)
    parts.push(PROJECT_WORDS.styleValueWidth(String(entry.width)));
  return parts.join(" · ");
}

/** Concise one-line summary of the format's own defaults for an unchanged element. */
export function defaultSummary(defaults: ElementDefaults | null): string {
  if (defaults === null) return PROJECT_WORDS.styleFormatDefault;
  const parts: string[] = [];
  if (defaults.capitalized) parts.push(PROJECT_WORDS.styleFields.capitals);
  parts.push(PROJECT_WORDS.styleLines(defaults.spaceBefore));
  parts.push(PROJECT_WORDS.styleInches(defaults.indentInches));
  parts.push(PROJECT_WORDS.styleInches(defaults.widthInches));
  return parts.join(" · ");
}
