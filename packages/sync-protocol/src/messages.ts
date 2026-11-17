// The messages that travel between a client and the server.

export type Sender = "client" | "server";

export interface VersionSet {
  protocol: number;
  schema: number;
  engine: number;
  table: number;
}

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

export type DocRole = "owner" | "edit" | "comment" | "view";

export type Capability =
  | "send_to_prompter"
  | "edit_rundowns"
  | "issue_revisions"
  | "lock_page_numbers"
  | "delete";

export type SubscribeMode = "edit" | "view" | "prompter";

export interface LockAnchor {
  level: number;
  order: number;
  label: string;
  blockId: string;
  offset: number;
  quote: string;
  fallbackIds: string[];
}

export type ControlKind =
  | "version_created"
  | "draft_named"
  | "revision_issued"
  | "revision_recalled"
  | "lock_anchors_changed"
  | "layout_changed"
  | "membership_changed"
  | "restored"
  | "sent_to_prompter"
  | "upstream_status";

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
    | { type: "SYNC"; step: "step1" | "step2" | "update"; data: Uint8Array }
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
