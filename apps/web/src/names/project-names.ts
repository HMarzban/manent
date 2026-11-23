// The names of the project a document is in, as its page and the name commands read and write them.
import type { ProjectNameKind } from "@manent/revisions";
import type { PersonServices } from "../services/ports.ts";
import { readNames } from "./names-entries.ts";

/** The project that holds `docId`; null while the Library cannot tell a document's project, so it lists no names. */
function projectOf(_services: PersonServices, _docId: string): string | null {
  return null;
}

/** The names of one document's project; its index is opened while someone listens, and for each write. */
export interface DocumentNames {
  /** The listed spellings, in key order; empty until the index has been read. */
  spellings(): readonly string[];
  /** Calls back when the spellings change; returns unsubscribe. */
  subscribe(listener: () => void): () => void;
  /** Whether the document's project is known, so a name can be added. */
  readonly known: boolean;
  /** Adds `name` as `kind` under a new id; rejects when the index cannot be opened. */
  add(name: string, kind: ProjectNameKind): Promise<void>;
}

const NONE: readonly string[] = Object.freeze([]);

const noop = (): void => {};

export function documentNames(
  services: PersonServices,
  docId: string,
): DocumentNames {
  const projectId = projectOf(services, docId);
  let spellings = NONE;
  return {
    spellings: () => spellings,
    known: projectId !== null,
    subscribe(listener) {
      if (projectId === null) return noop;
      const index = services.projectIndex(projectId);
      let stop = noop;
      let stopped = false;
      index.map("names").then(
        (names) => {
          if (stopped) return;
          const read = (): void => {
            spellings = readNames(names).map((entry) => entry.name);
            listener();
          };
          stop = names.subscribe(read);
          read();
        },
        // the person's sync could not start: the page lists no names, as before it was read
        noop,
      );
      return () => {
        stopped = true;
        stop();
        void index.close();
      };
    },
    async add(name, kind) {
      if (projectId === null) return;
      const index = services.projectIndex(projectId);
      try {
        (await index.map("names")).set(crypto.randomUUID(), { kind, name });
      } finally {
        await index.close();
      }
    },
  };
}
