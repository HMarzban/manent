// Transcript rows for the Game Script player Beside: scene headings, dialogue beats, action, cues, and taken choices.
import type { GameTranscriptItem } from "@manent/schema";
import { INK_WORDS } from "@manent/ui";
import type { ReactNode } from "react";

function cueLabel(
  cueKind: Extract<GameTranscriptItem, { kind: "cue" }>["cueKind"],
): string {
  switch (cueKind) {
    case "emote":
      return INK_WORDS.cueEmote;
    case "camera":
      return INK_WORDS.cueCamera;
    case "engine":
      return INK_WORDS.cueEngine;
    case "condition":
      return INK_WORDS.cueCondition;
    case "set":
      return INK_WORDS.cueSet;
    case "tag":
      return INK_WORDS.cueTag;
  }
}

function InlineTags(props: { readonly tags: readonly string[] }): ReactNode {
  if (props.tags.length === 0) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {props.tags.map((tag, i) => (
        <span
          key={`${tag}:${i}`}
          className="rounded-control border border-line bg-well px-1.5 py-0.5 font-mono text-meta text-fg-muted"
        >
          {tag}
        </span>
      ))}
    </span>
  );
}

export function GameTranscriptRow(props: {
  readonly item: GameTranscriptItem;
  readonly showCues: boolean;
  readonly onJumpBlock: (blockId: string) => void;
}): ReactNode {
  const { item, showCues, onJumpBlock } = props;

  if (item.kind === "cue" && !showCues) return null;

  if (item.kind === "scene") {
    return (
      <button
        type="button"
        title={INK_WORDS.jumpToBlock}
        onClick={() => onJumpBlock(item.blockId)}
        className="mt-2 block w-full cursor-pointer border-b border-line px-2 pb-1 text-start font-mono text-meta font-semibold tracking-wide text-fg-muted uppercase transition-colors first:mt-0 hover:bg-subtle hover:text-fg focus-visible:outline-2 focus-visible:outline-ring"
      >
        {INK_WORDS.sceneOption(item.sceneIndex + 1, item.heading)}
      </button>
    );
  }

  if (item.kind === "choice") {
    return (
      <button
        type="button"
        title={INK_WORDS.jumpToBlock}
        onClick={() => onJumpBlock(item.blockId)}
        className="block w-full cursor-pointer rounded-control px-2 py-1 text-start text-ui italic text-fg-muted transition-colors hover:bg-subtle hover:text-fg focus-visible:outline-2 focus-visible:outline-ring"
      >
        {INK_WORDS.takenChoice(item.text)}
      </button>
    );
  }

  if (item.kind === "speech") {
    return (
      <button
        type="button"
        title={INK_WORDS.jumpToBlock}
        onClick={() => onJumpBlock(item.blockId)}
        className="flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-control px-2 py-1.5 text-start transition-colors hover:bg-subtle focus-visible:outline-2 focus-visible:outline-ring"
      >
        {item.character !== "" ? (
          <span className="font-mono text-meta font-semibold tracking-wide text-fg-accent">
            {item.character}
          </span>
        ) : null}
        {item.parenthetical !== null ? (
          <span className="text-meta italic text-fg-muted">
            {item.parenthetical}
          </span>
        ) : null}
        <span className="text-ui text-fg">{item.text}</span>
        <InlineTags tags={item.tags} />
      </button>
    );
  }

  if (item.kind === "cue") {
    const accent =
      item.cueKind === "emote" ||
      item.cueKind === "set" ||
      item.cueKind === "condition";
    return (
      <button
        type="button"
        title={INK_WORDS.jumpToBlock}
        onClick={() => onJumpBlock(item.blockId)}
        className="flex w-full cursor-pointer items-baseline gap-2 rounded-control border border-line bg-well px-2 py-1 text-start transition-colors hover:bg-subtle focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span
          className={
            accent
              ? "shrink-0 font-mono text-meta font-semibold uppercase text-fg-accent"
              : "shrink-0 font-mono text-meta font-semibold uppercase text-fg-muted"
          }
        >
          {cueLabel(item.cueKind)}
        </span>
        <span className="min-w-0 flex-1 font-mono text-meta text-fg-muted">
          {item.text}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      title={INK_WORDS.jumpToBlock}
      onClick={() => onJumpBlock(item.blockId)}
      className="flex w-full cursor-pointer flex-col items-start rounded-control px-2 py-1 text-start text-ui text-fg transition-colors hover:bg-subtle focus-visible:outline-2 focus-visible:outline-ring"
    >
      <span>{item.text}</span>
      <InlineTags tags={item.tags} />
    </button>
  );
}
