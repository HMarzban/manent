// Zero-keystroke snapshot of where the Command Palette was opened, plus calm context captions.
import { LEFT_TABS, SIDE_TABS } from "@manent/commands";
import type {
  CommandContext,
  LeftTab,
  RecommendationSignals,
  SideTab,
} from "@manent/commands";
import { SETTINGS } from "@manent/settings";
import { PALETTE_WORDS } from "@manent/ui";
import { currentBeside } from "../beside/open-beside.ts";
import { driverCommandContext } from "../room/driver-context.ts";
import type { Environment, PersonServices } from "../services/ports.ts";
import type { FactsSelectors } from "../state/facts.store.ts";
import { focusModeActions } from "../state/focus-mode.store.ts";
import { formattingBarActions } from "../state/formatting-bar.store.ts";
import { historyActions } from "../state/history.store.ts";
import { layoutViewActions } from "../state/layout-view.store.ts";
import { materialActions } from "../state/material.store.ts";
import { outlineStartActions } from "../state/outline-start.store.ts";
import type { OutlineSelectors } from "../state/outline.store.ts";
import type { PersonPresent } from "../state/people.store.ts";
import { productionContextActions } from "../state/production-context.store.ts";
import { prompterActions } from "../state/prompter.store.ts";
import { readAloudActions } from "../state/read-aloud.store.ts";
import { rulerActions } from "../state/ruler.store.ts";
import { rundownActions } from "../state/rundown.store.ts";
import { sprintActions } from "../state/sprint.store.ts";
import { trashActions } from "../state/trash.store.ts";
import { workspaceActions } from "../state/workspace.store.ts";
import { writingActions } from "../state/writing.store.ts";
import { zoomActions } from "../state/zoom.store.ts";

const HISTORY_ROUTE_ID = "/s/$docId/history";

const asLeftTab = (value: string | null): LeftTab | null =>
  LEFT_TABS.find((tab) => tab === value) ?? null;

const asSideTab = (value: string | null): SideTab | null =>
  SIDE_TABS.find((tab) => tab === value) ?? null;

const isDarkTheme = (theme: string): boolean => {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  if (
    typeof document !== "undefined" &&
    document.documentElement.getAttribute("data-theme") === "dark"
  ) {
    return true;
  }
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
};

function roleFromService(
  services: PersonServices,
  docId: string | null,
): CommandContext["role"] {
  if (docId === null) return null;
  if (services.commands.state("doc.rename").visible) return "editor";
  if (services.commands.state("comment.onScript").enabled) return "commenter";
  return "viewer";
}

/**
 * Reads a point-in-time snapshot of where the palette opened, without subscribing to editor
 * transactions or keystrokes (ADR 0031).
 */
