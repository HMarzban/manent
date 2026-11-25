// Send and Send previous execution over a rundown's prompter runtime state.
import type { SettingValue } from "@manent/settings";
import { PROMPTER_WORDS } from "@manent/ui";
import type { BesideOpen } from "../beside/open-beside.ts";
import type { RundownViewState } from "../rundown/rundown-view-store.ts";
import type { Environment, PersonServices } from "../services/ports.ts";
import { readPerson } from "../session.ts";
import {
  lookupVersionCreatedAt,
  postPrompterSend,
  prompterRefusalMessage,
  prompterSendMessage,
  prompterSendPreviousMessage,
} from "./prompter-http.ts";
import type { PrompterSendKind } from "./prompter-http.ts";
import {
  recordTrailEntry,
  resolvePreviousFirstSentAt,
  titleForRow,
} from "./prompter-model.ts";
import type { SendTrailEntry } from "./prompter-model.ts";

export interface PrompterSnapshot {
  readonly online: boolean;
  readonly canSend: boolean;
  readonly synced: boolean;
  readonly inFlightRows: ReadonlySet<string>;
  readonly waitingByDocId: ReadonlyMap<string, number>;
}

export interface PrompterRuntimeState {
  readonly key: string;
  readonly rundownId: string;
  readonly services: PersonServices;
  readonly env: Environment;
  readonly inFlight: Set<string>;
  readonly pendingKeys: Map<string, string>;
  readonly trails: Map<string, SendTrailEntry[]>;
  readonly knownSentRows: Set<string>;
  readonly waitingByDocId: Map<string, number>;
  disposed: boolean;
  online: boolean;
  canSend: boolean;
  synced: boolean;
  latestView: RundownViewState | null;
  latestBeside: BesideOpen | null;
  overrideRowId: string | null;
  lastSelectionSig: string;
  trackedStoryId: string | null;
  trackedStoryFormat: SettingValue<"script.format"> | null;
  stopTrackedStory: (() => void) | null;
  snapshot: PrompterSnapshot;
}

const PROMPTER_MESSAGE_ID = "prompter.status";

export function tokenOf(state: PrompterRuntimeState): string | null {
  const person = readPerson(state.env.tabStorage);
  return person?.userId === state.services.userId ? person.token : null;
}

function pushPrompterMessage(
  state: PrompterRuntimeState,
  message: Parameters<PersonServices["messages"]["push"]>[0],
): void {
  state.services.messages.withdraw(PROMPTER_MESSAGE_ID);
  state.services.messages.push(message);
}

async function readStoryWaiting(
  state: PrompterRuntimeState,
  storyDocId: string,
): Promise<number> {
  const known = state.waitingByDocId.get(storyDocId);
  if (known !== undefined) return known;
  try {
    const handle = await state.services.openHandle(storyDocId);
    try {
      return handle.status.get().waiting;
    } finally {
      await handle.close();
    }
  } catch {
    // handle unavailable: let the server decide
    return 0;
  }
}

async function checkBeforeSend(
  state: PrompterRuntimeState,
  kind: PrompterSendKind,
  rowId: string,
  title: string,
): Promise<boolean> {
  if (!state.online || !state.env.online()) {
    pushPrompterMessage(
      state,
      prompterRefusalMessage(PROMPTER_MESSAGE_ID, kind, "offline", title),
    );
    return false;
  }
  if (kind !== "send") return true;
  const row =
    state.latestView?.rundown?.rows.find(
      (candidate) => candidate.id === rowId,
    ) ?? null;
  if (row === null || row.kind !== "script" || row.docId === null) {
    pushPrompterMessage(
      state,
      prompterRefusalMessage(PROMPTER_MESSAGE_ID, "send", "cannot_send", title),
    );
    return false;
  }
  const waiting = await readStoryWaiting(state, row.docId);
  if (state.disposed) return false;
  if (waiting > 0) {
    pushPrompterMessage(state, {
      id: PROMPTER_MESSAGE_ID,
      text: PROMPTER_WORDS.waitingChanges(waiting),
      actions: [],
      lifetime: "brief",
      ownWork: false,
    });
    return false;
  }
  return true;
}

/** Runs a manual Send or Send previous request with idempotent key handling and message-slot reporting. */
export async function executePrompterSend(
  state: PrompterRuntimeState,
  kind: PrompterSendKind,
  rowId: string,
  hooks: { emit(): void; publish(): void },
): Promise<void> {
  if (state.disposed || state.inFlight.has(rowId)) return;
  const title = titleForRow(state.latestView, rowId);
  if (!(await checkBeforeSend(state, kind, rowId, title))) return;

  const keySlot = `${kind}:${rowId}`;
  const key =
    state.pendingKeys.get(keySlot) ?? state.env.randomId().replaceAll("-", "");
  state.pendingKeys.set(keySlot, key);
  state.inFlight.add(rowId);
  hooks.emit();

  const outcome = await postPrompterSend(
    kind,
    { docId: state.rundownId, rowId, key },
    tokenOf(state),
  );
  state.inFlight.delete(rowId);
  if (state.disposed) return;
  hooks.emit();

  if (!outcome.ok) {
    if (outcome.code !== "other" && outcome.code !== "offline") {
      state.pendingKeys.delete(keySlot);
    }
    if (outcome.code === "forbidden" && state.canSend) {
      state.canSend = false;
      hooks.emit();
      hooks.publish();
    }
    pushPrompterMessage(
      state,
      prompterRefusalMessage(PROMPTER_MESSAGE_ID, kind, outcome.code, title),
    );
    return;
  }

  state.pendingKeys.delete(keySlot);
  const { response } = outcome;
  state.knownSentRows.add(rowId);
  if (kind === "send") {
    recordTrailEntry(state.trails, rowId, {
      sentAt: response.sentAt,
      versionId: response.versionId,
    });
    hooks.publish();
    pushPrompterMessage(
      state,
      prompterSendMessage(PROMPTER_MESSAGE_ID, title, response.sentAt),
    );
    return;
  }

  let firstSentAt = resolvePreviousFirstSentAt(
    state.trails,
    rowId,
    response.versionId,
  );
  if (firstSentAt === null && response.versionId !== null) {
    firstSentAt = await lookupVersionCreatedAt(
      response.storyId,
      response.versionId,
      tokenOf(state),
    );
  }
  if (state.disposed) return;
  hooks.publish();
  pushPrompterMessage(
    state,
    prompterSendPreviousMessage(
      PROMPTER_MESSAGE_ID,
      title,
      response.sentAt,
      firstSentAt,
    ),
  );
}
