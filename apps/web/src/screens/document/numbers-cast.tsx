// Dialogue-by-character distribution list with GPU scaleX share bars and expandable top-8 cap for Details → Numbers.
import { Button, WRITING_TOOLS_WORDS } from "@manent/ui";
import { useState } from "react";
import type { ReactNode } from "react";

export interface CharacterDialogueCount {
  readonly name: string;
  readonly speeches: number;
  readonly words: number;
}

const DEFAULT_CAST_LIMIT = 8;

export function NumbersCast(props: {
  readonly characters: readonly CharacterDialogueCount[];
}): ReactNode {
  const { characters } = props;
  const [expanded, setExpanded] = useState(false);

  if (characters.length === 0) {
    return (
      <p className="text-meta text-fg-muted">
        {WRITING_TOOLS_WORDS.numbersNoDialogue}
      </p>
    );
  }

  const maxWords = Math.max(1, ...characters.map((c) => c.words));
  const capped = characters.length > DEFAULT_CAST_LIMIT && !expanded;
  const shown = capped ? characters.slice(0, DEFAULT_CAST_LIMIT) : characters;

  return (
    <div className="flex flex-col gap-1.5">
      <dl className="flex flex-col gap-2 text-ui">
        {shown.map((character) => {
          const share = Math.max(0.04, Math.min(1, character.words / maxWords));
          return (
            <div key={character.name} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <dt className="min-w-0 truncate text-fg">{character.name}</dt>
                <dd className="shrink-0 text-meta text-fg-muted tabular-nums">
                  {WRITING_TOOLS_WORDS.numbersCharacterSummary(
                    character.speeches,
                    character.words,
                  )}
                </dd>
              </div>
              <div aria-hidden="true" className="mn-share-track">
                <div
                  className="mn-share-fill"
                  style={{ transform: `scaleX(${share})` }}
                />
              </div>
            </div>
          );
        })}
      </dl>
      {characters.length > DEFAULT_CAST_LIMIT ? (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-control-sm cursor-pointer px-1.5 text-meta text-fg-muted hover:text-fg"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded
              ? WRITING_TOOLS_WORDS.numbersShowFewer
              : WRITING_TOOLS_WORDS.numbersShowAll(characters.length)}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
