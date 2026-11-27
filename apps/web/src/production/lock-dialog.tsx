// Lock for production: the consequence dialog that says who is affected and with which defaults, and locks the
// script or, with Try it on a copy first, a copy of it.
import {
  COLOUR_ORDERS,
  COLOUR_ORDER_IDS,
  NUMBERING_SCHEMES,
  colourOrderText,
  revisionName,
} from "@manent/revisions";
import type { ColourOrderId, NumberingScheme } from "@manent/revisions";
import { SETTINGS } from "@manent/settings";
import {
  Button,
  COPIES_WORDS,
  ConsequenceDialog,
  PRODUCTION_WORDS,
} from "@manent/ui";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useLockOnCopy } from "../copies/lock-on-copy.ts";
import type { LockChoice } from "../copies/lock-on-copy.ts";
import { useDocumentTitle } from "../screens/document/title-bar.tsx";
import { useEnvironment, useServices } from "../services/context.tsx";
import { Choices } from "./choices.tsx";
import { useDialogRequest, useDialogServices } from "./dialog-context.ts";
import { lockedMessage } from "./messages.ts";
import { colourOf, defaultsLine, deviceDay } from "./state-facts.ts";

const WORDS = PRODUCTION_WORDS;

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
function useLockChoices(docId: string, open: boolean): LockChoiceState {
  const store = useServices().openScriptStore(docId);
  const [numbering, setNumbering] = useState(() =>
    chosenOf(NUMBERING_SCHEMES, store.get("script.numbering")),
  );
  const [colourOrder, setColourOrder] = useState(() =>
    chosenOf(COLOUR_ORDER_IDS, store.get("script.colourOrder")),
  );
  useEffect(() => {
    if (!open) return;
    setNumbering(chosenOf(NUMBERING_SCHEMES, store.get("script.numbering")));
    setColourOrder(chosenOf(COLOUR_ORDER_IDS, store.get("script.colourOrder")));
  }, [open, store]);
  return { numbering, colourOrder, setNumbering, setColourOrder };
}

/** The defaults, and with Change the two choices; what is chosen is kept while the dialog is open. */
function LockChoices(props: {
  choices: LockChoiceState;
  open: boolean;
  disabled: boolean;
}): ReactNode {
  const { choices, open, disabled } = props;
  const [changing, setChanging] = useState(false);
  useEffect(() => {
    if (!open) setChanging(false);
  }, [open]);
  const order = COLOUR_ORDERS[choices.colourOrder];
  const previewColours = order
    .slice(0, 3)
    .flatMap((colour) => colourOf(colour) ?? []);
  return (
    <div className="flex flex-col gap-3 text-ui">
      <p className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1" aria-hidden="true">
          {previewColours.map((colour) => (
            <span key={colour} data-rev={colour} className="mn-rev-chip" />
          ))}
        </span>
        <span>{defaultsLine(choices.numbering, order)}</span>
        {changing ? null : (
          <Button
            variant="link"
            size="sm"
            disabled={disabled}
            onClick={() => setChanging(true)}
          >
            {WORDS.change}
          </Button>
        )}
      </p>
      {changing ? (
        <div className="flex flex-col gap-3 rounded-surface border border-line bg-subtle p-3">
          <Choices
            label={SETTINGS.get("script.numbering").label}
            value={choices.numbering}
            choices={NUMBERING_CHOICES}
            showLegend
            disabled={disabled}
            onChoose={choices.setNumbering}
          />
          <Choices
            label={SETTINGS.get("script.colourOrder").label}
            value={choices.colourOrder}
            choices={ORDER_CHOICES}
            showLegend
            disabled={disabled}
            onChoose={choices.setColourOrder}
          />
        </div>
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
  const choices = useLockChoices(services.docId, open);
  const request = useDialogRequest("production.lock", open);
  // the first revision after the White production draft
  const next = revisionName(COLOUR_ORDERS[choices.colourOrder], 1);
  const onCopy = useLockOnCopy({
    docId: services.docId,
    open,
    request,
    onLocked: onClose,
  });
  const choice = (): LockChoice => ({
    numbering: choices.numbering,
    colourOrder: choices.colourOrder,
    lockedOn: deviceDay(now()),
  });
  const lock = (): void =>
    request.send(() => services.client.lock(choice()), {
      ok: () => {
        messages.push(lockedMessage(next));
        onClose();
      },
      refused: () => WORDS.lockRefused,
    });
  const busy = onCopy.copying || request.busy;
  const busyLabel = onCopy.copying
    ? COPIES_WORDS.copying
    : request.busy
      ? WORDS.lockingButton
      : null;
  const copyDisabled =
    request.disabledReason !== undefined || onCopy.refusedCopy || busy;
  return (
    <ConsequenceDialog
      open={open}
      title={WORDS.lockTitle}
      titledBy="command"
      wide
      body={WORDS.lockBody(title, next)}
      action={WORDS.lockButton}
      busyLabel={busyLabel}
      refusal={request.refusal}
      disabledReason={request.disabledReason}
      destructive={false}
      actionTour="lock:confirm"
      onAction={() => (onCopy.refusedCopy ? onCopy.retry(choice()) : lock())}
      onCancel={onClose}
      alternative={{
        label: COPIES_WORDS.tryOnCopy,
        disabled: copyDisabled,
        tour: "lock:copy",
        // offline the dialog's line already says the connection's reason, and nothing is copied
        onAction: () => {
          if (!copyDisabled) onCopy.start(choice());
        },
      }}
    >
      <LockChoices choices={choices} open={open} disabled={busy} />
    </ConsequenceDialog>
  );
}
