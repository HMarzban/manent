// Recording a shortcut: the press read as a chord, the verdict on giving it to a command, and the field that asks.
import {
  COMMANDS,
  RESERVED_KEYS,
  checkCapture,
  isChord,
} from "@manent/commands";
import type {
  CaptureVerdict,
  Chord,
  CommandService,
  Keys,
  ReservedKey,
} from "@manent/commands";
import type { Platform } from "@manent/settings";
import {
  Button,
  Input,
  PREFERENCES_WORDS,
  keyLabel,
  useCommands,
  useSubscribable,
} from "@manent/ui";
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import type { Where } from "../../platform.ts";
import { useEnvironment } from "../../services/context.tsx";
import { isCommandId } from "./search-index.ts";

const PUNCTUATION: Readonly<Record<string, string>> = Object.freeze({
  Comma: ",",
  Slash: "/",
  BracketLeft: "[",
  BracketRight: "]",
  Equal: "=",
  Minus: "-",
});
const LETTER_OR_DIGIT = /^(?:Key([A-Z])|Digit(\d))$/;
const HOSTS: Readonly<
  Record<NonNullable<Where["browser"]>, ReservedKey["host"]>
> = Object.freeze({
  Chrome: "chromium",
  Edge: "chromium",
  Firefox: "firefox",
  Safari: "safari",
});
const REMOVE_KEYS: ReadonlySet<string> = new Set(["Delete", "Backspace"]);

/** A letter, digit or symbol by its place on the keyboard, so Option or a layout never changes it; any other key by its name. */
function keyOf(event: KeyboardEvent): string {
  const place = LETTER_OR_DIGIT.exec(event.code);
  return place?.[1] ?? place?.[2] ?? PUNCTUATION[event.code] ?? event.key;
}

/**
 * The chord a press makes on `platform`, modifiers in the order Mod, Control, Alt, Shift; null for a modifier alone, a key
 * no chord names, or the Windows key, which no chord holds.
 */
function chordOf(event: KeyboardEvent, platform: Platform): Chord | null {
  const mac = platform === "mac";
  if (!mac && event.metaKey) return null;
  const chord = [
    (mac ? event.metaKey : event.ctrlKey) && "Mod",
    mac && event.ctrlKey && "Control",
    event.altKey && "Alt",
    event.shiftKey && "Shift",
    keyOf(event),
  ]
    .filter((part) => part !== false)
    .join("+");
  return isChord(chord) ? chord : null;
}

/** A command's label for the context now; the commands' own ids are always registered. */
export const labelOf = (service: CommandService, id: string): string =>
  isCommandId(id) ? service.state(id).label : "";

/** Whether two chords are one press on `platform`: they read the same. */
const isSamePress = (a: Chord, b: Chord, platform: Platform): boolean =>
  keyLabel(a, platform) === keyLabel(b, platform);

/** The keys this platform's browser keeps for `chord`; none outside a browser it knows. */
export function reservedHere(
  chord: Chord,
  where: Where,
): readonly ReservedKey[] {
  const host = where.browser === null ? null : HOSTS[where.browser];
  return RESERVED_KEYS.filter(
    (key) =>
      key.host === host &&
      key.platform === where.platform &&
      isSamePress(key.chord, chord, where.platform),
  );
}

const hasModifier = (event: KeyboardEvent): boolean =>
  event.ctrlKey || event.metaKey || event.altKey || event.shiftKey;

/** What a press typed, when it typed one character. */
const typedBy = (event: KeyboardEvent): string | null =>
  [...event.key].length === 1 ? event.key : null;

interface Pending {
  chord: Chord;
  typed: string | null;
  verdict: Exclude<CaptureVerdict, { ok: true }>;
}

