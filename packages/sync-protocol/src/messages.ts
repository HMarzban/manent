// The messages that travel between a client and the server.

// Each union is one list. A member travels as its index in the list: append, never reorder.
export const DOC_ROLES = ["owner", "edit", "comment", "view"] as const;
export const CAPABILITIES = [
  "send_to_prompter",
  "edit_rundowns",
  "issue_revisions",
  "lock_page_numbers",
  "delete",
] as const;
export const SUBSCRIBE_MODES = ["edit", "view", "prompter"] as const;
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
] as const;
export const SYNC_STEPS = ["step1", "step2", "update"] as const;
export const VERSION_FIELDS = [
  "protocol",
  "schema",
  "engine",
  "table",
] as const;

export type DocRole = (typeof DOC_ROLES)[number];
export type Capability = (typeof CAPABILITIES)[number];
export type SubscribeMode = (typeof SUBSCRIBE_MODES)[number];
export type ControlKind = (typeof CONTROL_KINDS)[number];
export type SyncStep = (typeof SYNC_STEPS)[number];
export type VersionField = (typeof VERSION_FIELDS)[number];

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

export interface LockAnchor {
  level: number;
  order: number;
  label: string;
  blockId: string;
  offset: number;
  quote: string;
  fallbackIds: string[];
}

export type ConnectionMessage =
  | { type: "HELLO"; versions: VersionSet; build: string; deviceId: string }
  | {
      type: "WELCOME";
      session: { userId: string; name: string };
      limits: Limits;
      server: ServerVersions;
    }
  | { type: "AUTH_EXPIRING"; secondsLeft: number }
  | { type: "AUTH_REFRESH"; ticket: string }
  | {
      type: "ERROR";
      /** A `Code`, or a number a newer build added, kept as the number. */
      code: number;
      message: string;
      retryAfterMs: number | null;
      permanent: boolean;
      doc: DocRef | null;
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
        minSchema: number;
        engineVersion: number;
        lockLevel: number;
        lockAnchors: { table: LockAnchor[] } | { hash: Uint8Array } | null;
        revision: { setId: string; baselineVersionId: string } | null;
        airWindow: { startsAt: number; endsAt: number } | null;
      }
    | {
        /** `generation` is the one that closed. */
        type: "GENERATION_MOVED";
        newGeneration: number;
      }
    | { type: "UNSUBSCRIBE" }
    | { type: "SYNC"; step: SyncStep; data: Uint8Array }
    | { type: "PUSH"; clientSeq: number; update: Uint8Array; heal: boolean }
    | { type: "ACK"; clientSeq: number; serverSeq: number }
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
