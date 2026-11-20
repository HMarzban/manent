// The handlers of the editor's commands: a page command asks the open editor for its action and says why when it is refused.
import { EDITOR_COMMANDS } from "@manent/commands";
import type { CommandService, EditorCommandId } from "@manent/commands";
import type { ActionResult, EditorAction } from "@manent/editor";
import { EDITOR_WORDS, messageFor } from "@manent/ui";
import type { MessageQueue } from "@manent/ui";
import type { EditorControl } from "../editor-host/control.ts";
import { sendPath } from "../screens/send/forms.ts";
import { rulerActions } from "../state/ruler.store.ts";

type PageCommandId = Extract<
  (typeof EDITOR_COMMANDS)[number],
  { scope: "editor" }
>["id"];
type Refusal = Extract<ActionResult, { ok: false }>["reason"];

export const EDITOR_COMMAND_ACTIONS: Readonly<
  Record<PageCommandId, EditorAction>
> = Object.freeze({
  "format.element": { kind: "picker" },
  "element.sceneHeading": { kind: "element", slot: "1" },
  "element.action": { kind: "element", slot: "2" },
  "element.character": { kind: "element", slot: "3" },
  "element.parenthetical": { kind: "element", slot: "4" },
  "element.dialogue": { kind: "element", slot: "5" },
  "element.transition": { kind: "element", slot: "6" },
  "element.shot": { kind: "element", slot: "7" },
  "element.section": { kind: "element", slot: "8" },
  "element.newAct": { kind: "element", slot: "9" },
  "element.general": { kind: "element", slot: "0" },
  "element.endOfAct": { kind: "element", slot: "E" },
  "element.emote": { kind: "element", slot: "M" },
  "element.camera": { kind: "element", slot: "C" },
  "element.engineDirection": { kind: "element", slot: "G" },
  "format.dualDialogue": { kind: "dual_dialogue" },
  "format.pageBreak": { kind: "page_break" },
  "format.bold": { kind: "style", mark: "bold" },
  "format.italic": { kind: "style", mark: "italic" },
  "format.underline": { kind: "style", mark: "underline" },
  "format.strike": { kind: "style", mark: "strike" },
  "format.caps": { kind: "style", mark: "caps" },
  "format.alignLeft": { kind: "align", value: "left" },
  "format.alignCenter": { kind: "align", value: "center" },
  "format.alignRight": { kind: "align", value: "right" },
  "format.spaceBefore": { kind: "space_before" },
  "format.colour.none": { kind: "colour", value: null },
  "format.colour.red": { kind: "colour", value: "red" },
  "format.colour.orange": { kind: "colour", value: "orange" },
  "format.colour.green": { kind: "colour", value: "green" },
  "format.colour.blue": { kind: "colour", value: "blue" },
  "format.colour.violet": { kind: "colour", value: "violet" },
  "format.highlight.none": { kind: "highlight", value: null },
  "format.highlight.yellow": { kind: "highlight", value: "yellow" },
  "format.highlight.green": { kind: "highlight", value: "green" },
  "format.highlight.pink": { kind: "highlight", value: "pink" },
  "format.highlight.orange": { kind: "highlight", value: "orange" },
  "format.highlight.violet": { kind: "highlight", value: "violet" },
});

const isPageCommand = (id: string): id is PageCommandId =>
  Object.hasOwn(EDITOR_COMMAND_ACTIONS, id);

/** The clause the message slot gives a refusal; null when there is nothing to say. */
function reasonOf(
  refusal: Refusal,
  formatLabel: () => string | null,
): string | null {
  switch (refusal) {
    case "needs_two_speeches":
      return EDITOR_WORDS.reasons.needsTwoSpeeches;
    case "not_in_format": {
      const format = formatLabel();
      return format === null ? null : EDITOR_WORDS.reasons.notInFormat(format);
    }
    case "read_only":
      return EDITOR_WORDS.reasons.readOnly;
    case "nothing_to_do":
      return null;
  }
}

