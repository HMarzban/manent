// The words of the Share dialog and of opening a share link.

import { formatCount } from "./format.ts";

type Role = "owner" | "edit" | "comment" | "view";
type ShareRole = Exclude<Role, "owner">;

/** What a role lets a person do to a document, as a sentence about a link or a join says it. */
const DOES: Readonly<Record<ShareRole, string>> = Object.freeze({
  edit: "edit",
  comment: "comment on",
  view: "read",
});

const people = (n: number): string =>
  n === 1 ? "1 person" : `${formatCount(n)} people`;

const ASK_SENDER = "Ask the sender for a new link.";

export const SHARING_WORDS = Object.freeze({
  close: "Close",
  sendDraft: "Send a draft to read…",
  sendDifference:
    "People here see the script as it changes; readers see one draft and nothing later.",
  signIn: "Sign in to share.",
  needsConnection: "Sharing needs a connection.",
  sendDraftNeedsConnection: "Send draft needs a connection.",
  roles: Object.freeze({
    owner: "Owner",
    edit: "Can edit",
    comment: "Can comment",
    view: "Can view",
  }) satisfies Readonly<Record<Role, string>>,
  /** The names of the groups every project starts with, by id. */
  presetGroups: Object.freeze({
    room: "Room",
    producers: "Producers",
    readers: "Readers",
    guests: "Guests",
  }) satisfies Readonly<Record<string, string>>,
  copyLink: "Copy link",
  copiedButton: "Copied",
  clipboardRefused: "Couldn't copy the link. Try again.",
  loadingAccess: "Opening…",
  unavailable: "Couldn't load who has access.",
  tryAgain: "Try again",
  peopleGroup: "People",
  groupsGroup: "Groups",
  everyoneAdded: "Everyone in this workspace already has access.",
  peopleListLabel: "People with access",
  linkActiveSummary: (role: string, expiry: string): string =>
    `${role} · ${expiry}`,
  /** `count` includes the owner, so it is at least 2 once anyone else can open the script. */
  summary: (count: number, link: boolean): string => {
    if (count > 1)
      return link
        ? `${formatCount(count)} people and anyone with the link can open this script`
        : `${formatCount(count)} people can open this script`;
    return link
      ? "You and anyone with the link can open this script"
      : "Only you can open this script";
  },
  /** `when` as `formatWhen` writes it: "14 min ago". */
  lastActive: (when: string): string => `Last active ${when}`,
  fromGroup: (group: string): string => `From the ${group} group`,
  remove: "Remove",
  removeName: (name: string): string => `Remove ${name}`,
  addPlaceholder: "Add a person or group",
  chooseRole: "Choose a role",
  add: "Add",
  needsRole: "needs a role",
  /** "Room · Can edit · 3 people" */
  groupRow: (group: string, role: string, count: number): string =>
    `${group} · ${role} · ${people(count)}`,
  link: "Link",
  anyoneWithTheLink: "Anyone with the link",
  expires: "Expires",
  /** In the order of the expiries a link may have: never, 1 day, 7 days, 30 days. */
  expiryChoices: Object.freeze(["Never", "1 day", "7 days", "30 days"]),
  /** `date` as `formatDate` writes it: "24 Nov". */
  expiresOn: (date: string): string => `Expires ${date}`,
  neverExpires: "Never expires",
  turnOffLink: "Turn off link",
  /** `until` is null for a link that never expires. */
  copied: (role: ShareRole, title: string, until: string | null): string =>
    `Copied a link: anyone who opens it can ${DOES[role]} '${title}'${until === null ? "" : ` until ${until}`}.`,
  turnedOff: (title: string): string =>
    `Turned off the link. It no longer opens '${title}'.`,
  ownerOnly: "Only the owner can change who has access.",
  roleRefused: (name: string): string =>
    `Couldn't change ${name}'s role. Try again.`,
  removeRefused: (name: string): string =>
    `Couldn't remove ${name}. Try again.`,
  addRefused: (name: string): string => `Couldn't add ${name}. Try again.`,
  notMember: (name: string): string =>
    `Couldn't add ${name}, who is not in this workspace.`,
  linkRefused: "Couldn't turn on the link. Try again.",
  removed: (name: string, title: string): string =>
    `Removed ${name} from '${title}'.`,
  removedGroup: (group: string, title: string): string =>
    `Removed the group ${group} from '${title}'.`,
  undo: "Undo",
  joined: (role: ShareRole, title: string): string =>
    `You can now ${DOES[role]} '${title}'.`,
  linkExpired: `This link has expired. ${ASK_SENDER}`,
  linkRevoked: `This link no longer works. ${ASK_SENDER}`,
});
