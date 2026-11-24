// What Project settings reads of its project: the index, opened while the screen is shown; one of its maps, followed;
// the project's title and kind from the Library; and what the server says the person may do there.
import type { CrdtDoc, ProjectIndexMap } from "@manent/crdt";
import { DOC_ROLES, indexDocId } from "@manent/sync-protocol";
import { createValue, useSubscribable } from "@manent/ui";
import { useEffect, useMemo, useState } from "react";
import type { ProjectIndex } from "../../project/project-index.ts";
import { useEnvironment, useServices } from "../../services/context.tsx";
import type { ProjectItem } from "../../services/ports.ts";
import { readPerson } from "../../session.ts";

/** `owner`: may change Format and style, People and Drafts. `editor`: may change Names and facts. */
export interface ProjectAccess {
  owner: boolean;
  editor: boolean;
}

export interface ProjectPerson {
  userId: string;
  name: string;
}

/** The project's index, closed when the screen goes. */
export function useProjectIndex(projectId: string): ProjectIndex {
  const { projectIndex } = useServices();
  const index = useMemo(
    () => projectIndex(projectId),
    [projectIndex, projectId],
  );
  // a closed index opens again when it is next read
  useEffect(() => () => void index.close(), [index]);
  return index;
}

/** `read` of the index's document, read again whenever the map `map` changes; null until it is first read. */
export function useIndexRead<T>(
  index: ProjectIndex,
  map: ProjectIndexMap,
  read: (doc: CrdtDoc) => T,
): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    let shown = true;
    let stop = (): void => {};
    const update = async (): Promise<void> => {
      const doc = (await index.handle()).doc();
      if (shown) setValue(read(doc));
    };
    void index.map(map).then(
      (view) => {
        if (!shown) return;
        stop = view.subscribe(() => void update());
        void update();
      },
      () => {
        // an index that cannot be opened leaves the map unread
      },
    );
    return () => {
      shown = false;
      stop();
    };
  }, [index, map, read]);
  return value;
}

/** The project `projectId` as the Library lists it, in whichever of the person's workspaces holds it; null until found. */
export function useProjectItem(projectId: string): ProjectItem | null {
  const { api, library, userId } = useServices();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  useEffect(() => {
    let shown = true;
    const stops: (() => void)[] = [];
    void api.me().then((me) => {
      if (!shown) return;
      // the person's own desk, as the Library falls back to it
      const workspaces = me.ok ? me.me.workspaces.map(({ id }) => id) : [];
      for (const id of [...workspaces, userId]) {
        const listed = library.projects(id);
        const look = (): void => {
          if (listed.get().some((project) => project.projectId === projectId))
            setWorkspaceId(id);
        };
        stops.push(listed.subscribe(look));
        look();
      }
    });
    return () => {
      shown = false;
      for (const stop of stops) stop();
    };
  }, [api, library, userId, projectId]);
  const projects = useMemo(
    () => (workspaceId === null ? null : library.projects(workspaceId)),
    [library, workspaceId],
  );
  return (
    useSubscribable(projects ?? NO_PROJECTS).find(
      (project) => project.projectId === projectId,
    ) ?? null
  );
}

/**
 * What the server says the person may do in the project, asked of its index; null while it has not said, or cannot
 * be reached. With it, everyone holding a role there, by full name.
 */
export function useProjectAccess(projectId: string): {
  access: ProjectAccess | null;
  people: readonly ProjectPerson[];
} {
  const { userId } = useServices();
  const { tabStorage } = useEnvironment();
  const [answer, setAnswer] = useState<{
    access: ProjectAccess | null;
    people: readonly ProjectPerson[];
  }>(NOT_ASKED);
  useEffect(() => {
    let shown = true;
    const person = readPerson(tabStorage);
    // asked as the person this screen draws
    const token = person?.userId === userId ? person.token : null;
    const docId = indexDocId("project", projectId);
    void Promise.all([
      ask("/api/docs/describe", docId, token),
      ask("/api/docs/people", docId, token),
    ]).then(([described, listed]) => {
      if (shown)
        setAnswer({ access: accessOf(described), people: peopleOf(listed) });
    });
    return () => {
      shown = false;
    };
  }, [tabStorage, userId, projectId]);
  return answer;
}

const NO_PROJECTS = createValue<readonly ProjectItem[]>(Object.freeze([]));
const NOT_ASKED = Object.freeze({ access: null, people: Object.freeze([]) });

/** The body of a 200 answer to a POST of `{ docId }`; null for any other answer, or none. */
async function ask(
  path: string,
  docId: string,
  token: string | null,
): Promise<unknown> {
  const answer = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify({ docId }),
  }).catch(() => null);
  if (answer === null || answer.status !== 200) return null;
  return answer.json().catch(() => null);
}

const field = (body: unknown, name: string): unknown =>
  typeof body === "object" && body !== null ? Reflect.get(body, name) : null;

/** The owner, and whoever may issue revisions, change what the owner does: as the server checks a write to the index. */
function accessOf(described: unknown): ProjectAccess | null {
  const role = field(described, "role");
  const capabilities = field(described, "capabilities");
  if (
    !DOC_ROLES.some((known) => known === role) ||
    !Array.isArray(capabilities)
  )
    return null;
  return {
    owner: role === "owner" || capabilities.includes("issue_revisions"),
    editor: role === "owner" || role === "edit",
  };
}

function peopleOf(listed: unknown): readonly ProjectPerson[] {
  const people = field(listed, "people");
  if (!Array.isArray(people)) return [];
  return people.flatMap((person: unknown) => {
    const userId = field(person, "userId");
    const name = field(person, "name");
    return typeof userId === "string" && typeof name === "string"
      ? [{ userId, name }]
      : [];
  });
}
