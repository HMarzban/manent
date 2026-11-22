// The port a seed step writes through: people on the server's real socket and routes, never its storage.
import type { CrdtDoc } from "@manent/crdt";
import type {
  Capability,
  DocKind,
  DocRole,
  ProductionState,
} from "@manent/sync-protocol";
import type { SeedPassage } from "../content/markup.ts";
import type { PageMeter } from "../generate/fit.ts";
import type { SeedDoc, SeedProject, SeedWorkspaceId } from "./catalogue.ts";

/** What a seed server can do; an action whose capability is missing is skipped and reported. */
export const SEED_CAPABILITIES = [
  "edit",
  "history",
  "restore",
  "device_versions",
  "settings",
  "production",
  "rebuild",
  "title_page",
] as const;

export type SeedCapability = (typeof SEED_CAPABILITIES)[number];

/** One person's socket on the real seam, after WELCOME. */
export interface HeadlessLink {
  readonly userId: string;
  subscribe(
    docId: string,
    clientId: number,
  ): Promise<{ role: DocRole; headSeq: number }>;
  /** Resolves with the server sequence on ACK; rejects with SeedDriverError "refused" on ERROR. */
  push(docId: string, update: Uint8Array): Promise<number>;
  set(docId: string, key: string, value: unknown): Promise<"ok" | "refused">;
  unsubscribe(docId: string): Promise<void>;
  close(): Promise<void>;
}

/** A person's replica of one document, subscribed for editing. */
export interface SeedSession {
  readonly doc: CrdtDoc;
  /** A local transaction, pushed; resolves on its ACK. */
  change(fn: (doc: CrdtDoc) => void): Promise<void>;
  set(key: string, value: unknown): Promise<"ok" | "refused">;
  /** Changes from here are held, as a device with no network holds them. */
  offline(): void;
  /** Uploads the document as it was before the held changes as a `pre_merge` device version, then pushes what was held. */
  online(): Promise<{ sent: number }>;
  /** Ends the edit subscription: the server records the person's automatic version. */
  close(): Promise<void>;
}

/** Over the production routes; every request key comes from the driver's seeded random. */
export interface SeedProduction {
  state(userId: string, docId: string): Promise<ProductionState>;
  /** Numbering "suffix", colour order "standard", locked on the seed's local day. */
  lock(userId: string, docId: string): Promise<void>;
  /** Issues the active set: what "changed", files ["pdf_marked"], no tint, no recipients. */
  issue(
    userId: string,
    docId: string,
    memo: string,
  ): Promise<{ colour: string }>;
  recall(
    userId: string,
    docId: string,
    pages: readonly string[],
    memo: string,
  ): Promise<void>;
  /** A revised-override entry; "cleared" is stored as "cleared@<contentHash>". */
  setOverride(
    session: SeedSession,
    setId: string,
    blockId: string,
    value: "marked" | "cleared",
  ): Promise<void>;
  /** The pages the active revision would issue now, in page order: those issue() sends. */
  revisedPages(docId: string): Promise<readonly string[]>;
}

export interface SeedDriver {
  readonly capabilities: ReadonlySet<SeedCapability>;
  /** The server's clock moves to `at`, back as well as forward, and its due timers run. */
  setTime(at: number): Promise<void>;
  /** POST /api/docs as the owner for the workspace's index in its home, then each role on that index. */
  workspace(
    ownerId: string,
    workspaceId: SeedWorkspaceId,
    roles: readonly {
      userId: string;
      role: DocRole;
      capabilities: readonly Capability[];
    }[],
  ): Promise<void>;
  /** POST /api/docs with the workspace's id: the script takes the index's roles, and each member's capabilities on it. */
  create(
    userId: string,
    doc: {
      docId: string;
      kind: DocKind;
      home: string;
      workspaceId: SeedWorkspaceId;
    },
  ): Promise<void>;
  /** The workspace index's `projects` and `documents` entries, pushed by that person. */
  index(
    userId: string,
    workspaceId: SeedWorkspaceId,
    entries: {
      projects: readonly SeedProject[];
      documents: readonly SeedDoc[];
      at: number;
    },
  ): Promise<void>;
  open(userId: string, docId: string): Promise<SeedSession>;
  /** POST /api/versions/name. */
  nameDraft(
    userId: string,
    docId: string,
    name: string,
  ): Promise<{ versionId: string }>;
  restore(
    userId: string,
    docId: string,
    versionId: string,
    scope: { kind: "scene"; headingId: string } | { kind: "script" },
  ): Promise<void>;
  versions(
    userId: string,
    docId: string,
  ): Promise<readonly { id: string; kind: string; name: string | null }[]>;
  /** Null while the production capability is off. */
  production: SeedProduction | null;
  requestRebuild(docId: string): Promise<void>;
  /** What the server's pages, numbers and marks disagree with in `passage`, written from `firstBlockId`; [] when all hold. */
  check(
    docId: string,
    passage: SeedPassage,
    firstBlockId: string,
  ): Promise<readonly string[]>;
  /** Counts pages as the server's engine does; a step fits its generated text with it. */
  readonly meter: PageMeter;
}

/** The server refused an action, cannot do it, or did not answer. */
export class SeedDriverError extends Error {
  readonly code: "refused" | "unavailable" | "timeout";
  readonly detail: string;

  constructor(code: SeedDriverError["code"], detail: string) {
    super(`${code}: ${detail}`);
    this.name = "SeedDriverError";
    this.code = code;
    this.detail = detail;
  }
}
