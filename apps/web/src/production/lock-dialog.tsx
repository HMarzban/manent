// Lock for production: the consequence dialog that says who is affected and with which defaults, and locks.
import {
  COLOUR_ORDERS,
  COLOUR_ORDER_IDS,
  NUMBERING_SCHEMES,
  colourOrderText,
  revisionName,
} from "@manent/revisions";
import type { ColourOrderId, NumberingScheme } from "@manent/revisions";
import { SETTINGS } from "@manent/settings";
import { Button, ConsequenceDialog, PRODUCTION_WORDS } from "@manent/ui";
import { useState } from "react";
import type { ReactNode } from "react";
import { useDocumentTitle } from "../screens/document/title-bar.tsx";
import { useEnvironment, useServices } from "../services/context.tsx";
import { Choices } from "./choices.tsx";
import { useDialogRequest, useDialogServices } from "./dialog-context.ts";
import { lockedMessage } from "./messages.ts";
import { colourOrderStart, deviceDay } from "./state-facts.ts";

const WORDS = PRODUCTION_WORDS;
// the defaults line names the first three colours of the order
const DEFAULTS_COLOURS = 3;

const NUMBERING_CHOICES = NUMBERING_SCHEMES.map((value) => ({
  value,
  label: WORDS.numberingChoices[value],
}));

const ORDER_CHOICES = COLOUR_ORDER_IDS.map((value) => ({
  value,
  label: colourOrderText(COLOUR_ORDERS[value]),
}));

/** The script's own setting while it names a member of `list`, else the list's first. */
function chosenOf<T extends string>(list: readonly T[], value: unknown): T {
  return list.find((member) => member === value) ?? list[0]!;
}

interface LockChoiceState {
  numbering: NumberingScheme;
  colourOrder: ColourOrderId;
  setNumbering(value: NumberingScheme): void;
  setColourOrder(value: ColourOrderId): void;
}

/** The numbering scheme and the colour order the script locks with: Script settings' values until changed here. */
function useLockChoices(docId: string): LockChoiceState {
  const store = useServices().openScriptStore(docId);
  const [numbering, setNumbering] = useState(() =>
    chosenOf(NUMBERING_SCHEMES, store.get("script.numbering")),
  );
  const [colourOrder, setColourOrder] = useState(() =>
    chosenOf(COLOUR_ORDER_IDS, store.get("script.colourOrder")),
  );
  return { numbering, colourOrder, setNumbering, setColourOrder };
}

/** The defaults, and with Change the two choices; what is chosen is kept while the dialog is open. */
function LockChoices(props: { choices: LockChoiceState }): ReactNode {
  const { choices } = props;
  const [changing, setChanging] = useState(false);
  const order = COLOUR_ORDERS[choices.colourOrder];
  return (
    <div className="flex flex-col gap-3 text-ui">
      <p className="flex flex-wrap items-center gap-2">
        <span>
          {WORDS.lockDefaults(
            WORDS.numberingChoices[choices.numbering],
            colourOrderStart(order, DEFAULTS_COLOURS),
          )}
        </span>
        {changing ? null : (
          <Button variant="link" size="sm" onClick={() => setChanging(true)}>
            {WORDS.change}
          </Button>
        )}
      </p>
      {changing ? (
        <>
          <Choices
            label={SETTINGS.get("script.numbering").label}
            value={choices.numbering}
            choices={NUMBERING_CHOICES}
            onChoose={choices.setNumbering}
          />
          <Choices
            label={SETTINGS.get("script.colourOrder").label}
            value={choices.colourOrder}
            choices={ORDER_CHOICES}
            onChoose={choices.setColourOrder}
          />
        </>
      ) : null}
    </div>
  );
}

export function LockDialog(props: {
  open: boolean;
  onClose(): void;
}): ReactNode {
  const { open, onClose } = props;
  const services = useDialogServices();
  const { messages } = useServices();
  const { now } = useEnvironment();
  const title = useDocumentTitle(services.docId);
  const choices = useLockChoices(services.docId);
  const request = useDialogRequest("production.lock", open);
  // the first revision after the White production draft
  const next = revisionName(COLOUR_ORDERS[choices.colourOrder], 1);
  const lock = (): void =>
    request.send(
      () =>
        services.client.lock({
          numbering: choices.numbering,
          colourOrder: choices.colourOrder,
          lockedOn: deviceDay(now()),
        }),
      {
        ok: () => {
          messages.push(lockedMessage(next));
          onClose();
        },
        // the state the server answered with says what happened, and the dialog has no words for it
        refused: onClose,
      },
    );
  return (
    <ConsequenceDialog
      open={open}
      title={WORDS.lockTitle}
      titledBy="command"
      wide
      body={WORDS.lockBody(title, next)}
      action={WORDS.lockButton}
      busyLabel={request.busy ? WORDS.lockingButton : null}
      refusal={null}
      disabledReason={request.disabledReason}
      destructive={false}
      onAction={lock}
      onCancel={onClose}
    >
      <LockChoices choices={choices} />
    </ConsequenceDialog>
  );
}
