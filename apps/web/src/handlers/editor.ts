// The handlers of the editor's commands: a page command asks the open editor to run it and says why when it is refused;
// a zoom command sets the zoom the open page follows.
import { EDITOR_COMMANDS } from "@manent/commands";
import type { EditorCommandId } from "@manent/commands";
import type { ActionResult, ZoomSetting } from "@manent/editor";
import { EDITOR_WORDS, messageFor } from "@manent/ui";
import type { MessageQueue } from "@manent/ui";
import type { PageCommandId } from "../editor-host/command-actions.ts";
import type { EditorControl } from "../editor-host/control.ts";
import { zoomStep } from "../editor-host/zoom.ts";
import { sendPath } from "../screens/send/form-ids.ts";
import { rulerActions } from "../state/ruler.store.ts";
import { zoomActions } from "../state/zoom.store.ts";

type Refusal = Extract<ActionResult, { ok: false }>["reason"];

type Handler = () => void;

const PAGE_COMMAND_IDS: readonly PageCommandId[] = EDITOR_COMMANDS.filter(
  (c): c is Extract<typeof c, { scope: "editor" }> => c.scope === "editor",
).map((c) => c.id);
const PAGE_COMMANDS: ReadonlySet<string> = new Set(PAGE_COMMAND_IDS);

export const isPageCommand = (id: string): id is PageCommandId =>
  PAGE_COMMANDS.has(id);

const hasEveryPage = (
  rows: Partial<Record<PageCommandId, Handler>>,
): rows is Record<PageCommandId, Handler> =>
  PAGE_COMMAND_IDS.every((id) => rows[id] !== undefined);

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

const zoomTo = (zoom: ZoomSetting) => (): void => zoomActions.set(zoom);

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
    const result = control.run(id);
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
  // from the percent drawn, so Zoom in from Fit width goes to the next preset up
  const zoomBy = (direction: "in" | "out") => () => {
    const drawn = control.zoomPercent();
    const next = drawn === null ? null : zoomStep(drawn, direction);
    if (next !== null) zoomActions.set(next);
  };
  const pages: Partial<Record<PageCommandId, Handler>> = {};
  for (const id of PAGE_COMMAND_IDS) pages[id] = page(id);
  // the loop filled every row; this tells the type checker so, and never throws
  if (!hasEveryPage(pages))
    throw new RangeError("a page command has no handler");
  return {
    ...pages,
    "view.ruler": () => rulerActions.toggle(),
    "doc.export": send("export"),
    "doc.print": send("print"),
    "view.zoomIn": zoomBy("in"),
    "view.zoomOut": zoomBy("out"),
    "view.zoomFitWidth": zoomTo("fit_width"),
    "view.zoom50": zoomTo(50),
    "view.zoom75": zoomTo(75),
    "view.zoom100": zoomTo(100),
    "view.zoom125": zoomTo(125),
    "view.zoom150": zoomTo(150),
    "view.zoom200": zoomTo(200),
    "view.zoom300": zoomTo(300),
  };
}
