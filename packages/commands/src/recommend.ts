// Pure contextual recommendation and query boost engine for the Command Palette.
import type { CommandContext } from "./context.ts";
import type { LeftTab, SideTab } from "./ids.ts";
import {
  BOARD_ACTIONS,
  DEFAULT_SCRIPT_ACTIONS,
  FORMAT_STUDIO_PALETTE,
  HISTORY_REVIEW_IDS,
  IGNORED_USAGE_IDS,
  LIBRARY_ACTIONS,
  SETTINGS_ACTIONS,
  frecencyScore,
} from "./recommend-data.ts";
import type { CommandUsage } from "./recommend-data.ts";

/** Coarse snapshot captured once when the palette opens (zero keystroke subscriptions). */
export interface RecommendationSignals {
  readonly command: CommandContext;
  /** True when the dedicated read-only /history route is shown over a document. */
  readonly historyScreen?: boolean;
  /** True when the History comparison view has an active baseline. */
  readonly historyComparing?: boolean;
  /** Caret block element type in the open editor, if known. */
  readonly caretElement?: string | null;
  /** True when the caret is inside the title page. */
  readonly inTitlePage?: boolean;
  /** True when the editor has a non-empty text selection. */
  readonly hasSelection?: boolean;
  readonly activeLeftTab?: LeftTab | null;
  readonly activeSideTab?: SideTab | null;
  /** True when the Beside split pane is open. */
  readonly besideOpen?: boolean;
  /** Number of collaborators currently present in the open document. */
  readonly peoplePresent?: number;
  /** Number of scenes in the open script's outline. */
  readonly sceneCount?: number;
  /** True when the effective rendered theme is currently dark (for opposite-theme quick switch). */
  readonly resolvedDark?: boolean;
}

/** Availability probe supplied by the caller (e.g. `service.state(id)`). */
export interface CommandAvailability {
  readonly visible: boolean;
  readonly enabled: boolean;
  readonly checked: boolean | null;
}

export interface PaletteRecommendations {
  readonly suggested: readonly string[];
  readonly quickSettings: readonly string[];
  readonly recent: readonly string[];
}

export const DEFAULT_SUGGESTED_LIMIT = 4;
export const DEFAULT_QUICK_SETTINGS_LIMIT = 3;
export const DEFAULT_RECENT_LIMIT = 3;

const isEditorRole = (role: CommandContext["role"]): boolean =>
  role === "owner" || role === "editor";

