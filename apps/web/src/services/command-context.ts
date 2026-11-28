// Assembles CommandContext for the command service without subscribing to editor keystrokes.
import type { CommandContext } from "@manent/commands";
import type { SettingsStore } from "@manent/settings";
import type { StatusFacts, Subscribable } from "@manent/ui";
import type { EditorControl } from "../editor-host/control.ts";
import { driverCommandContext } from "../room/driver-context.ts";
import { focusModeActions } from "../state/focus-mode.store.ts";
import { formattingBarActions } from "../state/formatting-bar.store.ts";
import { layoutViewActions } from "../state/layout-view.store.ts";
import { materialActions } from "../state/material.store.ts";
import { outlineStartActions } from "../state/outline-start.store.ts";
import type { PersonStore } from "../state/person.store.ts";
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
import type { Environment, LibraryIndex } from "./ports.ts";

export type Access = StatusFacts["access"];

const ROLE_OF: Readonly<Record<Access, CommandContext["role"]>> = Object.freeze(
  { edit: "editor", comment: "commenter", view: "viewer", too_old: "editor" },
);

const EMPTY_DOC_CONTEXT = Object.freeze({
  docKind: null,
  projectKind: null,
  outlineStart: false,
  writing: null,
  material: null,
  driver: null,
  rundown: null,
  prompter: null,
  inTrash: false,
  canDelete: false,
});

function documentContext(
  docId: string | null,
  userId: string | null,
  library: Pick<LibraryIndex, "documentKind" | "docKindOf">,
) {
  if (docId === null) return EMPTY_DOC_CONTEXT;
  return {
    docKind: library.docKindOf(docId).get(),
    projectKind: library.documentKind(docId).get(),
    outlineStart: outlineStartActions.get(docId),
    writing: writingActions.get(docId),
    material: materialActions.get(docId),
    driver: userId === null ? null : driverCommandContext(userId, docId),
    rundown: rundownActions.context(docId),
    prompter: prompterActions.get(docId),
    ...trashActions.get(docId),
  };
}

/** What a command may know: the window's state from the shell, the focus and connection read now, and the person's. */
export function buildCommandContext(
  options: Pick<Environment, "shellState" | "dom" | "where"> & {
    demo: Subscribable<boolean>;
    usePerson: PersonStore;
  },
  parts: {
    openScriptStore(docId: string): SettingsStore;
    control: Pick<EditorControl, "zoomPercent">;
    network: Subscribable<boolean>;
    library: Pick<LibraryIndex, "documentKind" | "docKindOf">;
  },
  signedIn: boolean,
  accessOf: (docId: string) => Access,
): CommandContext {
  const { docId, screen, panels, historyPresent, spaceBeforeSet } =
    options.shellState.get();
  return {
    screen,
    focus: options.dom.focusKind(),
    docOpen: docId !== null,
    role: docId === null ? null : ROLE_OF[accessOf(docId)],
    online: parts.network.get(),
    platform: options.where.platform,
    shell: options.where.shell,
    demo: options.demo.get(),
    signedIn,
    workspace: workspaceActions.get(),
    panelOpen: { left: panels.left !== null, side: panels.side !== null },
    historyPresent,
    format:
      docId === null ? null : parts.openScriptStore(docId).get("script.format"),
    rulerShown: rulerActions.get(),
    formattingBarShown: formattingBarActions.get(),
    layoutView: layoutViewActions.get(),
    spaceBeforeSet,
    zoom: docId === null ? null : zoomActions.get(),
    zoomPercent: docId === null ? null : parts.control.zoomPercent(),
    production: docId === null ? null : productionContextActions.get(docId),
    ...documentContext(
      docId,
      options.usePerson.getState().person?.userId ?? null,
      parts.library,
    ),
    focusMode: focusModeActions.get(),
    readingAloud: readAloudActions.get(),
    sprintRunning: sprintActions.get(),
  };
}
