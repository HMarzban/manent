// A desktop host the tests drive: what the page sent the shell, and the shell's messages emitted by hand.
import type { PageMessage, ShellMessage } from "@manent/sync-protocol";
import type { DesktopHost } from "../src/desktop/host.ts";

export const DATA_DIR = "/Users/sam/Library/Application Support/Manent";

export interface FakeHost extends DesktopHost {
  /** Every message the page sent, in order. */
  sent: PageMessage[];
  /** Passes `message` to every listener the page holds. */
  emit(message: ShellMessage): void;
}

export function fakeHost(overrides: Partial<DesktopHost> = {}): FakeHost {
  const sent: PageMessage[] = [];
  const listeners = new Set<(message: ShellMessage) => void>();
  return {
    platform: "mac",
    version: "0.1.0",
    channel: "stable",
    dataDir: DATA_DIR,
    send: (message) => sent.push(message),
    onMessage(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    firstPaint: (writes) =>
      sent.push({ v: 1, t: "first_paint", writes: [...writes] }),
    openInBrowser: () => sent.push({ v: 1, t: "open_in_browser" }),
    openFiles: () => sent.push({ v: 1, t: "open_files" }),
    setConnection: async () => {},
    storage: async () => null,
    ...overrides,
    sent,
    emit(message) {
      for (const listener of listeners) listener(message);
    },
  };
}
