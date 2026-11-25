// Types for the comments store, popover, panel tab and scene counts.
import type {
  CommentFlag,
  CommentItem,
  CommentRound,
  CommentThread,
} from "@manent/crdt";
import type { ScriptNote, TextAnchor } from "@manent/schema";
import type { StatusFacts } from "@manent/ui";
import type { CommentPerson } from "./people-request.ts";

export interface StoredNote {
  readonly id: string;
  readonly note: ScriptNote;
}

export type CommentsRole = "editor" | "commenter" | "viewer";

export interface SceneBlockInfo {
  readonly sceneBlockId: string;
  readonly sceneNumber: string | null;
  readonly heading: string;
  readonly pageLabel: string | null;
}

export interface ScriptCommentsState {
  readonly docId: string;
  readonly access: StatusFacts["access"];
  readonly role: CommentsRole;
  readonly canComment: boolean;
  readonly canEdit: boolean;
  readonly loading: boolean;
  readonly threads: Readonly<Record<string, CommentThread>>;
  readonly items: Readonly<Record<string, CommentItem>>;
  readonly rounds: Readonly<Record<string, CommentRound>>;
  readonly flags: Readonly<Record<string, CommentFlag>>;
  readonly notes: readonly StoredNote[];
  readonly people: readonly CommentPerson[];
  readonly peopleState: "idle" | "loaded" | "offline";
  readonly removedIds: ReadonlySet<string>;
  readonly blockScenes: ReadonlyMap<string, SceneBlockInfo>;
}

export interface CommentsUiState {
  readonly filter: string;
  readonly activeId: string | null;
}

export type PopoverMode =
  | {
      kind: "comment";
      anchor: TextAnchor | null;
      heading?: string;
      place: { left: number; top: number };
    }
  | {
      kind: "note";
      anchor: TextAnchor;
      place: { left: number; top: number };
    }
  | {
      kind: "thread";
      id: string;
      blockIds?: readonly string[];
      place: { left: number; top: number };
    };

export type PopoverTrigger =
  | { kind: "selection_comment" }
  | { kind: "scene_comment"; headingId: string | null }
  | { kind: "script_comment" }
  | { kind: "note_at_caret" }
  | { kind: "open_id"; id: string };
