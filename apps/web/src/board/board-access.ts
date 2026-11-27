// Board project lookup, server access probing and cached role helpers.
import type { DocHandle } from "@manent/sync-client";
import { DOC_ROLES } from "@manent/sync-protocol";
import type { DocRole } from "@manent/sync-protocol";
import { createValue, useSubscribable } from "@manent/ui";
import { useEffect, useMemo, useState } from "react";
import { storageOfServices } from "../services/api-cache.ts";
import { useEnvironment, useServices } from "../services/context.tsx";
import type { ProjectItem } from "../services/ports.ts";
import { createDeviceMemory } from "../services/sync/device-memory.ts";
import { indexDocId } from "@manent/sync-protocol";

export type ServerAccess =
  "pending" | "edit" | "read_only" | "forbidden" | "not_found" | "offline";

export type ProjectLookup =
  | { readonly status: "loading" }
  | { readonly status: "not_series" }
  | { readonly status: "ready"; readonly project: ProjectItem };

export type CachedBoardRole = "edit" | "read_only";
type ServiceStorage = ReturnType<typeof storageOfServices>;

const NO_PROJECTS = createValue<readonly ProjectItem[]>(Object.freeze([]));

const field = (body: unknown, name: string): unknown =>
  typeof body === "object" && body !== null ? Reflect.get(body, name) : null;

const isDocRole = (value: unknown): value is DocRole =>
  DOC_ROLES.some((known) => known === value);

export function cachedBoardRole(
  storage: ServiceStorage,
  userId: string,
  projectId: string,
  write?: CachedBoardRole,
): CachedBoardRole | null {
  const key = `manent.board.role.${userId}.${projectId}`;
  try {
    if (write !== undefined) {
      storage?.setItem(key, write);
      return write;
    }
    const raw = storage?.getItem(key);
    return raw === "edit" || raw === "read_only" ? raw : null;
  } catch {
    return null;
  }
}

export async function askIndexAccess(
  docId: string,
  token: string | null,
): Promise<Exclude<ServerAccess, "pending">> {
  if (token === null) return "offline";
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  const answer = await fetch("/api/docs/describe", {
    method: "POST",
    headers,
    body: JSON.stringify({ docId }),
  }).catch(() => null);
  if (answer === null) return "offline";
  if (answer.status === 401 || answer.status === 403) return "forbidden";
  if (answer.status === 404) return "not_found";
  if (answer.status !== 200) return "read_only";
  const role = field(await answer.json().catch(() => null), "role");
  return isDocRole(role) && (role === "owner" || role === "edit")
    ? "edit"
    : "read_only";
}

async function waitWorkspaceSynced(
  openHandle: (docId: string) => Promise<DocHandle>,
  workspaceId: string,
  schedule: (fn: () => void, delayMs: number) => () => void,
): Promise<void> {
  const handle = await openHandle(indexDocId("workspace", workspaceId)).catch(
    () => null,
  );
  if (handle === null) return;
  const settled = (): boolean => {
    const { synced, side, link } = handle.status.get();
    return synced || side.length > 0 || link === "offline";
  };
  try {
    if (!settled())
      await new Promise<void>((resolve) => {
        const done = (): void => (stop(), cancel(), resolve());
        const stop = handle.status.subscribe(() => settled() && done());
        const cancel = schedule(done, 3_000);
      });
  } finally {
    await handle.close();
  }
}

export function useBoardProject(projectId: string): ProjectLookup {
  const services = useServices();
  const { api, library, openHandle, userId } = services;
  const { online, schedule } = useEnvironment();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let shown = true;
    const stops: (() => void)[] = [];
    const watched = new Set<string>();
    let found: string | null = null;
    setChecked(false);
    setWorkspaceId(null);
    const claimIfFound = (id: string, items: readonly ProjectItem[]): void => {
      if (shown && items.some((p) => p.projectId === projectId)) {
        found = id;
        setWorkspaceId(id);
      }
    };
    const watch = (id: string): void => {
      if (watched.has(id)) return;
      watched.add(id);
      const listed = library.projects(id);
      const look = (): void => claimIfFound(id, listed.get());
      stops.push(listed.subscribe(look));
      look();
    };
    const cached =
      createDeviceMemory({
        local: storageOfServices(services),
        session: null,
      }).workspaces(userId) ?? [];
    for (const id of new Set([...cached.map((w) => w.id), userId])) watch(id);
    void api
      .me()
      .then(async (me) => {
        if (!shown) return;
        const ids = [
          ...new Set([
            ...(me.ok ? me.me.workspaces.map(({ id }) => id) : []),
            userId,
          ]),
        ];
        for (const id of ids) watch(id);
        if (found === null)
          await Promise.all(
            ids.map((id) =>
              library
                .readProjects(id)
                .then((items) => claimIfFound(id, items))
                .catch(() => {}),
            ),
          );
        if (shown && found === null && online())
          await Promise.all(
            ids.map((id) => waitWorkspaceSynced(openHandle, id, schedule)),
          );
      })
      .catch(() => {})
      .finally(() => shown && setChecked(true));
    return () => {
      shown = false;
      for (const stop of stops) stop();
    };
  }, [services, api, library, openHandle, online, schedule, userId, projectId]);

  const projects = useMemo(
    () => (workspaceId === null ? NO_PROJECTS : library.projects(workspaceId)),
    [library, workspaceId],
  );
  const project = useSubscribable(projects).find(
    (item) => item.projectId === projectId,
  );
  if (project !== undefined)
    return project.kind === "series"
      ? { status: "ready", project }
      : { status: "not_series" };
  return checked ? { status: "not_series" } : { status: "loading" };
}
