// The words of a suggestion in To review, and of the message after one is decided.

import type { Message } from "../components/message-slot/message.ts";

/** `scene` and its " · " lead the line; a block in no scene has neither. */
const inScene = (scene: string | null, text: string): string =>
  scene === null ? text : `${scene} · ${text}`;

export const SUGGESTIONS_WORDS = {
  useThis: "Use this",
  keepAsItWas: "Keep as it was",
  beforeLabel: "Before",
  suggestedLabel: "Suggested",
  /** The entry's line; `name` is null for the person's own suggestion. */
  suggested: (scene: string | null, name: string | null): string =>
    inScene(scene, `${name ?? "You"} suggested this`),
  used: (name: string, scene: string | null): string =>
    scene === null
      ? `Used ${name}'s suggestion.`
      : `Used ${name}'s suggestion in ${scene}.`,
  kept: (scene: string | null): string => `Kept ${scene ?? "it"} as it was.`,
} as const;

/** What deciding a suggestion did, for the message slot. */
export type SuggestionDecided =
  | { choice: "used"; name: string; scene: string | null }
  | { choice: "kept"; scene: string | null };

/** The message after a suggestion is decided: its Undo is the script's, as each decision is one step of it. */
export function suggestionDecidedMessage(event: SuggestionDecided): Message {
  return {
    id: "suggestion_decided",
    text:
      event.choice === "used"
        ? SUGGESTIONS_WORDS.used(event.name, event.scene)
        : SUGGESTIONS_WORDS.kept(event.scene),
    actions: [{ label: "Undo", commandId: "edit.undo" }],
    lifetime: "reverse",
    ownWork: false,
  };
}
