// The messages that travel between a client and the server.
import type { Identity } from "./http.ts";

// Each union is one list. A member travels as its index in the list: append, never reorder.
// Closed unions, where a new member needs a new protocol version: DocRole, SubscribeMode, SyncStep,
// LockSource and the tag of `lockAnchors`. Open unions, where an older build skips the frame or
// drops the member: ControlKind and Capability.
export const DOC_ROLES = ["owner", "edit", "comment", "view"] as const;
export const CAPABILITIES = [
  "send_to_prompter",
  "edit_rundowns",
  "issue_revisions",
  "lock_page_numbers",
  "delete",
] as const;
export const SUBSCRIBE_MODES = ["edit", "view", "prompter"] as const;
/** `upstream_refused` is how a local node passes on a refusal it received upstream. */
export const CONTROL_KINDS = [
  "version_created",
  "draft_named",
  "revision_issued",
  "revision_recalled",
  "lock_anchors_changed",
  "layout_changed",
  "membership_changed",
  "restored",
  "sent_to_prompter",
  "upstream_status",
  "upstream_refused",
  "copies_kept",
  "draft_sent",
  "draft_opened",
  "driver_changed",
  "handed_in",
  "trashed",
  "untrashed",
  "viewers_counted",
] as const;
export const SYNC_STEPS = ["step1", "step2", "update"] as const;
export const VERSION_FIELDS = [
  "protocol",
  "schema",
  "engine",
  "table",
] as const;
export const LOCK_SOURCES = ["lock", "issue", "import"] as const;

export type DocRole = (typeof DOC_ROLES)[number];
export type Capability = (typeof CAPABILITIES)[number];
export type SubscribeMode = (typeof SUBSCRIBE_MODES)[number];
export type ControlKind = (typeof CONTROL_KINDS)[number];
export type SyncStep = (typeof SYNC_STEPS)[number];
export type VersionField = (typeof VERSION_FIELDS)[number];
export type LockSource = (typeof LOCK_SOURCES)[number];

export type Sender = "client" | "server";

export type VersionSet = Record<VersionField, number>;

export interface ServerVersions {
  current: VersionSet;
  min: VersionSet;
}

export interface Limits {
  frameBytes: number;
  messageBytes: number;
}

/** `docId` is a canonical lower-case UUID. */
export interface DocRef {
  docId: string;
  generation: number;
}

/** One locked page start as it travels. The engine's own type is not this one. */
export interface LockAnchorRecord {
  level: number;
  order: number;
  label: string;
  blockId: string;
  offset: number;
  quote: string;
  fallbackIds: string[];
  source: LockSource;
}

export type ConnectionMessage =
  | { type: "HELLO"; versions: VersionSet; build: string; deviceId: string }
  | {
      type: "WELCOME";
      session: Identity;
      limits: Limits;
      server: ServerVersions;
    }
  | { type: "AUTH_EXPIRING"; expiresInMs: number }
  | { type: "AUTH_REFRESH"; ticket: string }
  | {
      type: "ERROR";
      /**
       * A `Code`, or a number a newer build added, kept as the number. STORAGE_FAILED (1011)
       * travels only as a document's ERROR, when the authority could not commit; the client
       * subscribes again after `retryAfterMs`. It never closes the connection.
       */
      code: number;
      /** English for logs; never shown to a person. */
      message: string;
      retryAfterMs: number | null;
      permanent: boolean;
      doc: DocRef | null;
      /** The entry this refuses; null when it answers no single entry. */
      clientSeq: number | null;
    }
  | { type: "PING"; nonce: number }
  | { type: "PONG"; nonce: number };

export type DocumentMessage = DocRef &
  (
    | {
        /** `generation` is the client's cached one, 0 when unknown. */
        type: "SUBSCRIBE";
        mode: SubscribeMode;
        clientIds: number[];
        lastServerSeq: number;
      }
    | {
        type: "SUBSCRIBED";
        role: DocRole;
        capabilities: Capability[];
        headSeq: number;
        minSchemaVersion: number;
        engineVersion: number;
        lockLevel: number;
        lockAnchors:
          { table: LockAnchorRecord[] } | { hash: Uint8Array } | null;
        revision: { setId: string; baselineVersionId: string } | null;
        /** Milliseconds since the epoch. */
        airWindow: { startsAt: number; endsAt: number } | null;
      }
    | {
        /** `generation` is the one that closed. */
        type: "GENERATION_MOVED";
        newGeneration: number;
      }
    | { type: "UNSUBSCRIBE" }
    | { type: "SYNC"; step: SyncStep; data: Uint8Array }
    | {
        type: "PUSH";
        /**
         * PUSH and SET of one document share one `clientSeq` sequence. A refusal that names a
         * `clientSeq` is final for that entry: it is never sent again, and nothing else is refused
         * with it.
         */
        clientSeq: number;
        update: Uint8Array;
        heal: boolean;
      }
    | {
        /**
         * A change to a script setting is a request, never a CRDT push: the authority writes the
         * setting itself and answers ACK, or ERROR with code 4423 and this `clientSeq`.
         */
        type: "SET";
        /** In the one sequence PUSH and SET of a document share. */
        clientSeq: number;
        key: string;
        /** UTF-8 JSON; its shape belongs to the settings registry. */
        value: Uint8Array;
      }
    | {
        type: "ACK";
        /** Cumulative over the entries that were not refused. */
        clientSeq: number;
        serverSeq: number;
      }
    | { type: "AWARENESS"; update: Uint8Array }
    | {
        type: "CONTROL";
        seq: number;
        kind: ControlKind;
        /** UTF-8 JSON; its shape belongs to whoever emits the event. */
        data: Uint8Array;
      }
    | {
        type: "VIEW_SNAPSHOT";
        viewSeq: number;
        /** UTF-8 JSON owned by the viewer path. */
        content: Uint8Array;
      }
    | {
        type: "VIEW_PATCH";
        viewSeq: number;
        /** UTF-8 JSON owned by the viewer path. */
        patch: Uint8Array;
      }
  );

export type Message = ConnectionMessage | DocumentMessage;
