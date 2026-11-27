// Usage frecency helpers and query synonyms for the Command Palette.
import type { ScreenId } from "./ids.ts";

/** One persisted device-local command usage record. */
export interface CommandUsage {
  readonly id: string;
  readonly count: number;
  readonly lastAt: number;
  readonly lastScreen?: ScreenId;
}

export const MAX_USAGE_ENTRIES = 64;

const HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000;

/** High-frequency or meta commands that add noise rather than signal to Last used. */
export const IGNORED_USAGE_IDS: ReadonlySet<string> = new Set([
  "app.palette",
  "app.goTo",
  "edit.undo",
  "edit.redo",
]);

/** History commands that only make sense while inspecting History or comparing changes. */
export const HISTORY_REVIEW_IDS: ReadonlySet<string> = new Set([
  "history.hideChanges",
  "history.backToWorking",
  "history.nextChange",
  "history.previousChange",
  "history.restore",
  "history.restoreScene",
  "history.restoreBefore",
  "history.seeWhatChanged",
]);

/** Default studio palette per format or project kind for contextual search boosts. */
export const FORMAT_STUDIO_PALETTE: Readonly<Record<string, string>> =
  Object.freeze({
    screenplay: "setting.appearance.palette.hyperdrive",
    multicam: "setting.appearance.palette.viridian",
    stage_play: "setting.appearance.palette.proscenium",
    manuscript: "setting.appearance.palette.sylvan",
    animation: "setting.appearance.palette.celluloid",
    variety: "setting.appearance.palette.marquee",
    game: "setting.appearance.palette.chiaroscuro",
    ink: "setting.appearance.palette.nocturne",
    show: "setting.appearance.palette.marquee",
    news: "setting.appearance.palette.newsdesk",
  });

/**
 * Extra search synonyms kept outside CommandDefinition.palette.keywords so pinned command metadata
 * stays stable while everyday writer queries find the right action.
 */
export const PALETTE_SYNONYMS: Readonly<Record<string, readonly string[]>> =
  Object.freeze({
    "view.leftPanel": ["scenes", "outline", "sidebar", "chapters", "cuts"],
    "view.sidePanel": ["inspector", "comments", "details", "sidebar"],
    "view.ruler": ["margins", "tabs"],
    "view.pageView": ["paginated", "sheets", "pages"],
    "view.reflow": ["continuous", "scroll", "draft view"],
    "view.focusMode": ["zen", "distraction free", "clean"],
    "view.presentToRoom": ["presentation", "fullscreen", "projector", "read"],
    "format.titlePage": ["cover", "author", "credit", "front page"],
    "format.dualDialogue": ["side by side speech", "simultaneous"],
    "doc.scriptSettings": ["page setup", "margins", "header", "footer"],
    "doc.openBeside": ["split", "side by side", "reference", "pane"],
    "doc.print": ["paper", "pdf", "hard copy"],
    "doc.rename": ["title"],
    "share.open": ["collaborate", "permissions", "access", "add people"],
    "history.open": ["versions", "snapshots", "timeline", "revisions"],
    "history.nameDraft": ["save draft", "milestone", "bookmark", "tag"],
    "history.whoWrote": ["blame", "author", "attribution"],
    "script.renameCharacter": ["replace name", "cast"],
    "script.reports": ["breakdown", "cast list", "locations", "csv"],
    "script.numbers": ["word count", "statistics", "stats", "runtime"],
    "readAloud.start": ["speech", "tts", "voice", "speak", "listen"],
    "library.newScript": ["create script", "blank script"],
    "library.newProject": ["create project"],
    "library.newFolder": ["create folder", "directory"],
    "app.syncCentre": ["offline", "queue", "status", "upload"],
    "workspace.settings": ["team", "mos", "webhooks", "api keys"],
    "project.openSettings": ["element style", "names", "facts", "acts"],
    "name.addToProject": ["dictionary", "spelling", "character"],
    "setting.writing.typewriterScrolling": ["centre line", "focus line"],
    "setting.appearance.whitePage": ["bright paper", "light sheet"],
    "setting.appearance.autoByFormat": ["format theme", "automatic palette"],
    "setting.script.sameSpeakerContd": ["contd", "continued"],
    "setting.script.moresAtBreaks": ["more", "contd", "page break"],
    "view.scenes": ["sidebar", "outline"],
    "view.details": ["inspector"],
    "series.openBoard": ["season board", "episode grid"],
    "doc.linesPerPage": ["lines per page", "layout"],
    "project.readRate": ["read speed", "prompter pace"],
    "project.targetPages": ["page goal", "target"],
    "ink.play": ["playtest", "branch", "branches", "game script", "run"],
    "ink.playFromHere": ["play scene", "playtest scene", "current scene"],
  });

const EMPTY_SYNONYMS: readonly string[] = Object.freeze([]);

export const synonymsFor = (id: string): readonly string[] =>
  PALETTE_SYNONYMS[id] ?? EMPTY_SYNONYMS;

/** Exponentially decayed frecency score with a gentle boost for commands last used on this screen. */
export function frecencyScore(
  entry: CommandUsage,
  screen: ScreenId,
  now: number,
): number {
  const age = Math.max(0, now - entry.lastAt);
  const decay = 0.5 ** (age / HALF_LIFE_MS);
  const base = Math.log2(entry.count + 1) * decay;
  const screenBonus = entry.lastScreen === screen ? 1.25 : 1;
  return base * screenBonus;
}

/** Records a command execution into a bounded per-person usage list. */
export function recordUsage(
  entries: readonly CommandUsage[],
  id: string,
  screen: ScreenId,
  now: number,
  maxEntries: number = MAX_USAGE_ENTRIES,
): readonly CommandUsage[] {
  if (IGNORED_USAGE_IDS.has(id) || id === "") return entries;
  const existing = entries.find((entry) => entry.id === id);
  const next: CommandUsage = {
    id,
    count: (existing?.count ?? 0) + 1,
    lastAt: now,
    lastScreen: screen,
  };
  const merged = [next, ...entries.filter((entry) => entry.id !== id)];
  if (merged.length <= maxEntries) return merged;
  return merged
    .toSorted(
      (a, b) =>
        frecencyScore(b, screen, now) - frecencyScore(a, screen, now) ||
        b.lastAt - a.lastAt,
    )
    .slice(0, maxEntries);
}

export const LIBRARY_ACTIONS = [
  "library.newScript",
  "library.newProject",
  "file.import",
  "library.search",
  "library.newFolder",
  "workspace.settings",
  "app.preferences",
] as const;

export const BOARD_ACTIONS = [
  "board.addStoryline",
  "board.addCard",
  "board.linkScene",
  "project.openSettings",
  "app.library",
] as const;

export const SETTINGS_ACTIONS = [
  "app.shortcuts",
  "app.syncCentre",
  "app.library",
  "app.aiPledge",
  "app.switchPerson",
] as const;

export const DEFAULT_SCRIPT_ACTIONS = [
  "history.open",
  "doc.openBeside",
  "doc.export",
  "history.nameDraft",
  "draft.send",
  "view.focusMode",
  "edit.find",
  "doc.scriptSettings",
] as const;