/** The sentence and choices a verdict that is not a plain yes brings; a fixed key brings nothing. */
function Verdict(props: {
  pending: Pending;
  label: string;
  use(): void;
  again(): void;
}): ReactNode {
  const { pending, label, use, again } = props;
  const { service, platform } = useCommands();
  const keys = keyLabel(pending.chord, platform);
  const { verdict } = pending;
  if (verdict.ok === "ask") {
    const holder = labelOf(service, verdict.holderId);
    return (
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-meta">
          {PREFERENCES_WORDS.clash(keys, holder, label)}
        </p>
        <Button variant="outline" size="sm" onClick={use}>
          {PREFERENCES_WORDS.useItFor(label)}
        </Button>
        <Button variant="ghost" size="sm" onClick={again}>
          {PREFERENCES_WORDS.keep(holder)}
        </Button>
      </div>
    );
  }
  if (verdict.ok === "warn")
    return (
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-meta">
          {PREFERENCES_WORDS.warn(keys, verdict.effect)}
        </p>
        <Button variant="outline" size="sm" onClick={use}>
          {PREFERENCES_WORDS.useAnyway}
        </Button>
        <Button variant="ghost" size="sm" onClick={again}>
          {PREFERENCES_WORDS.chooseAnother}
        </Button>
      </div>
    );
  switch (verdict.reason) {
    case "fixed":
      return null;
    case "types_character":
      return (
        <p className="text-meta">
          {PREFERENCES_WORDS.typesCharacter(
            keys,
            pending.typed ?? pending.chord.split("+").at(-1) ?? "",
          )}
        </p>
      );
    case "leaves_script": {
      // the verdict holds for every browser, so the row is found whichever browser this is
      const held = RESERVED_KEYS.find(
        (key) =>
          key.leavesScript &&
          key.platform === platform &&
          isSamePress(key.chord, pending.chord, platform),
      );
      return held === undefined ? null : (
        <p className="text-meta">
          {PREFERENCES_WORDS.leaves(keys, held.effect)}
        </p>
      );
    }
  }
}

/**
 * The field that records a new shortcut for `commandId` (labelled `label`): one press, judged before anything is kept.
 * `onKeys` receives the keys to keep, empty for Delete; Escape calls `onClose`, and never leaves the screen.
 */
export function ShortcutCapture(props: {
  commandId: string;
  label: string;
  onKeys(keys: Keys): void;
  onClose(): void;
}): ReactNode {
  const { commandId, label, onKeys, onClose } = props;
  const { resolved, platform } = useCommands();
  const bindings = useSubscribable(resolved);
  const { where } = useEnvironment();
  const [pending, setPending] = useState<Pending | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const hintId = useId();
  useEffect(() => field.current?.focus(), []);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Tab") return;
    // the press is the shortcut being recorded, never a command
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") return onClose();
    if (REMOVE_KEYS.has(event.key) && !hasModifier(event)) return onKeys([]);
    const chord = chordOf(event, platform);
    if (chord === null) return;
    const verdict = checkCapture({
      chord,
      typedCharacter: typedBy(event),
      commandId,
      commands: COMMANDS,
      resolved: bindings,
      platform,
      shell: where.shell,
    });
    if (verdict.ok === true) return onKeys([chord]);
    setPending({ chord, typed: typedBy(event), verdict });
  };

  const again = (): void => {
    setPending(null);
    field.current?.focus();
  };
  return (
    <div className="flex flex-col gap-1 py-1">
      <Input
        ref={field}
        readOnly
        aria-label={label}
        aria-describedby={hintId}
        value={pending === null ? "" : keyLabel(pending.chord, platform)}
        onKeyDown={onKeyDown}
        className="h-control text-ui"
      />
      <p id={hintId} className="text-meta text-fg-muted">
        {PREFERENCES_WORDS.capture}
      </p>
      {pending === null ? null : (
        <Verdict
          pending={pending}
          label={label}
          use={() => onKeys([pending.chord])}
          again={again}
        />
      )}
    </div>
  );
}

/** A field that shows which command a press runs here, without running it; Escape clears what it shows. */
export function FindByKeys(): ReactNode {
  const { service, resolved, platform } = useCommands();
  const bindings = useSubscribable(resolved);
  const [chord, setChord] = useState<Chord | null>(null);
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Tab" || (event.key === "Escape" && chord === null))
      return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") return setChord(null);
    const pressed = chordOf(event, platform);
    if (pressed !== null) setChord(pressed);
  };
  const runs =
    chord === null
      ? undefined
      : [...bindings.effective].find(([, keys]) =>
          keys.some((k) => isSamePress(k, chord, platform)),
        )?.[0];
  return (
    <div className="flex items-center gap-2 py-2">
      <Input
        readOnly
        aria-label={PREFERENCES_WORDS.findByKeys}
        placeholder={PREFERENCES_WORDS.findByKeys}
        value={chord === null ? "" : keyLabel(chord, platform)}
        onKeyDown={onKeyDown}
        className="h-control max-w-64 text-ui"
      />
      {runs === undefined ? null : (
        <span className="text-ui">{labelOf(service, runs)}</span>
      )}
    </div>
  );
}
