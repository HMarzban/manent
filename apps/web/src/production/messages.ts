// What production says in the message slot.
import { PRODUCTION_WORDS } from "@manent/ui";
import type { Message } from "@manent/ui";

const UNDO = Object.freeze({ label: "Undo", commandId: "edit.undo" });

export function omittedMessage(scene: string): Message {
  return {
    id: "production.omitted",
    text: PRODUCTION_WORDS.omittedMessage(scene),
    actions: [UNDO],
    lifetime: "reverse",
    ownWork: false,
  };
}

export function broughtBackMessage(scene: string): Message {
  return {
    id: "production.brought_back",
    text: PRODUCTION_WORDS.broughtBack(scene),
    actions: [UNDO],
    lifetime: "reverse",
    ownWork: false,
  };
}

/** Told once, until the person dismisses it. */
export function issuedOfflineMessage(issue: {
  byName: string;
  name: string;
  active: string;
}): Message {
  return {
    id: "production.issued_offline",
    text: PRODUCTION_WORDS.issuedOffline(
      issue.byName,
      issue.name,
      issue.active,
    ),
    actions: [],
    lifetime: "until_dismissed",
    ownWork: true,
  };
}

export function lockedMessage(next: string): Message {
  return {
    id: "production.locked",
    text: PRODUCTION_WORDS.locked(next),
    actions: [{ label: "Unlock…", commandId: "production.unlock" }],
    lifetime: "reverse",
    ownWork: false,
  };
}
