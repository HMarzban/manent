// Offline title-only search over the shown workspace's index entries, applying type: and folder: but not after:/before:.
import { SEARCH_RESULT_LIMIT } from "@manent/sync-protocol";
import type { SearchResult } from "@manent/sync-protocol";
import type { ProjectItem } from "../services/ports.ts";
import { folderAncestorIds } from "../services/sync/folders.ts";
import type { FolderEntry } from "../services/sync/folders.ts";
import type { DocumentEntry } from "../services/sync/index-entries.ts";
import { SEARCHABLE_DOC_KINDS, parseClientQuery } from "./search-query.ts";
import type { SearchableDocKind } from "./search-query.ts";

const COMBINING_MARKS = new RegExp("\\p{M}+", "gu");
const WHITESPACE_RUN = new RegExp("\\s+", "g");

const fold = (text: string): string =>
  text
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(WHITESPACE_RUN, " ")
    .trim();

const isSearchableKind = (kind: string): kind is SearchableDocKind =>
  (SEARCHABLE_DOC_KINDS as readonly string[]).includes(kind);

/** Resolves each requested folder name to the set of matching folder IDs plus all nested descendants; null if any name is unknown. */
function resolveMatchingFolderIds(
  requested: readonly string[],
  folders: readonly FolderEntry[],
): ReadonlySet<string> | null {
  if (requested.length === 0) return new Set();
  const ancestorsByFolder = new Map<string, ReadonlySet<string>>();
  for (const folder of folders) {
    ancestorsByFolder.set(
      folder.id,
      new Set([folder.id, ...folderAncestorIds(folders, folder.id)]),
    );
  }

  let allowed: Set<string> | null = null;
  for (const rawName of requested) {
    const target = fold(rawName);
    const roots = folders
      .filter((f) => fold(f.name) === target)
      .map((f) => f.id);
    if (roots.length === 0) return null;
    const expanded = new Set<string>();
    for (const folder of folders) {
      const chain = ancestorsByFolder.get(folder.id);
      if (chain !== undefined && roots.some((root) => chain.has(root)))
        expanded.add(folder.id);
    }
    if (allowed === null) {
      allowed = expanded;
    } else {
      const next = new Set<string>();
      for (const id of allowed) {
        if (expanded.has(id)) next.add(id);
      }
      allowed = next;
      if (allowed.size === 0) return null;
    }
  }
  return allowed;
}

/** Searches a workspace's local index entries by title, applying `type:` and `folder:` filters (skipping Trash and `after:`/`before:`). */
export function offlineSearchWorkspace(options: {
  readonly workspaceId: string | null;
  readonly query: string;
  readonly projects: readonly ProjectItem[];
  readonly documents: ReadonlyMap<string, DocumentEntry>;
  readonly folders: readonly FolderEntry[];
  readonly projectFolders: ReadonlyMap<string, string | null>;
}): readonly SearchResult[] {
  const parsed = parseClientQuery(options.query);
  if (parsed.unsatisfiable) return [];

  const folderIds = resolveMatchingFolderIds(
    parsed.folderNames,
    options.folders,
  );
  if (folderIds === null) return [];
  const filterByFolder = parsed.folderNames.length > 0;

  const projectsById = new Map(
    options.projects.map((project) => [project.projectId, project]),
  );
  const terms = [...parsed.words, ...parsed.phrases].map(fold).filter(Boolean);

  const hits: SearchResult[] = [];
  if (options.documents.size > 0) {
    for (const [docId, entry] of options.documents) {
      if (entry.trashedAt !== null) continue;
      if (!isSearchableKind(entry.kind)) continue;
      const project = projectsById.get(entry.projectId) ?? null;
      if (parsed.kinds.length > 0 && !parsed.kinds.includes(entry.kind))
        continue;
      if (
        parsed.projectKinds.length > 0 &&
        (project === null || !parsed.projectKinds.includes(project.kind))
      )
        continue;
      if (filterByFolder) {
        const folderId = options.projectFolders.get(entry.projectId) ?? null;
        if (folderId === null || !folderIds.has(folderId)) continue;
      }
      const haystack = fold(
        project === null ? entry.title : `${entry.title} ${project.title}`,
      );
      if (!terms.every((term) => haystack.includes(term))) continue;
      hits.push({
        docId,
        workspaceId: options.workspaceId,
        title: entry.title,
        projectTitle: project?.title ?? null,
        kind: entry.kind,
        changedAt: entry.editedAt ?? entry.createdAt,
        excerpt: null,
      });
    }
  } else {
    // Fallback when workspace index documents map has not populated yet (e.g. mocked LibraryIndex in tests).
    for (const project of options.projects) {
      if (project.firstDocId === null) continue;
      if (parsed.kinds.length > 0 && !parsed.kinds.includes("script")) continue;
      if (
        parsed.projectKinds.length > 0 &&
        !parsed.projectKinds.includes(project.kind)
      )
        continue;
      if (filterByFolder) {
        const folderId = options.projectFolders.get(project.projectId) ?? null;
        if (folderId === null || !folderIds.has(folderId)) continue;
      }
      const haystack = fold(project.title);
      if (!terms.every((term) => haystack.includes(term))) continue;
      hits.push({
        docId: project.firstDocId,
        workspaceId: options.workspaceId,
        title: project.title,
        projectTitle: project.title,
        kind: "script",
        changedAt: "at" in project.lastEdited ? project.lastEdited.at : 0,
        excerpt: null,
      });
    }
  }

  return hits
    .toSorted(
      (a, b) => b.changedAt - a.changedAt || a.docId.localeCompare(b.docId),
    )
    .slice(0, SEARCH_RESULT_LIMIT);
}
