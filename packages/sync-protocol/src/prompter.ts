// What the prompter's feed carries, and what Send to prompter asks and answers.
import type { BlockJSON } from "./history-http.ts";

/** One row of a rundown in run order, header rows included; `title` is the row's Segment or Story cell. */
export interface PrompterRow {
  rowId: string;
  kind: "story" | "header";
  number: number | null;
  title: string;
  storyId: string | null;
  durationMs: number | null;
}

/** A story's prompter blocks as last sent. */
export interface PrompterStory {
  storyId: string;
  blocks: BlockJSON[];
}

/** The whole feed: every row in run order and every story sent. */
export interface PrompterFeed {
  v: 1;
  runOrder: PrompterRow[];
  stories: PrompterStory[];
}

/**
 * A change to the feed: the whole new run order or null, the stories replaced, and the ids of
 * stories that left. The heartbeat is `{ v: 1, runOrder: null, stories: [], removed: [] }`, every 1 s.
 */
export interface PrompterPatch {
  v: 1;
  runOrder: PrompterRow[] | null;
  stories: PrompterStory[];
  removed: string[];
}

/** The body of POST /api/prompter/send and /api/prompter/send-previous; `docId` is the rundown's. */
export interface PrompterSendRequest {
  docId: string;
  rowId: string;
  key: string;
}

/** The answer to both sends; a repeated key gets the stored answer. Also the data of CONTROL `sent_to_prompter`. */
export interface PrompterSendResponse {
  rowId: string;
  storyId: string;
  versionId: string | null;
  sentAt: number;
  senderUserId: string | null;
}
