// What the service's stats count of the storage: the transactions it commits.
import type { DocFile, Home, Storage } from "@manent/storage";

/** The storage with every committed transaction counted; each file is wrapped once, so it keeps its identity. */
export function countingCommits(
  storage: Storage,
  onCommit: () => void,
): Storage {
  const files = new Map<string, DocFile>();
  const open = (home: Home): DocFile => {
    const key = `${home.kind}:${home.id}`;
    const inner = storage.open(home);
    const file = files.get(key) ?? {
      ...inner,
      transaction<T>(fn: () => T): T {
        const result = inner.transaction(fn);
        onCommit();
        return result;
      },
    };
    files.set(key, file);
    return file;
  };
  return { directory: storage.directory, open, close: () => storage.close() };
}
