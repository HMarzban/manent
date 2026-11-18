// The Sync centre's words: what is saved where, what waits and what to review.

import { formatCount } from "./format.ts";

export const SYNC_CENTRE_WORDS = {
  title: "Sync centre",
  empty: "Everything is on the server.",
  /** Why a script that never synced is at risk: on desktop, and in a browser. */
  neverSynced: (desktop: boolean): string =>
    desktop
      ? "This script is only on this device, so it is not backed up and you cannot open it anywhere else. Sign in to sync it."
      : "This script is only in this browser, so it is not backed up and you cannot open it anywhere else. Sign in to sync it.",
  signIn: "Sign in to sync",
  serverOld:
    "The server runs an older Manent than this app. Your changes are saved here and sync once it runs a newer one.",
  unreachable:
    "Your changes are saved here and sync when Manent can be reached.",
  appOld:
    "This app is older than the server accepts. Your changes are saved here and sync once you update Manent.",
  toReview: (n: number): string => `${formatCount(n)} to review`,
  review: "Review",
  /** One row of the changes waiting: the scene's number and its count. */
  waitingInScene: (scene: string, n: number): string =>
    `Sc. ${scene} · ${formatCount(n)} waiting`,
  exportCopy: "Export a copy",
} as const;
