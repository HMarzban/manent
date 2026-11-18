// Temporary directories for tests, each removed by one call when the file is done.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export interface TempTrees {
  /** A fresh directory holding `files` (path → text; parents are created). `{}` gives an empty one. */
  tree(files: Readonly<Record<string, string>>): Promise<string>;
  removeAll(): Promise<void>;
}

/** Directories are `mkdtemp(join(tmpdir(), prefix))`. */
export function createTempTrees(prefix: string): TempTrees {
  const made: string[] = [];
  return {
    async tree(files) {
      const root = await mkdtemp(join(tmpdir(), prefix));
      made.push(root);
      for (const [path, text] of Object.entries(files)) {
        await mkdir(dirname(join(root, path)), { recursive: true });
        await writeFile(join(root, path), text);
      }
      return root;
    },
    async removeAll() {
      const dirs = made.splice(0);
      await Promise.all(
        dirs.map((dir) => rm(dir, { recursive: true, force: true })),
      );
    },
  };
}