export function snapshotPaletteSignals(options: {
  readonly docId: string | null;
  readonly routeId: string | null;
  readonly inTitlePage: boolean;
  readonly services: PersonServices;
  readonly env: Pick<Environment, "shellState" | "where" | "dom" | "online">;
  readonly facts: FactsSelectors | null;
  readonly outline: OutlineSelectors | null;
  readonly people: { get(): readonly PersonPresent[] } | null;
}): RecommendationSignals {
  const { docId, routeId, inTitlePage, services, env, facts, outline, people } =
    options;
  const shell = env.shellState.get();
  const activeDocId = docId ?? shell.docId;
  const format =
    activeDocId === null
      ? null
      : services.openScriptStore(activeDocId).get("script.format");
  const trash =
    activeDocId === null
      ? { inTrash: false, canDelete: false }
      : trashActions.get(activeDocId);

  const command: CommandContext = {
    screen: shell.screen,
    focus: env.dom.focusKind(),
    docOpen: activeDocId !== null,
    role: roleFromService(services, activeDocId),
    online: env.online(),
    platform: env.where.platform,
    shell: env.where.shell,
    demo: false,
    signedIn: services.personSignedIn ?? true,
    workspace: workspaceActions.get(),
    panelOpen: {
      left: shell.panels.left !== null,
      side: shell.panels.side !== null,
    },
    historyPresent: shell.historyPresent,
    format,
    rulerShown: rulerActions.get(),
    formattingBarShown: formattingBarActions.get(),
    layoutView: layoutViewActions.get(),
    spaceBeforeSet: shell.spaceBeforeSet,
    zoom: activeDocId === null ? null : zoomActions.get(),
    zoomPercent: activeDocId === null ? null : services.editor.zoomPercent(),
    production:
      activeDocId === null ? null : productionContextActions.get(activeDocId),
    docKind:
      activeDocId === null
        ? null
        : services.library.docKindOf(activeDocId).get(),
    projectKind:
      activeDocId === null
        ? null
        : services.library.documentKind(activeDocId).get(),
    outlineStart:
      activeDocId === null ? false : outlineStartActions.get(activeDocId),
    writing: activeDocId === null ? null : writingActions.get(activeDocId),
    material: activeDocId === null ? null : materialActions.get(activeDocId),
    driver:
      activeDocId === null
        ? null
        : driverCommandContext(services.userId, activeDocId),
    rundown: activeDocId === null ? null : rundownActions.context(activeDocId),
    prompter: activeDocId === null ? null : prompterActions.get(activeDocId),
    inTrash: trash.inTrash,
    canDelete: trash.canDelete,
    focusMode: focusModeActions.get(),
    readingAloud: readAloudActions.get(),
    sprintRunning: sprintActions.get(),
  };

  const history = historyActions.get();
  const rawElement = facts?.get("element") ?? null;
  const selectedText = facts?.get("selectedText") ?? "";
  const blockId = facts?.get("blockId") ?? null;
  const selectionEmpty = facts?.get("selectionEmpty") ?? true;

  return {
    command,
    historyScreen: routeId === HISTORY_ROUTE_ID,
    historyComparing:
      history.docId === activeDocId && history.baseline !== null,
    caretElement:
      rawElement === null ? null : rawElement.trim().toLocaleLowerCase(),
    inTitlePage,
    hasSelection:
      (blockId !== null && !selectionEmpty) ||
      selectedText.length > 0 ||
      command.material?.selection === true,
    activeLeftTab: asLeftTab(shell.panels.left),
    activeSideTab: asSideTab(shell.panels.side),
    besideOpen: currentBeside() !== null,
    peoplePresent: people?.get().length ?? 0,
    sceneCount: outline?.count() ?? 0,
    resolvedDark: isDarkTheme(services.settings.get("appearance.theme")),
  };
}

function formatLabelOf(format: CommandContext["format"]): string | null {
  if (format === null) return null;
  const choices = SETTINGS.get("script.format").type.choices ?? [];
  return choices.find((choice) => choice.value === format)?.label ?? null;
}

/** Builds a short, calm caption naming where the palette opened (e.g. "Screenplay · Scene 4"). */
export function formatPaletteContext(
  signals: RecommendationSignals,
  facts: FactsSelectors | null,
): string | null {
  const { command: ctx } = signals;
  const words = PALETTE_WORDS.context;

  if (ctx.inTrash) return words.inTrash;
  if (signals.historyScreen === true) return words.history;
  if (ctx.screen === "library") {
    return ctx.online
      ? words.library
      : words.joined(words.library, words.offline);
  }
  if (ctx.screen === "board") return words.board;
  if (ctx.screen === "preferences") return words.preferences;
  if (ctx.screen === "project_settings") return words.projectSettings;
  if (ctx.screen === "workspace_settings") return words.workspaceSettings;
  if (ctx.screen === "send") return words.send;
  if (ctx.screen !== "document" || !ctx.docOpen) return null;

  if (ctx.docKind === "rundown") {
    return ctx.online
      ? words.rundown
      : words.joined(words.rundown, words.offline);
  }

  const base = formatLabelOf(ctx.format);
  if (ctx.production?.locked) {
    return words.locked(ctx.production.activeName);
  }
  if (ctx.writing?.position === "private") {
    return base === null
      ? words.privateCopy
      : words.joined(base, words.privateCopy);
  }
  if (ctx.writing?.position === "suggestions") {
    return base === null
      ? words.suggestions
      : words.joined(base, words.suggestions);
  }
  if (ctx.role === "viewer") {
    return base === null ? words.readOnly : words.joined(base, words.readOnly);
  }
  if (ctx.role === "commenter") {
    return base === null
      ? words.commenter
      : words.joined(base, words.commenter);
  }
  if (signals.inTitlePage === true) {
    return base === null
      ? words.titlePage
      : words.joined(base, words.titlePage);
  }
  if (!ctx.online) {
    return base === null ? words.offline : words.joined(base, words.offline);
  }
  const scene = facts?.get("scene") ?? null;
  if (base !== null && scene !== null) return words.joined(base, scene);
  const page = facts?.get("page") ?? null;
  if (base !== null && page !== null) return words.joined(base, page);
  return base;
}
