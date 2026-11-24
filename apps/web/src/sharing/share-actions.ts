// What the owner does in Share: change or remove a role, add a person or a group, copy a link and turn it off. Each
// change is said in the message slot; a refusal is said on the row it came from.
import { SHARING_WORDS, formatDate } from "@manent/ui";
import type { Message, MessageQueue } from "@manent/ui";
import type { SignInChoice } from "@manent/sync-protocol";
import type { Reverses } from "../services/ports.ts";
import type {
  ShareAccess,
  ShareAnswer,
  ShareGroup,
  ShareLink,
  SharePerson,
  ShareRequests,
  ShareRole,
} from "./share-requests.ts";
import type { ShareHeld } from "./share-store.ts";

const WORDS = SHARING_WORDS;

/** The row a refusal is said on: a person's, a group's, the add row or the link group. */
export type RowKey = `person:${string}` | `group:${string}` | "add" | "link";

export interface ShareActions {
  changeRole(person: SharePerson, role: ShareRole): Promise<void>;
  removePerson(person: SharePerson): Promise<void>;
  removeGroup(group: ShareGroup, name: string): Promise<void>;
  /** False when the server refused it. */
  addPerson(choice: SignInChoice, role: ShareRole): Promise<boolean>;
  /** False when the server refused it. */
  addGroup(groupId: string, name: string): Promise<boolean>;
  copyLink(role: ShareRole, expiresInMs: number | null): Promise<void>;
  turnOffLink(): Promise<void>;
}

// the reverse a removal's message offers runs through the command every reverse in the message slot runs through
const UNDO = Object.freeze({ label: WORDS.undo, commandId: "settings.undo" });

const firstName = (name: string): string => name.split(" ")[0] ?? name;

function reverseMessage(text: string): Message {
  return {
    id: "share.removed",
    text,
    actions: [UNDO],
    lifetime: "reverse",
    ownWork: false,
  };
}

function briefMessage(id: string, text: string): Message {
  return { id, text, actions: [], lifetime: "brief", ownWork: false };
}

export function joinPath(token: string): string {
  return `/join/${token}`;
}

export function createShareActions(options: {
  docId: string;
  requests: ShareRequests;
  held: ShareHeld;
  messages: MessageQueue;
  reverses: Reverses;
  title: () => string;
  /** Says `sentence` on the row, or clears what the row says with null. */
  refuse(row: RowKey, sentence: string | null): void;
  /** Puts `text` on the clipboard; false when the browser refuses. */
  copy(text: string): Promise<boolean>;
  /** This app's origin, which a link's address starts with. */
  origin: string;
}): ShareActions {
  const { docId, requests, held, messages, reverses, refuse } = options;

  /** Keeps who has access from a change the server accepted; the row says `refused` otherwise. */
  const settle = (
    row: RowKey,
    answer: ShareAnswer<ShareAccess>,
    refused: () => string,
  ): boolean => {
    if (!answer.ok) {
      refuse(row, refused());
      return false;
    }
    refuse(row, null);
    held.access.set(answer.value);
    return true;
  };

  /** Says the removal with its reverse, which gives the access back through `restore`. */
  const sayRemoved = (
    text: string,
    restore: () => Promise<ShareAnswer<ShareAccess>>,
  ): void => {
    const message = reverseMessage(text);
    reverses.set(message.id, () => {
      void restore().then((answer) => {
        if (answer.ok) held.access.set(answer.value);
      });
    });
    messages.push(message);
  };

  const linkAddress = (token: string): string =>
    `${options.origin}${joinPath(token)}`;

  /** A link this tab made that gives `role` and was made with `expiresInMs`, while it still opens. */
  const madeLink = (
    role: ShareRole,
    expiresInMs: number | null,
  ): { link: ShareLink; token: string } | null => {
    const links = held.access.get()?.links ?? [];
    for (const link of links.toReversed()) {
      const made = held.made.get(link.id);
      const same =
        made !== undefined &&
        link.role === role &&
        made.expiresInMs === expiresInMs;
      if (same) return { link, token: made.token };
    }
    return null;
  };

  /** A new link, kept with who has access; null when the server refused it. */
  const newLink = async (
    role: ShareRole,
    expiresInMs: number | null,
  ): Promise<{ link: ShareLink; token: string } | null> => {
    const answer = await requests.createLink(docId, role, expiresInMs);
    if (!answer.ok) return null;
    const { link, token } = answer.value;
    held.made.set(link.id, { token, expiresInMs });
    const access = held.access.get();
    if (access !== null)
      held.access.set({ ...access, links: [...access.links, link] });
    return answer.value;
  };

  return {
    async changeRole(person, role) {
      settle(
        `person:${person.userId}`,
        await requests.grant(docId, person.userId, role),
        () => WORDS.roleRefused(firstName(person.name)),
      );
    },

    async removePerson(person) {
      const { role } = person;
      const removed = settle(
        `person:${person.userId}`,
        await requests.remove(docId, person.userId),
        () => WORDS.removeRefused(firstName(person.name)),
      );
      // the owner's role is never removed, so it is never given back
      if (!removed || role === "owner") return;
      sayRemoved(WORDS.removed(firstName(person.name), options.title()), () =>
        requests.grant(docId, person.userId, role),
      );
    },

    async removeGroup(group, name) {
      const removed = settle(
        `group:${group.groupId}`,
        await requests.removeGroup(docId, group.groupId),
        () => WORDS.removeRefused(name),
      );
      if (!removed) return;
      sayRemoved(WORDS.removedGroup(name, options.title()), () =>
        requests.grantGroup(docId, group.groupId),
      );
    },

    async addPerson(choice, role) {
      const answer = await requests.grant(docId, choice.userId, role);
      return settle("add", answer, () =>
        !answer.ok && answer.code === "not_member"
          ? WORDS.notMember(choice.name)
          : WORDS.addRefused(choice.name),
      );
    },

    async addGroup(groupId, name) {
      return settle("add", await requests.grantGroup(docId, groupId), () =>
        WORDS.addRefused(name),
      );
    },

    async copyLink(role, expiresInMs) {
      const made =
        madeLink(role, expiresInMs) ?? (await newLink(role, expiresInMs));
      if (made === null) {
        refuse("link", WORDS.linkRefused);
        return;
      }
      refuse("link", null);
      if (!(await options.copy(linkAddress(made.token)))) return;
      const { expiresAt } = made.link;
      messages.push(
        briefMessage(
          "share.copied",
          WORDS.copied(
            role,
            options.title(),
            expiresAt === null ? null : formatDate(expiresAt),
          ),
        ),
      );
    },

    async turnOffLink() {
      const links = held.access.get()?.links ?? [];
      let turnedOff = false;
      for (const link of links) {
        const answer = await requests.revokeLink(docId, link.id);
        if (!answer.ok) return;
        held.made.delete(link.id);
        held.access.set(answer.value);
        turnedOff = true;
      }
      if (turnedOff)
        messages.push(
          briefMessage("share.turned_off", WORDS.turnedOff(options.title())),
        );
    },
  };
}
