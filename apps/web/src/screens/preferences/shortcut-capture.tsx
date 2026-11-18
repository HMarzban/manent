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
  createKeyResolver,
  keyLabel,
  useCommands,
  useSubscribable,
} from "@manent/ui";
import { useEffect, useId, useMemo, useRef, useState } from "react";
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
const ASCII_LETTER = /^[A-Za-z]$/;
const ASCII_SYMBOL = /^[!-~]$/;
const LATIN_LETTER = /^\p{Script=Latin}$/u;
const HOSTS: Readonly<
  Record<NonNullable<Where["browser"]>, ReservedKey["host"]>
> = Object.freeze({
  Chrome: "chromium",
  Edge: "chromium",
  Firefox: "firefox",
  Safari: "safari",
});
const REMOVE_KEYS: ReadonlySet<string> = new Set(["Delete", "Backspace"]);

/**
 * Whether the page's matcher reads a press by the key's place rather than by what it typed: the digit row, a dead key,
 * a symbol typed with Shift or with Option on a letter, and a letter outside ASCII that is not Latin, is typed with Alt,
 * or is typed with Control or Command off the letter keys.
 */
function isReadByPlace(event: KeyboardEvent, platform: Platform): boolean {
  const { key, code } = event;
  const onLetter = code.startsWith("Key");
  if (code.startsWith("Digit") || key === "Dead") return true;
  if (key === "Unidentified") return !onLetter && !code.startsWith("Numpad");
  if ([...key].length !== 1 || ASCII_LETTER.test(key)) return false;
  if (ASCII_SYMBOL.test(key))
    return event.shiftKey || (event.altKey && platform === "mac" && onLetter);
  if (!LATIN_LETTER.test(key)) return true;
  if (event.altKey)
    return !(onLetter && event.ctrlKey && platform === "windows");
  return (event.ctrlKey || event.metaKey) && !onLetter;
}

/** The key a chord names for a press, read as the page's matcher reads it, so the chord kept is the one the press runs. */
function keyOf(event: KeyboardEvent, platform: Platform): string {
  if (!isReadByPlace(event, platform))
    return ASCII_LETTER.test(event.key) ? event.key.toUpperCase() : event.key;
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
    keyOf(event, platform),
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
  const resolve = useMemo(
    () =>
      createKeyResolver({
        table: () =>
          [...bindings.effective].flatMap(([id, keys]) =>
            keys.map((chord) => ({ id, chord })),
          ),
      }),
    [bindings],
  );
  const [found, setFound] = useState<{
    chord: Chord;
    runs: string | null;
  } | null>(null);
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Tab" || (event.key === "Escape" && found === null))
      return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") return setFound(null);
    const chord = chordOf(event, platform);
    if (chord !== null) setFound({ chord, runs: resolve(event.nativeEvent) });
  };
  return (
    <div className="flex items-center gap-2 py-2">
      <Input
        readOnly
        aria-label={PREFERENCES_WORDS.findByKeys}
        placeholder={PREFERENCES_WORDS.findByKeys}
        value={found === null ? "" : keyLabel(found.chord, platform)}
        onKeyDown={onKeyDown}
        className="h-control max-w-64 text-ui"
      />
      {found === null || found.runs === null ? null : (
        <span className="text-ui">{labelOf(service, found.runs)}</span>
      )}
    </div>
  );
}
