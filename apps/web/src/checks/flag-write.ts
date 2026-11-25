// Fetches people with Can comment or above (from server-held roles) and writes Check flags through 15:CD's writers.
import {
  flagThread,
  readCommentFlags,
  readCommentThreads,
  startThread,
} from "@manent/crdt";
import type { TextAnchor } from "@manent/schema";
import { projectHome } from "@manent/sync-protocol";
import type { DocRole } from "@manent/sync-protocol";
import { CHECKS_WORDS } from "@manent/ui";
import { liveEditor } from "../editor-host/live-editor.ts";
import type { PersonServices } from "../services/ports.ts";
import { readPerson, tabStorage } from "../session.ts";
import { createShareRequests } from "../sharing/share-requests.ts";
import { commentsActions } from "../state/comments.store.ts";

export interface FlaggablePerson {
  readonly userId: string;
  readonly name: string;
  readonly role: Exclude<DocRole, "view">;
}

function firstNameOf(fullName: string): string {
  return fullName.split(" ")[0] ?? fullName;
}

/**
 * People holding Can comment or above on `docId`, excluding the caller (`userId`), read from `/api/share/people`.
 * Returns null when the server cannot be reached or refuses the request.
 */
export async function fetchFlaggablePeople(
  docId: string,
  userId: string,
): Promise<readonly FlaggablePerson[] | null> {
  const person = readPerson(tabStorage());
  const token = person?.userId === userId ? person.token : null;
  if (token === null) return null;
  const requests = createShareRequests({ fetch, token: () => token });
  const answer = await requests.access(docId);
  if (!answer.ok) return null;
  return answer.value.people
    .filter(
      (entry): entry is typeof entry & { role: Exclude<DocRole, "view"> } =>
        entry.userId !== userId && entry.role !== "view",
    )
    .map((entry) => ({
      userId: entry.userId,
      name: entry.name,
      role: entry.role,
    }))
    .toSorted((a, b) => a.name.localeCompare(b.name));
}

/**
 * Flags a Check for `target` by writing one comment thread (authored by `services.userId`, anchored to `anchor` or the
 * whole script) and one `flags` entry through `@manent/crdt`'s writers. Refuses to write unless the caller holds edit
 * access and the comments handle is writable.
 */
export async function writeCheckFlag(options: {
  docId: string;
  services: PersonServices;
  checkKey: string;
  sentence: string;
  subject: string;
  anchor: TextAnchor | null;
  target: { readonly userId: string; readonly name: string };
  now: () => number;
  randomId: () => string;
}): Promise<boolean> {
  const {
    docId,
    services,
    checkKey,
    sentence,
    subject,
    anchor,
    target,
    now,
    randomId,
  } = options;
  const state = commentsActions.get(docId);
  const editor = liveEditor(docId);
  // Only people who can edit or own the script may write flags; viewers and commenters never open a writable handle.
  if (
    !state.canEdit ||
    state.access !== "edit" ||
    editor === null ||
    !editor.editable
  )
    return false;
  const projectId = services.library.documentProject(docId).get();
  const home = projectId === null ? null : projectHome(projectId);
  const handle = await services.openComments(docId, home);
  try {
    if (handle.readOnly.get() !== null) return false;
    const doc = handle.doc();
    const existingFlags = readCommentFlags(doc);
    const existingThreads = readCommentThreads(doc);
    const alreadyFlagged = Object.values(existingFlags).some((flag) => {
      if (flag.checkKey !== checkKey || flag.flaggedUserId !== target.userId)
        return false;
      const thread = existingThreads[flag.threadId];
      return thread === undefined || thread.state.kind !== "resolved";
    });
    if (alreadyFlagged) return false;

    const threadId = randomId();
    startThread(
      doc,
      {
        threadId,
        itemId: randomId(),
        anchor,
        roundId: null,
        authorUserId: services.userId,
        body: sentence,
        mentionedUserIds: [],
      },
      now,
    );
    flagThread(doc, {
      flagId: randomId(),
      threadId,
      flaggedUserId: target.userId,
      checkKey,
    });
    services.messages.push({
      id: `check_flagged_${checkKey}`,
      text: CHECKS_WORDS.flaggedMessage(subject, firstNameOf(target.name)),
      actions: [],
      lifetime: "brief",
      ownWork: false,
    });
    return true;
  } finally {
    void handle.close();
  }
}
