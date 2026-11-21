// The desktop app as the page reaches it: the shell's startup values, and the shell and node over the node's own routes.
import type { BootWrite } from "@manent/ui";
import { parseDesktopGlobal, parseShellMessage } from "@manent/sync-protocol";
import type { PageMessage, ShellMessage } from "@manent/sync-protocol";

export interface DesktopHost {
  platform: "mac" | "windows" | "linux";
  version: string;
  channel: "stable" | "canary";
  dataDir: string;
  /** POST /api/local/shell; a failure is ignored: the shell is in the node's process, or gone with it. */
  send(message: PageMessage): void;
  /** Every listener shares one EventSource on /api/local/shell/events, open while any listener is. */
  onMessage(listener: (message: ShellMessage) => void): () => void;
  firstPaint(writes: readonly BootWrite[]): void;
  openInBrowser(): void;
  openFiles(): void;
  /** POST /api/local/connection: the node's link to the cloud, which the demo's Connection acts on; rejects when the node does not answer. */
  setConnection(
    mode: "online" | "offline" | "slow",
    delayMs: number,
  ): Promise<void>;
  /** GET /api/local/storage; null when the node does not answer. */
  storage(): Promise<{ scripts: number; bytes: number } | null>;
}

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

/** The usage the node answered; null for anything else. */
async function readUsage(
  response: Response,
): Promise<{ scripts: number; bytes: number } | null> {
  if (!response.ok) return null;
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null) return null;
  if (!("scripts" in body && "bytes" in body)) return null;
  const { scripts, bytes } = body;
  return isCount(scripts) && isCount(bytes) ? { scripts, bytes } : null;
}

/** The shell's message carried by one event; null for anything else. */
function readEvent(data: unknown): ShellMessage | null {
  if (typeof data !== "string") return null;
  try {
    return parseShellMessage(JSON.parse(data));
  } catch {
    // not JSON: no message of this version is
    return null;
  }
}

/** The page's link to the desktop app; null on the web, where the shell has set no `global` (`window.manentDesktop`). */
export function readDesktopHost(
  global: unknown,
  origin: string,
): DesktopHost | null {
  const values = parseDesktopGlobal(global);
  if (values === null) return null;
  const post = (path: string, body: unknown): Promise<Response> =>
    fetch(`${origin}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const send = (message: PageMessage): void => {
    post("/api/local/shell", message).catch(() => {
      // the shell lives in the node's process: a node that does not answer has no shell to tell
    });
  };
  const listeners = new Set<(message: ShellMessage) => void>();
  let events: EventSource | null = null;
  return {
    platform: values.platform,
    version: values.version,
    channel: values.channel,
    dataDir: values.dataDir,
    send,
    onMessage(listener) {
      listeners.add(listener);
      if (events === null) {
        events = new EventSource(`${origin}/api/local/shell/events`);
        events.addEventListener("message", (event) => {
          const message = readEvent(event.data);
          if (message === null) return;
          for (const each of listeners) each(message);
        });
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0) return;
        events?.close();
        events = null;
      };
    },
    firstPaint: (writes) =>
      send({ v: 1, t: "first_paint", writes: [...writes] }),
    openInBrowser: () => send({ v: 1, t: "open_in_browser" }),
    openFiles: () => send({ v: 1, t: "open_files" }),
    async setConnection(mode, delayMs) {
      await post("/api/local/connection", { mode, delayMs });
    },
    async storage() {
      try {
        return await readUsage(await fetch(`${origin}/api/local/storage`));
      } catch {
        // a node that does not answer, or answers with no JSON, has no usage to show
        return null;
      }
    },
  };
}