/** The label every place shows for `id`. */
function commandLabel(id: EditorCommandId): string {
  const def = EDITOR_COMMANDS.find((c) => c.id === id);
  if (def === undefined) throw new RangeError(`no editor command ${id}`);
  return def.label;
}

/** One handler per editor command; `formatLabel` names the open script's format ("Stage play"), null off a document. */
export function createEditorHandlers(deps: {
  control: EditorControl;
  messages: MessageQueue;
  formatLabel: () => string | null;
  docId: () => string | null;
  navigate: (path: string) => void;
}): Readonly<Record<EditorCommandId, () => void>> {
  const { control, messages, formatLabel, docId, navigate } = deps;
  const page = (id: PageCommandId) => () => {
    const result = control.run(EDITOR_COMMAND_ACTIONS[id]);
    // null: no editor is open
    if (result === null || result.ok) return;
    const reason = reasonOf(result.reason, formatLabel);
    if (reason !== null)
      messages.push(
        messageFor({
          kind: "command_unavailable",
          label: commandLabel(id),
          reason,
        }),
      );
  };
  const send = (form: "export" | "print") => () => {
    const shown = docId();
    if (shown !== null) navigate(sendPath(shown, form));
  };
  return {
    "format.element": page("format.element"),
    "element.sceneHeading": page("element.sceneHeading"),
    "element.action": page("element.action"),
    "element.character": page("element.character"),
    "element.parenthetical": page("element.parenthetical"),
    "element.dialogue": page("element.dialogue"),
    "element.transition": page("element.transition"),
    "element.shot": page("element.shot"),
    "element.section": page("element.section"),
    "element.newAct": page("element.newAct"),
    "element.general": page("element.general"),
    "element.endOfAct": page("element.endOfAct"),
    "element.emote": page("element.emote"),
    "element.camera": page("element.camera"),
    "element.engineDirection": page("element.engineDirection"),
    "format.dualDialogue": page("format.dualDialogue"),
    "format.pageBreak": page("format.pageBreak"),
    "format.bold": page("format.bold"),
    "format.italic": page("format.italic"),
    "format.underline": page("format.underline"),
    "format.strike": page("format.strike"),
    "format.caps": page("format.caps"),
    "format.alignLeft": page("format.alignLeft"),
    "format.alignCenter": page("format.alignCenter"),
    "format.alignRight": page("format.alignRight"),
    "format.spaceBefore": page("format.spaceBefore"),
    "format.colour.none": page("format.colour.none"),
    "format.colour.red": page("format.colour.red"),
    "format.colour.orange": page("format.colour.orange"),
    "format.colour.green": page("format.colour.green"),
    "format.colour.blue": page("format.colour.blue"),
    "format.colour.violet": page("format.colour.violet"),
    "format.highlight.none": page("format.highlight.none"),
    "format.highlight.yellow": page("format.highlight.yellow"),
    "format.highlight.green": page("format.highlight.green"),
    "format.highlight.pink": page("format.highlight.pink"),
    "format.highlight.orange": page("format.highlight.orange"),
    "format.highlight.violet": page("format.highlight.violet"),
    "view.ruler": () => rulerActions.toggle(),
    "doc.export": send("export"),
    "doc.print": send("print"),
  };
}

/** The `run` of the page's command keymap: true when the key was used (the keymap then prevents the browser's default). */
export function createEditorKeyRun(deps: {
  commands: Pick<CommandService, "run">;
  messages: MessageQueue;
  labelOf: (id: string) => string;
}): (id: string) => boolean {
  const { commands, messages } = deps;
  return (id) => {
    const result = commands.run(id, "key");
    // a disabled command has already said why
    if (result === "ran" || result === "disabled") return true;
    // a page command is absent only for someone who cannot edit, and its key still belongs to the page
    if (result === "passed" || !isPageCommand(id)) return false;
    messages.push(
      messageFor({
        kind: "command_unavailable",
        label: deps.labelOf(id),
        reason: EDITOR_WORDS.reasons.readOnly,
      }),
    );
    return true;
  };
}
