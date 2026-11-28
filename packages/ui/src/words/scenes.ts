// What the Scenes tab says as a scene is moved, the name a scene is read by, and the words of its List / Cards switch
// and its cards.
import { formatCount } from "./format.ts";
import type { NEW_PROJECT_CARDS } from "./library.ts";

type Kind = (typeof NEW_PROJECT_CARDS)[number]["kind"];

interface UnitNouns {
  readonly one: string;
  readonly many: string;
}

function unitNouns(format: string, kind: Kind | null): UnitNouns {
  if (format === "manuscript") return { one: "chapter", many: "chapters" };
  if (format === "ink") return { one: "knot", many: "knots" };
  if (format === "variety" && kind === "podcast")
    return { one: "segment", many: "segments" };
  if (format === "variety") return { one: "slug", many: "slugs" };
  return { one: "scene", many: "scenes" };
}

function describeFor(format: string, kind: Kind | null): string {
  if (format === "manuscript")
    return "Title a new chapter to add it to your book.";
  if (format === "variety" && kind === "podcast")
    return "Describe a segment. It becomes a segment when you write it.";
  if (format === "variety")
    return "Describe a slug. It becomes a slug when you write it.";
  return "Describe a scene. It becomes a scene heading when you write it.";
}

function newCardTitle(format: string, kind: Kind | null): string {
  return `New ${unitNouns(format, kind).one}`;
}

function countLabel(
  shown: number,
  total: number,
  format: string,
  kind: Kind | null,
): string {
  if (shown !== total) return `${formatCount(shown)} of ${formatCount(total)}`;
  const nouns = unitNouns(format, kind);
  return `${formatCount(total)} ${total === 1 ? nouns.one : nouns.many}`;
}

function noMatches(format: string, kind: Kind | null): string {
  return `No ${unitNouns(format, kind).many} match.`;
}

export const SCENE_MOVE_WORDS = Object.freeze({
  move: "Move",
  moveUp: "Move up",
  moveDown: "Move down",
  moveToStart: "Move to start",
  moveToEnd: "Move to end",
  /** The reason clause of a move command run with no scene row or card focused. */
  noScene: "needs a scene selected in the Scenes tab",
  /** `scene` is "Scene 12", or the heading of a scene with no number. */
  moved: (scene: string): string => `${scene} moved.`,
  movedGainingPage: (scene: string, page: string): string =>
    `${scene} moved. Page ${page} gains an A-page.`,
  movedGainingPages: (scene: string, first: string, last: string): string =>
    `${scene} moved. Pages ${first} to ${last} gain A-pages.`,
  scene: (number: string): string => `Scene ${number}`,
  /** A scene's accessible name: its place ("Sc. 8 · INT. FERRY - NIGHT"), then its length in pages ("2 1/8"). */
  named: (place: string, length: string): string => `${place}, ${length} pages`,
  /** A one-page scene's accessible name. */
  namedOnePage: (place: string): string => `${place}, 1 page`,
  /** The List / Cards switch's accessible name. */
  showAs: "Show scenes as",
  list: "List",
  cards: "Cards",
  /** Where a card's length goes when its scene has no pages. */
  noPages: "No pages yet",
  /** Clears the active scene filter. */
  clearFilter: "Clear filter",
  /** Submits the new-scene card. */
  addCard: "Add",
  /** Placeholder inside the inline synopsis editor on a scene card. */
  addSynopsis: "Add a synopsis…",
  /** Accessible name of the inline synopsis edit action on a scene card. */
  editSynopsis: "Edit synopsis",
  /** The blank card's prompt, tailored to the script's format and project kind. */
  describeFor,
  /** Short heading above the blank card. */
  newCardTitle,
  /** Compact scene total or filtered match count in the Scenes toolbar. */
  countLabel,
  /** Empty state when a scene filter matches no rows. */
  noMatches,
  /** Short scene reference in the ghost-follow bar ("Sc. 27"). */
  shortScene: (number: string): string => `Sc. ${number}`,
  /** Ghost-follow readout naming the scene currently in the editor's reading zone. */
  viewing: (place: string): string => `Viewing ${place}`,
  /** Action returning the viewport and focus to the scene holding the editing caret. */
  backTo: (place: string): string => `Back to ${place}`,
});