/** Builds an ordered list of candidate contextual action IDs (highest priority first). */
function suggestedCandidates(signals: RecommendationSignals): string[] {
  const { command: ctx } = signals;
  const ids: string[] = [];
  const add = (...more: string[]): void => {
    for (const id of more) if (!ids.includes(id)) ids.push(id);
  };

  if (ctx.inTrash) {
    add("doc.duplicate", "app.library", "doc.export");
    return ids;
  }
  if (ctx.screen === "library") {
    if (!ctx.online) add("app.syncCentre");
    add(...LIBRARY_ACTIONS);
    return ids;
  }
  if (ctx.screen === "board") {
    add(...BOARD_ACTIONS);
    return ids;
  }
  if (
    ctx.screen === "preferences" ||
    ctx.screen === "project_settings" ||
    ctx.screen === "workspace_settings"
  ) {
    add(...SETTINGS_ACTIONS);
    return ids;
  }
  if (ctx.screen === "send") {
    return ["doc.scriptSettings", "project.openSettings", "history.open"];
  }
  if (ctx.screen !== "document" || !ctx.docOpen) {
    return ["app.library", "app.preferences", "app.shortcuts"];
  }

  if (signals.historyScreen === true) {
    if (signals.historyComparing === true)
      add("history.nextChange", "history.previousChange");
    add(
      "history.nameDraft",
      "history.restore",
      "history.whoWrote",
      "history.backToWorking",
      "doc.duplicate",
    );
    return ids;
  }

  if (!ctx.online) add("app.syncCentre", "doc.export", "history.markVersion");
  if (ctx.writing?.position === "private")
    add("writing.handIn", "writing.forEveryone", "doc.openBeside");
  else if (ctx.writing?.position === "suggestions")
    add("writing.forEveryone", "comment.add", "view.sidePanel");

  if (ctx.docKind === "rundown") {
    if (ctx.rundown?.scriptRowSelected) add("rundown.openBeside");
    if (ctx.prompter?.canSend && ctx.prompter.hasStory) add("prompter.send");
    if (ctx.prompter?.controlling)
      add("prompter.jumpHere", "prompter.stopControlling");
    else if (ctx.prompter?.canSend) add("prompter.takeControl");
    add(
      "rundown.addRow",
      "rundown.addHeaderRow",
      "rundown.previousValue",
      "rundown.columns",
      "view.presentOnPrompter",
      "history.open",
      "doc.export",
    );
    return ids;
  }

  if (!isEditorRole(ctx.role)) {
    if (ctx.role === "commenter") {
      if (signals.hasSelection || ctx.material?.selection) add("comment.add");
      add("comment.onScene", "comment.onScript");
    }
    add(
      "edit.find",
      "readAloud.start",
      "view.presentToRoom",
      "doc.export",
      "history.open",
      "view.focusMode",
    );
    return ids;
  }

  if (ctx.production?.locked) {
    if (ctx.production.recallOpen) add("production.recall");
    if (ctx.production.canIssue) add("production.issue");
    if (
      ctx.production.selection === "text" ||
      ctx.production.selection === "scene"
    )
      add("production.markRevised", "production.clearRevised");
    if (ctx.production.selection === "omitted_scene")
      add("production.bringBackScene");
    else if (ctx.production.selection === "scene")
      add("production.omitScene", "production.includeInSides");
    else if (ctx.production.selection === "pages")
      add("production.lockPages", "production.renumber");
    add(
      "view.colourRevised",
      "view.pages",
      "history.open",
      "doc.export",
      "doc.print",
    );
    return ids;
  }

  if (ctx.format === "ink" || ctx.format === "game") {
    if (signals.besideOpen) add("ink.restart", "ink.back");
    add("ink.play", "ink.playFromHere");
    add("doc.export", "doc.openBeside", "edit.find", "history.open");
    return ids;
  }

  if (signals.inTitlePage === true) {
    return [
      "format.titlePage",
      "doc.rename",
      "doc.scriptSettings",
      "doc.export",
      "doc.print",
      "draft.send",
    ];
  }

  if (signals.hasSelection || ctx.material?.selection) {
    add(
      "comment.add",
      "note.add",
      "material.moveToCuts",
      "format.dualDialogue",
      "edit.find",
    );
  }

  if (
    ctx.material?.caretInSpeech ||
    signals.caretElement === "dialogue" ||
    signals.caretElement === "character" ||
    signals.caretElement === "parenthetical"
  ) {
    add(
      "alternate.show",
      "alternate.add",
      "format.dualDialogue",
      "script.renameCharacter",
      "readAloud.start",
    );
  }

  if (
    ctx.format === "variety" ||
    ctx.projectKind === "podcast" ||
    ctx.projectKind === "show" ||
    ctx.projectKind === "news"
  ) {
    if (ctx.prompter?.canSend && ctx.prompter.storyFormat === "variety") {
      add("prompter.send");
    }
    add(
      "timing.exclude",
      "graphics.insertLowerThird",
      "script.numbers",
      "template.save",
    );
  }

  if ((signals.peoplePresent ?? 0) > 1) add("view.presentToRoom", "share.open");
  if (ctx.outlineStart && (signals.sceneCount ?? 1) === 0) {
    add("outline.startScript");
  }

  add(...DEFAULT_SCRIPT_ACTIONS);
  return ids;
}

