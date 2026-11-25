// What the Scenes tab says as a scene is moved, the name a scene is read by, and the words of its List / Cards switch
// and its cards.
import type { NEW_PROJECT_CARDS } from "./library.ts";

type Kind = (typeof NEW_PROJECT_CARDS)[number]["kind"];

function describeFor(format: string, kind: Kind | null): string {
  if (format === "manuscript")
    return "Describe a chapter. It becomes a chapter when you write it.";
  if (format === "variety" && kind === "podcast")
    return "Describe a segment. It becomes a segment when you write it.";
  if (format === "variety")
    return "Describe a slug. It becomes a slug when you write it.";
  return "Describe a scene. It becomes a scene heading when you write it.";
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
  /** The blank card's prompt, tailored to the script's format and project kind. */
  describeFor,
});
