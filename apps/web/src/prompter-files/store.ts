// The desktop prompter-files state: active run status, dialog state, local-node HTTP calls, and shell broadcasts.
import { parseShellMessage } from "@manent/sync-protocol";
import type { PrompterFilesStatus } from "@manent/sync-protocol";
import { PROMPTER_FILES_WORDS } from "@manent/ui";
import type { MessageQueue } from "@manent/ui";
import { useSyncExternalStore } from "react";
import type { DesktopHost } from "../desktop/host.ts";

export type PrompterFilesEncoding = PrompterFilesStatus["encoding"];

export type StartPrompterFilesResult =
  { readonly ok: true } | { readonly ok: false; readonly refusal: string };

export interface PrompterFilesBinding {
  readonly host: DesktopHost;
  getToken(): string | null;
  readonly messages: MessageQueue;
  isRundown?(docId: string): boolean;
  readonly fetch?: typeof fetch;
}

interface Snapshot {
  readonly status: PrompterFilesStatus | null;
  readonly dialogRundownId: string | null;
}

const STOPPED_MESSAGE_ID = "prompter_files.stopped";
const REPLACED_MESSAGE_ID = "prompter_files.replaced";
const UNWRITABLE_MESSAGE_ID = "prompter_files.unwritable";
const ROUTE = "/api/local/prompter-files";

let status: PrompterFilesStatus | null = null;
let dialogRundownId: string | null = null;
let lastPath: string | null = null;
let activeRunKey: string | null = null;
let lastReplaced = 0;
let unwritableRundownId: string | null = null;
let binding: PrompterFilesBinding | null = null;
let snapshot: Snapshot = Object.freeze({ status: null, dialogRundownId: null });
const listeners = new Set<() => void>();

const runKeyOf = (next: PrompterFilesStatus): string =>
  `${next.rundownId}\0${next.path}\0${next.encoding}`;

function notify(): void {
  snapshot = Object.freeze({ status, dialogRundownId });
  for (const listener of listeners) listener();
}

function authHeaders(
  token: string | null,
  json = false,
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (json) headers["Content-Type"] = "application/json";
  if (token !== null && token !== "") headers.Authorization = `Bearer ${token}`;
  return headers;
}

function parseStatusBody(value: unknown): PrompterFilesStatus | null {
  const parsed = parseShellMessage({
    v: 1,
    t: "prompter_files",
    status: value,
  });
  return parsed?.t === "prompter_files" ? parsed.status : null;
}

function readErrorCode(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("error" in body))
    return null;
  return typeof body.error === "string" ? body.error : null;
}

function refusalFor(code: string | null): string {
  if (code === "busy") return PROMPTER_FILES_WORDS.refusedBusy;
  if (code === "unreachable") return PROMPTER_FILES_WORDS.refusedUnreachable;
  return PROMPTER_FILES_WORDS.refusedOther;
}

function applyStatus(
  next: PrompterFilesStatus | null,
  options: { readonly notifyMessages: boolean },
): void {
  if (next === null) {
    status = null;
    activeRunKey = null;
    lastReplaced = 0;
    notify();
    return;
  }
  if (next.failure === "unwritable") {
    unwritableRundownId = next.rundownId;
    lastPath = next.path;
    status = null;
    activeRunKey = null;
    lastReplaced = 0;
    if (options.notifyMessages && binding !== null) {
      binding.messages.withdraw(REPLACED_MESSAGE_ID);
      binding.messages.withdraw(UNWRITABLE_MESSAGE_ID);
      binding.messages.push({
        id: UNWRITABLE_MESSAGE_ID,
        text: PROMPTER_FILES_WORDS.unwritableMessage(next.path),
        actions: [
          {
            label: PROMPTER_FILES_WORDS.command,
            commandId: "prompter.reopenFiles",
          },
        ],
        lifetime: "until_dismissed",
        ownWork: false,
      });
    }
    notify();
    return;
  }
  const key = runKeyOf(next);
  if (key !== activeRunKey) {
    activeRunKey = key;
    lastReplaced = options.notifyMessages ? 0 : next.replaced;
  }
  status = next;
  lastPath = next.path;
  if (unwritableRundownId !== null && binding !== null) {
    binding.messages.withdraw(UNWRITABLE_MESSAGE_ID);
  }
  unwritableRundownId = null;
  if (
    options.notifyMessages &&
    binding !== null &&
    next.replaced > lastReplaced
  ) {
    lastReplaced = next.replaced;
    binding.messages.withdraw(REPLACED_MESSAGE_ID);
    binding.messages.push({
      id: REPLACED_MESSAGE_ID,
      text: PROMPTER_FILES_WORDS.replacedMessage(next.replaced),
      actions: [],
      lifetime: "brief",
      ownWork: false,
    });
  }
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = (): Snapshot => snapshot;

export function usePrompterFilesState(): Snapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function callFetch(
  custom: typeof fetch | undefined,
  input: string,
  init?: RequestInit,
): Promise<Response> {
  return custom === undefined
    ? globalThis.fetch(input, init)
    : custom(input, init);
}

/** Connects the store to the active desktop host, hydrates current status, and subscribes to shell broadcasts. */
export function connectPrompterFiles(next: PrompterFilesBinding): () => void {
  binding = next;
  let live = true;
  const token = next.getToken();
  if (token !== null) {
    void callFetch(next.fetch, ROUTE, { headers: authHeaders(token) })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!live) return;
        applyStatus(parseStatusBody(body), { notifyMessages: false });
      })
      .catch(() => {
        // node unreachable during hydration: live shell broadcasts will update when it answers
      });
  }
  const stopHost = next.host.onMessage((message) => {
    if (!live || message.t !== "prompter_files") return;
    applyStatus(message.status, { notifyMessages: true });
  });
  return () => {
    live = false;
    stopHost();
    if (binding === next) binding = null;
  };
}

