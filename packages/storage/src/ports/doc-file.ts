// One project's or one user's documents, and the unit of work over them.
import type { ProductionStore } from "../production/ports.ts";
import type { Adoptions } from "./adoptions.ts";
import type { Checkpoints } from "./checkpoints.ts";
import type { DocLog } from "./doc-log.ts";
import type { Generations } from "./generations.ts";
import type { History } from "./history.ts";
import type { Measures } from "./measures.ts";
import type { PrivateCopyStore } from "./private-copy.ts";
import type { PrompterStore } from "./prompter.ts";
import type { Replays } from "./replays.ts";
import type { SharingStore } from "./sharing.ts";
import type { ProjectAssetsStore } from "./storage.ts";
import type { Versions } from "./versions.ts";

/** The file a document lives in, written `project:<uuid>` or `user:<userId>`. */
export type Home =
  { kind: "project"; id: string } | { kind: "user"; id: string };

/** One project's or one user's documents. */
export interface DocFile {
  readonly home: Home;
  readonly log: DocLog;
  readonly versions: Versions;
  readonly history: History;
  readonly checkpoints: Checkpoints;
  readonly generations: Generations;
  readonly replays: Replays;
  readonly measures: Measures;
  readonly adoptions: Adoptions;
  readonly production: ProductionStore;
  readonly sharing: SharingStore;
  readonly privateCopies: PrivateCopyStore;
  readonly prompter: PrompterStore;
  readonly assets: ProjectAssetsStore;
  /**
   * The unit of work: every write to `log`, `versions`, `history`, `generations`, `replays`, `adoptions`, `production`,
   * `sharing`, `privateCopies`, `prompter` and `assets` inside the synchronous
   * `fn` commits together or not at all. A failure throws
   * StorageError("commit_failed") having written nothing. A write outside one
   * commits by itself.
   */
  transaction<T>(fn: () => T): T;
}
