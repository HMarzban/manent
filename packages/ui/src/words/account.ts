// Words for Account and sign-out.
import { formatCount, joinNames } from "./format.ts";

export const ACCOUNT_WORDS = Object.freeze({
  signOut: "Sign out",
  signedIn: "Signed in",
  personMenuHint: (name: string): string => `${name} — Account and preferences`,
  signOutWaitingTitle: (n: number): string =>
    n === 1
      ? "Sign out with 1 change waiting?"
      : `Sign out with ${formatCount(n)} changes waiting?`,
  signOutWaitingBody: (n: number): string =>
    n === 1
      ? "It stays on this device and syncs when you sign in here again."
      : "They stay on this device and sync when you sign in here again.",
  exportCopy: "Export a copy",
  exportingFiles: (n: number): string =>
    n === 1 ? "Exporting 1 file…" : `Exporting ${formatCount(n)} files…`,
  exportedScripts: (titles: readonly string[]): string => {
    const quoted = titles.map((title) => `'${title}'`);
    return titles.length === 1
      ? `Exported ${quoted[0]}.`
      : `Exported ${formatCount(titles.length)} scripts: ${joinNames(quoted)}.`;
  },
  exportFailed: (title: string): string =>
    `Couldn't export '${title}'. Try again.`,
  waitingMore: (n: number): string => `+${formatCount(n)} more`,
});
