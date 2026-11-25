// The palette's foot: the keys it answers to, and what Enter does to the row the keys are on.
import type { ReactNode } from "react";
import { useCommands } from "../commands-react/commands-context.tsx";
import { keyLabel } from "../commands-react/key-labels.ts";
import { Kbd } from "../components/stock/kbd.tsx";
import { PALETTE_WORDS } from "../words/palette.ts";
import type { Entry } from "./palette-entries.ts";
import type { PaletteRow } from "./palette-sources.ts";

const ENTER_WORDS: Readonly<Record<PaletteRow["kind"], string>> = Object.freeze(
  {
    command: PALETTE_WORDS.keys.choose,
    setting: PALETTE_WORDS.keys.change,
    place: PALETTE_WORDS.keys.open,
    document: PALETTE_WORDS.keys.open,
    person: PALETTE_WORDS.keys.open,
    help: PALETTE_WORDS.keys.open,
  },
);

/** What Enter does to `keyed`; null when nothing is keyed or the keyed row cannot run now. */
function enterWord(keyed: Entry | null): string | null {
  if (keyed === null) return null;
  if (keyed.type === "menu") return PALETTE_WORDS.keys.open;
  return keyed.row.enabled ? ENTER_WORDS[keyed.row.kind] : null;
}

export function KeyHint(props: {
  readonly keys: readonly string[];
  readonly word: string;
}): ReactNode {
  return (
    <span className="flex items-center gap-1">
      {props.keys.map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
      <span className="text-meta text-fg-muted">{props.word}</span>
    </span>
  );
}

/** Hidden from a screen reader, which has the platform's own keys for a list, and on a narrow palette or a touch screen. */
export function PaletteFooter(props: {
  keyed: Entry | null;
  inMenu: boolean;
}): ReactNode {
  const { keyed, inMenu } = props;
  const { platform } = useCommands();
  const label = (key: string): string => keyLabel(key, platform);
  const enter = enterWord(keyed);
  return (
    <div
      aria-hidden="true"
      className="flex min-h-row shrink-0 items-center gap-4 border-t border-line px-3 @max-[30rem]:hidden pointer-coarse:hidden"
    >
      <KeyHint
        keys={[label("ArrowUp"), label("ArrowDown")]}
        word={PALETTE_WORDS.keys.move}
      />
      {enter === null ? null : <KeyHint keys={[label("Enter")]} word={enter} />}
      {inMenu ? (
        <KeyHint keys={[label("Backspace")]} word={PALETTE_WORDS.keys.back} />
      ) : null}
      <KeyHint keys={[label("Escape")]} word={PALETTE_WORDS.keys.close} />
    </div>
  );
}
