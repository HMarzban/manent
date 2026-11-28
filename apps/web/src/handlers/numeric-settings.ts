// Inline PaletteAsk flows for numeric script and project settings, with validation, messages and Undo.
import {
  defaultLinesPerPage,
  maxLinesPerPage,
  parsePaper,
} from "@manent/pagination";
import { SETTINGS } from "@manent/settings";
import {
  LAYOUT_SETTINGS_WORDS,
  PALETTE_WORDS,
  PROJECT_WORDS,
  TIMING_WORDS,
  messageFor,
} from "@manent/ui";
import { announcing } from "../screens/document/setting-messages.ts";
import { paletteActions } from "../state/palette.store.ts";
import type { HandlerDeps } from "./index.ts";

const WHOLE_NUMBER = /^\d+$/;
const DECIMAL_NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;
const RESET_WORDS: ReadonlySet<string> = new Set([
  "",
  "default",
  "reset",
  "none",
]);

let pendingPrefill: { commandId: string; value: string } | null = null;

/** Supplies a one-shot initial input value for the next inline numeric setting prompt (e.g. from `"lines 50"`). */
export function setPendingNumericInitial(
  commandId: string,
  value: string,
): void {
  pendingPrefill = { commandId, value };
}

function consumePendingInitial(commandId: string): string | null {
  if (pendingPrefill === null || pendingPrefill.commandId !== commandId)
    return null;
  const { value } = pendingPrefill;
  pendingPrefill = null;
  return value;
}

function pushBrief(deps: HandlerDeps, id: string, text: string): void {
  deps.services.messages.push({
    id,
    text,
    actions: [],
    lifetime: "brief",
    ownWork: false,
  });
}

function pushUnavailable(
  deps: HandlerDeps,
  label: string,
  reason: string,
): void {
  deps.services.messages.push(
    messageFor({ kind: "command_unavailable", label, reason }),
  );
}

/** Opens the inline ask prompt for `script.linesPerPage` on the active script. */
export function askLinesPerPage(deps: HandlerDeps): void {
  const { docId } = deps.shellState();
  if (docId === null) return;
  const store = announcing(deps.services.openScriptStore(docId), deps.services);
  if (!store.explain("script.linesPerPage").writable) {
    pushUnavailable(
      deps,
      SETTINGS.get("script.linesPerPage").label,
      "can't change while page numbers are locked",
    );
    return;
  }
  const current = store.get("script.linesPerPage");
  const format = store.get("script.format");
  const engineVersion = store.get("script.engineVersion");
  const paper = parsePaper(store.get("script.paper"), engineVersion);
  const defaultLines = defaultLinesPerPage(format, paper, engineVersion);
  const maxLines = maxLinesPerPage(format, paper, engineVersion);
  const prefill = consumePendingInitial("doc.linesPerPage");

  paletteActions.ask({
    prompt: PALETTE_WORDS.ask.linesPerPage(defaultLines, maxLines),
    choices: null,
    initial: prefill ?? (current === null ? "" : String(current)),
    placeholder: LAYOUT_SETTINGS_WORDS.formatFigure(defaultLines),
    allowEmpty: true,
    submit(raw) {
      const trimmed = raw.trim().toLocaleLowerCase();
      if (RESET_WORDS.has(trimmed)) {
        store.set("script.linesPerPage", null);
        return;
      }
      if (!WHOLE_NUMBER.test(trimmed)) {
        pushBrief(
          deps,
          "lines_per_page_invalid",
          LAYOUT_SETTINGS_WORDS.linesRangeError(maxLines),
        );
        return;
      }
      const value = Number(trimmed);
      if (value < 10 || value > maxLines) {
        pushBrief(
          deps,
          "lines_per_page_invalid",
          LAYOUT_SETTINGS_WORDS.linesRangeError(maxLines),
        );
        return;
      }
      const result = store.set("script.linesPerPage", value);
      if (!result.ok) {
        pushUnavailable(
          deps,
          SETTINGS.get("script.linesPerPage").label,
          "can't change while page numbers are locked",
        );
      }
    },
  });
}

/** Opens the inline ask prompt for `project.readRate` on the active document's project. */
export function askReadRate(deps: HandlerDeps): void {
  const { docId } = deps.shellState();
  if (docId === null) return;
  const store = announcing(deps.services.openScriptStore(docId), deps.services);
  if (!store.explain("project.readRate").writable) {
    pushUnavailable(
      deps,
      SETTINGS.get("project.readRate").label,
      "only the project's owner can change this",
    );
    return;
  }
  const current = store.get("project.readRate");
  const prefill = consumePendingInitial("project.readRate");
  paletteActions.ask({
    prompt: PALETTE_WORDS.ask.readRate,
    choices: null,
    initial: prefill ?? String(Number(current.toFixed(2))),
    placeholder: TIMING_WORDS.readRateValue(11.25),
    allowEmpty: false,
    submit(raw) {
      const trimmed = raw.trim();
      if (!DECIMAL_NUMBER.test(trimmed)) {
        pushBrief(
          deps,
          "read_rate_invalid",
          TIMING_WORDS.readRateRefused(trimmed),
        );
        return;
      }
      const parsed = SETTINGS.get("project.readRate").type.parse(
        Number(trimmed),
      );
      if (!parsed.ok || typeof parsed.value !== "number") {
        pushBrief(
          deps,
          "read_rate_invalid",
          TIMING_WORDS.readRateRefused(trimmed),
        );
        return;
      }
      store.set("project.readRate", parsed.value);
    },
  });
}

/** Opens the inline ask prompt for `project.targetPages` on the active document's project. */
export function askTargetPages(deps: HandlerDeps): void {
  const { docId } = deps.shellState();
  if (docId === null) return;
  const store = announcing(deps.services.openScriptStore(docId), deps.services);
  if (!store.explain("project.targetPages").writable) {
    pushUnavailable(
      deps,
      SETTINGS.get("project.targetPages").label,
      "only the project's owner can change this",
    );
    return;
  }
  const current = store.get("project.targetPages");
  const prefill = consumePendingInitial("project.targetPages");
  paletteActions.ask({
    prompt: PALETTE_WORDS.ask.targetPages,
    choices: null,
    initial: prefill ?? (current === null ? "" : String(current)),
    placeholder: PROJECT_WORDS.targetNone,
    allowEmpty: true,
    submit(raw) {
      const trimmed = raw.trim().toLocaleLowerCase();
      if (RESET_WORDS.has(trimmed)) {
        store.set("project.targetPages", null);
        return;
      }
      if (!WHOLE_NUMBER.test(trimmed)) {
        pushBrief(
          deps,
          "target_pages_invalid",
          PALETTE_WORDS.ask.targetPagesRange,
        );
        return;
      }
      const parsed = SETTINGS.get("project.targetPages").type.parse(
        Number(trimmed),
      );
      if (!parsed.ok || typeof parsed.value !== "number") {
        pushBrief(
          deps,
          "target_pages_invalid",
          PALETTE_WORDS.ask.targetPagesRange,
        );
        return;
      }
      store.set("project.targetPages", parsed.value);
    },
  });
}