/** Starts writing prompter files for `rundownId` into `folder` using `encoding`. */
export async function startPrompterFiles(options: {
  readonly rundownId: string;
  readonly folder: string;
  readonly encoding: PrompterFilesEncoding;
}): Promise<StartPrompterFilesResult> {
  if (binding === null) {
    return { ok: false, refusal: PROMPTER_FILES_WORDS.refusedOther };
  }
  const folder = options.folder.trim();
  let response: Response;
  try {
    response = await callFetch(binding.fetch, ROUTE, {
      method: "POST",
      headers: authHeaders(binding.getToken(), true),
      body: JSON.stringify({
        rundownId: options.rundownId,
        folder,
        encoding: options.encoding,
      }),
    });
  } catch {
    return { ok: false, refusal: PROMPTER_FILES_WORDS.refusedOther };
  }
  if (response.ok) {
    const next: PrompterFilesStatus = {
      rundownId: options.rundownId,
      path: folder,
      encoding: options.encoding,
      replaced: 0,
      failure: null,
    };
    status = next;
    lastPath = folder;
    activeRunKey = runKeyOf(next);
    lastReplaced = 0;
    unwritableRundownId = null;
    dialogRundownId = null;
    binding.messages.withdraw(UNWRITABLE_MESSAGE_ID);
    notify();
    return { ok: true };
  }
  const body: unknown = await response.json().catch(() => null);
  return { ok: false, refusal: refusalFor(readErrorCode(body)) };
}

/** Resets all store state (for isolated tests). */
export function resetPrompterFilesStore(): void {
  status = null;
  dialogRundownId = null;
  lastPath = null;
  activeRunKey = null;
  lastReplaced = 0;
  unwritableRundownId = null;
  binding = null;
  notify();
}

export const prompterFilesStore: {
  open(rundownId: string): void;
  reopen(fallbackDocId?: string | null): void;
  close(): void;
  stop(): void;
} = Object.freeze({
  open(rundownId: string) {
    const target =
      unwritableRundownId !== null && binding?.isRundown?.(rundownId) === false
        ? unwritableRundownId
        : rundownId;
    dialogRundownId = target;
    notify();
  },
  reopen(fallbackDocId: string | null = null) {
    const target =
      unwritableRundownId ??
      (fallbackDocId !== null && binding?.isRundown?.(fallbackDocId) !== false
        ? fallbackDocId
        : null);
    if (target === null) return;
    dialogRundownId = target;
    notify();
  },
  close() {
    if (dialogRundownId === null) return;
    dialogRundownId = null;
    notify();
  },
  stop() {
    const stoppedPath = status?.path ?? lastPath;
    status = null;
    lastPath = null;
    activeRunKey = null;
    lastReplaced = 0;
    notify();
    if (binding !== null) {
      void callFetch(binding.fetch, ROUTE, {
        method: "DELETE",
        headers: authHeaders(binding.getToken()),
      }).catch(() => {
        // best effort when the local node is closing
      });
      if (stoppedPath !== null) {
        binding.messages.withdraw(REPLACED_MESSAGE_ID);
        binding.messages.withdraw(STOPPED_MESSAGE_ID);
        binding.messages.push({
          id: STOPPED_MESSAGE_ID,
          text: PROMPTER_FILES_WORDS.stoppedMessage(stoppedPath),
          actions: [],
          lifetime: "brief",
          ownWork: false,
        });
      }
    }
  },
});
