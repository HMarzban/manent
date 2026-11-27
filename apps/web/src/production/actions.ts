// What each production command does on the shown script, loaded the first time one of them runs.
import { SETTINGS } from "@manent/settings";
import type { PageOp } from "@manent/sync-protocol";
import { PRODUCTION_WORDS } from "@manent/ui";
import { runRevisionCommand } from "../editor-host/production.ts";
import type { RevisionCommand } from "../editor-host/production.ts";
import type { HandlerDeps } from "../handlers/index.ts";
import { sendPath } from "../screens/send/form-ids.ts";
import { valueLabel } from "../screens/document/setting-messages.ts";
import { panelsActions } from "../state/panels.store.ts";
import { productionServicesFor } from "./live-services.ts";
import { broughtBackMessage, omittedMessage } from "./messages.ts";
import type { ProductionServices } from "./services.ts";

export type ProductionCommandId =
  | "production.lock"
  | "production.issue"
  | "production.recall"
  | "production.markRevised"
  | "production.clearRevised"
  | "production.lockPages"
  | "production.lockAPages"
  | "production.renumber"
  | "production.omitScene"
  | "production.bringBackScene"
  | "production.changeLayout"
  | "production.unlock"
  | "production.end"
  | "view.pages"
  | "view.marks.collated"
  | "view.marks.this_revision"
  | "view.marks.all"
  | "view.marks.since_full_draft"
  | "view.marks.none"
  | "view.colourRevised";

interface Run {
  docId: string;
  services: ProductionServices;
  deps: HandlerDeps;
}

/** Lock or unlock page numbers: unlocks only when every chosen page is locked. */
function lockOrUnlock({ services }: Run): PageOp {
  const chosen = new Set(services.chosenPages.get());
  for (let index = 0; index < services.pages.count(); index++) {
    const row = services.pages.row(index);
    if (row !== null && chosen.has(row.label) && !row.locked) return "lock";
  }
  return "unlock";
}

// the state the authority answers is the client's; a page operation has nothing more to say
const onPages = (op: (run: Run) => PageOp) => (run: Run) =>
  void run.services.client.pages({
    op: op(run),
    labels: [...run.services.chosenPages.get()],
    label: null,
  });

const onText = (command: RevisionCommand) => (run: Run) =>
  void runRevisionCommand(run.docId, command);

const onScene =
  (command: RevisionCommand, said: typeof omittedMessage) => (run: Run) => {
    const { ran, scene } = runRevisionCommand(run.docId, command);
    if (ran) run.deps.services.messages.push(said(scene));
  };

const opening = (kind: "lock" | "unlock" | "end") => (run: Run) => {
  run.deps.dom.rememberFocus();
  run.services.open.set({ kind });
};

const toSend = (form: "issue" | "recall") => (run: Run) =>
  run.deps.router.navigate(sendPath(run.docId, form));

const showing =
  (mode: Parameters<ProductionServices["view"]["setMode"]>[0]) => (run: Run) =>
    run.services.view.setMode(mode);

/** A frozen switch asks for its other value at once; a frozen choice stays open to choose one; elsewhere, the rows are shown. */
function changeLayout(run: Run): void {
  const open = run.services.open.get();
  if (open.kind !== "choose_layout") {
    run.deps.services.commands.run("doc.scriptSettings", "control");
    return;
  }
  const def = SETTINGS.get(open.key);
  if (def.type.choices !== null) return;
  const value =
    run.deps.services.openScriptStore(run.docId).get(open.key) !== true;
  run.deps.dom.rememberFocus();
  run.services.open.set({
    kind: "change_layout",
    change: {
      key: open.key,
      value,
      noun: def.noun ?? def.label,
      valueLabel: valueLabel(open.key, value, "row"),
    },
  });
}

const ACTIONS: Readonly<Record<ProductionCommandId, (run: Run) => void>> =
  Object.freeze({
    "production.lock": opening("lock"),
    "production.issue": toSend("issue"),
    "production.recall": toSend("recall"),
    "production.markRevised": onText("mark_revised"),
    "production.clearRevised": onText("clear_revised"),
    "production.lockPages": onPages(lockOrUnlock),
    "production.lockAPages": onPages(() => "lock_a_pages"),
    "production.renumber": ({ services }) =>
      services.open.set({ kind: "renumber" }),
    "production.omitScene": onScene("omit_scene", omittedMessage),
    "production.bringBackScene": onScene(
      "bring_back_scene",
      broughtBackMessage,
    ),
    "production.changeLayout": changeLayout,
    "production.unlock": opening("unlock"),
    "production.end": opening("end"),
    "view.pages": ({ deps }) => {
      panelsActions.open("left", "pages");
      if (deps.dom.pageFocused()) deps.dom.announce(PRODUCTION_WORDS.pagesTab);
    },
    "view.marks.collated": showing("collated"),
    "view.marks.this_revision": showing("this_revision"),
    "view.marks.all": showing("all"),
    "view.marks.since_full_draft": showing("since_full_draft"),
    "view.marks.none": showing("none"),
    "view.colourRevised": ({ services }) =>
      services.view.setTint(!services.view.tint()),
  });

/** Nothing happens before the script's production services exist: every command is hidden until then. */
export function runProductionCommand(
  id: ProductionCommandId,
  docId: string,
  deps: HandlerDeps,
): void {
  const services = productionServicesFor(docId);
  if (services !== null) ACTIONS[id]({ docId, services, deps });
}
