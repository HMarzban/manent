// Final Draft's paragraph types and settings, and the elements and block settings they stand for.
import type { ActBreakKind, Alignment, BlockType } from "@manent/schema";
import { attr, elementsOf, paragraphText, withoutAttributes } from "./kept.ts";
import type { XmlNode } from "../xml/node.ts";

const TYPES: ReadonlyMap<string, BlockType> = new Map<string, BlockType>([
  ["Scene Heading", "scene_heading"],
  ["Action", "action"],
  ["Character", "character"],
  ["Parenthetical", "parenthetical"],
  ["Dialogue", "dialogue"],
  ["Transition", "transition"],
  ["Shot", "shot"],
  ["General", "general"],
]);
const ACT_TYPES: ReadonlyMap<string, ActBreakKind> = new Map<
  string,
  ActBreakKind
>([
  ["New Act", "new_act"],
  ["End of Act", "end_of_act"],
]);
const ALIGNMENTS: ReadonlyMap<string, Alignment> = new Map<string, Alignment>([
  ["Left", "left"],
  ["Center", "center"],
  ["Centered", "center"],
  ["Right", "right"],
]);
/** Points in one line of `SpaceBefore`. */
const POINTS_PER_LINE = 12;
const POINTS = /^\d+$/;

/** What a paragraph's attributes say of its block, and the attributes that say nothing Manent shows. */
export interface ParagraphSettings {
  readonly type: BlockType;
  readonly kind: ActBreakKind | null;
  /** A `Type` Manent has no element for: the block is General. */
  readonly keptType: string | null;
  readonly align: Alignment | null;
  readonly spaceBefore: number | null;
  /** `StartsNewPage="Yes"`: a page break comes before the block. */
  readonly newPage: boolean;
  /** A scene heading's `Number`. */
  readonly number: string | null;
  readonly rest: Readonly<Record<string, string>>;
}

function elementOf(
  type: string | null,
): Pick<ParagraphSettings, "type" | "kind" | "keptType"> {
  if (type === null) return { type: "action", kind: null, keptType: null };
  const kind = ACT_TYPES.get(type) ?? null;
  if (kind !== null) return { type: "act_break", kind, keptType: null };
  const element = TYPES.get(type);
  return element === undefined
    ? { type: "general", kind: null, keptType: type }
    : { type: element, kind: null, keptType: null };
}

function linesOf(points: string | null): number | null {
  if (points === null || !POINTS.test(points)) return null;
  const value = Number(points);
  return value % POINTS_PER_LINE === 0 ? value / POINTS_PER_LINE : null;
}

/** What a paragraph's `Type` and attributes say of its block; `Number` is read on a scene heading only. */
export function readParagraphSettings(paragraph: XmlNode): ParagraphSettings {
  const element = elementOf(attr(paragraph, "Type"));
  const align = ALIGNMENTS.get(attr(paragraph, "Alignment") ?? "") ?? null;
  const spaceBefore = linesOf(attr(paragraph, "SpaceBefore"));
  const newPage = attr(paragraph, "StartsNewPage") === "Yes";
  const number =
    element.type === "scene_heading" ? attr(paragraph, "Number") || null : null;
  const taken = new Set(["Type"]);
  if (align !== null) taken.add("Alignment");
  if (spaceBefore !== null) taken.add("SpaceBefore");
  if (newPage) taken.add("StartsNewPage");
  if (number !== null) taken.add("Number");
  return {
    ...element,
    align,
    spaceBefore,
    newPage,
    number,
    rest: withoutAttributes(paragraph, taken),
  };
}

/**
 * A scene's `SceneProperties`: its summary paragraphs' text joined by one space as the synopsis, and the
 * element without its `Summary`, null when that holds nothing.
 */
export function readSceneProperties(scene: XmlNode): {
  synopsis: string;
  rest: XmlNode | null;
} {
  const children = elementsOf(scene);
  const synopsis = children
    .filter((child) => child.name === "Summary")
    .flatMap(elementsOf)
    .filter((child) => child.name === "Paragraph")
    .map(paragraphText)
    .filter((text) => text !== "")
    .join(" ");
  const others = children.filter((child) => child.name !== "Summary");
  return {
    synopsis,
    rest:
      Object.keys(scene.attributes).length === 0 && others.length === 0
        ? null
        : { name: scene.name, attributes: scene.attributes, children: others },
  };
}