/** Builds real registered setting command IDs suitable for in-place Quick settings. */
function quickSettingCandidates(signals: RecommendationSignals): string[] {
  const { command: ctx } = signals;
  const oppositeTheme =
    signals.resolvedDark === true
      ? "setting.appearance.theme.light"
      : "setting.appearance.theme.dark";

  if (ctx.inTrash) return ["setting.appearance.whitePage", oppositeTheme];
  if (ctx.screen === "document" && ctx.docOpen && !signals.historyScreen) {
    if (ctx.docKind === "rundown") {
      return [
        oppositeTheme,
        "setting.appearance.whitePage",
        "setting.appearance.gems",
      ];
    }
    if (
      isEditorRole(ctx.role) &&
      (ctx.material?.caretInSpeech ||
        signals.caretElement === "dialogue" ||
        signals.caretElement === "character")
    ) {
      return [
        "setting.script.sameSpeakerContd",
        "setting.script.moresAtBreaks",
        "setting.writing.typewriterScrolling",
        oppositeTheme,
      ];
    }
    if (isEditorRole(ctx.role) && !signals.inTitlePage) {
      return [
        "setting.writing.typewriterScrolling",
        "setting.appearance.whitePage",
        oppositeTheme,
        "setting.writing.showCursors",
        "setting.script.sameSpeakerContd",
      ];
    }
    return [
      "setting.appearance.whitePage",
      oppositeTheme,
      "setting.appearance.gems",
    ];
  }
  return [
    oppositeTheme,
    "setting.appearance.whitePage",
    "setting.appearance.autoByFormat",
    "setting.appearance.gems",
  ];
}

/**
 * Computes calm, bounded Smart Home sections (`suggested`, `quickSettings`, `recent`) using only
 * visible, runnable commands, strictly deduplicated across sections.
 */
export function recommendPalette(options: {
  readonly signals: RecommendationSignals;
  readonly usage: readonly CommandUsage[];
  readonly available: (id: string) => CommandAvailability | null;
  readonly now: number;
  readonly suggestedLimit?: number;
  readonly quickSettingsLimit?: number;
  readonly recentLimit?: number;
}): PaletteRecommendations {
  const {
    signals,
    usage,
    available,
    now,
    suggestedLimit = DEFAULT_SUGGESTED_LIMIT,
    quickSettingsLimit = DEFAULT_QUICK_SETTINGS_LIMIT,
    recentLimit = DEFAULT_RECENT_LIMIT,
  } = options;

  const isRunnable = (id: string): boolean => {
    const state = available(id);
    return state !== null && state.visible && state.enabled;
  };

  const taken = new Set<string>();
  const pick = (candidates: readonly string[], limit: number): string[] => {
    const chosen: string[] = [];
    for (const id of candidates) {
      if (chosen.length >= limit) break;
      if (taken.has(id) || !isRunnable(id)) continue;
      taken.add(id);
      chosen.push(id);
    }
    return chosen;
  };

  const suggested = pick(suggestedCandidates(signals), suggestedLimit);
  const quickSettings = pick(
    quickSettingCandidates(signals),
    quickSettingsLimit,
  );
  const recentOrder = usage
    .filter((entry) => !IGNORED_USAGE_IDS.has(entry.id))
    .toSorted(
      (a, b) =>
        frecencyScore(b, signals.command.screen, now) -
          frecencyScore(a, signals.command.screen, now) || b.lastAt - a.lastAt,
    )
    .map((entry) => entry.id);
  const recent = pick(recentOrder, recentLimit);

  return { suggested, quickSettings, recent };
}

/** Lightweight contextual + frecency tie-breaker score used inside query ranking. */
export function contextBoost(
  id: string,
  signals: RecommendationSignals,
  usage: readonly CommandUsage[],
  now: number,
): number {
  let score = 0;

  if (
    HISTORY_REVIEW_IDS.has(id) &&
    signals.historyScreen !== true &&
    signals.historyComparing !== true
  ) {
    score -= 20;
  }

  const formatKey =
    signals.command.format ?? signals.command.projectKind ?? null;
  if (formatKey !== null && FORMAT_STUDIO_PALETTE[formatKey] === id) {
    score += 12;
  }

  const actions = suggestedCandidates(signals);
  const actionAt = actions.indexOf(id);
  if (actionAt >= 0) score += Math.max(4, 24 - actionAt * 3);

  const settings = quickSettingCandidates(signals);
  const settingAt = settings.indexOf(id);
  if (settingAt >= 0) score += Math.max(4, 16 - settingAt * 3);

  const record = usage.find((entry) => entry.id === id);
  if (record !== undefined) {
    score += Math.min(
      10,
      frecencyScore(record, signals.command.screen, now) * 3,
    );
  }

  return score;
}
