// Each document's title and kinds, and its Continue entry, read from whichever opened index holds it.
import type { DocKind } from "@manent/sync-protocol";
import { createValue } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import type { ProjectKind } from "../ports.ts";
import { cached } from "./cached.ts";
import type { Found } from "./index-shelves.ts";
import type { PrivateIndex } from "./private-index.ts";

type Value<T> = Subscribable<T> & { set(value: T): void };

export interface DocumentValues {
  title(docId: string): Value<string | null>;
  kind(docId: string): Value<ProjectKind | null>;
  docKind(docId: string): Value<DocKind | null>;
  project(docId: string): Value<string | null>;
  /** Writes Continue for `docId` once an index holds it; the returned function stops waiting. */
  continueOnce(docId: string): () => void;
  /** True once any document has been asked about. */
  asked(): boolean;
  /** Sets each value from the indexes, and writes the Continue entries an index now holds. */
  draw(): void;
}

/** Each document's title, its project's kind and its own, and its Continue entry, from whichever opened index holds it; `wanted` opens them. */
export function createDocumentValues(options: {
  find: (docId: string) => Found | null;
  privateIndex: PrivateIndex;
  now: () => number;
  wanted: () => void;
}): DocumentValues {
  const { find } = options;
  const titles = new Map<string, Value<string | null>>();
  const kinds = new Map<string, Value<ProjectKind | null>>();
  const docKinds = new Map<string, Value<DocKind | null>>();
  const projects = new Map<string, Value<string | null>>();
  // the documents opened here whose Continue entry waits for an index that holds them
  const continuing = new Set<string>();
  const valueOf = <T>(
    values: Map<string, Value<T | null>>,
    docId: string,
  ): Value<T | null> => {
    const known = values.has(docId);
    const value = cached(values, docId, () => createValue<T | null>(null));
    if (!known) options.wanted();
    return value;
  };
  return {
    title: (docId) => valueOf(titles, docId),
    kind: (docId) => valueOf(kinds, docId),
    docKind: (docId) => valueOf(docKinds, docId),
    project: (docId) => valueOf(projects, docId),
    continueOnce(docId) {
      continuing.add(docId);
      options.wanted();
      return () => {
        continuing.delete(docId);
      };
    },
    asked: () =>
      titles.size +
        kinds.size +
        docKinds.size +
        projects.size +
        continuing.size >
      0,
    draw() {
      for (const docId of continuing) {
        const workspaceId = find(docId)?.workspaceId;
        if (workspaceId === undefined) continue;
        continuing.delete(docId);
        const openedAt = options.now();
        options.privateIndex.continueMap.set(docId, { workspaceId, openedAt });
      }
      for (const [docId, title] of titles)
        title.set(find(docId)?.entry.title ?? null);
      for (const [docId, kind] of kinds) kind.set(find(docId)?.kind ?? null);
      for (const [docId, kind] of docKinds)
        kind.set(find(docId)?.entry.kind ?? null);
      for (const [docId, projectId] of projects)
        projectId.set(find(docId)?.entry.projectId ?? null);
    },
  };
}
