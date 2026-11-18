// The page the sync tests drive: one person's sync client on the demo's own origin, over the
// browser's IndexedDB, Web Locks, BroadcastChannel and WebSocket, reached as `window.harness`.
import {
  browserPorts,
  browserRandom,
  forgetOnNewSeed,
  localDatabaseName,
} from "@manent/client-web";
import { scriptBody } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { ENGINE_VERSION, TABLE_VERSION } from "@manent/pagination";
import {
  SCHEMA_VERSION,
  blockText,
  blocksOf,
  randomBlockId,
} from "@manent/schema";
import { createSyncClient } from "@manent/sync-client";
import type { DocHandle, DocStatus, RecoveredItem } from "@manent/sync-client";
import { PROTOCOL_VERSION } from "@manent/sync-protocol";

/** Every member answers plain JSON. Those that read or write a document use the one opened or created last. */
interface Harness {
  open(docId: string): Promise<void>;
  /** The new document's ID. */
  create(request: { kind: string; home: string }): Promise<string>;
  /** Appends `text` to the last block, or writes it as a first action when there is none with an ID. */
  type(text: string): void;
  /** The script's blocks, one line each. */
  text(): string;
  status(): DocStatus;
  recovered(): RecoveredItem[];
  setOnline(wanted: boolean): void;
  retryNow(): void;
  storeSummary(): Promise<{ database: string; documents: number }>;
  leader(): boolean;
  close(): Promise<void>;
}

declare global {
  interface Window {
    harness: Harness;
  }
}

const VERSIONS = {
  protocol: PROTOCOL_VERSION,
  schema: SCHEMA_VERSION,
  engine: ENGINE_VERSION,
  table: TABLE_VERSION,
};

const SEED_KEY = "manent.demo.seed";

const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** A lone surrogate reaches every peer as U+FFFD, so it is written as one. */
function write(doc: CrdtDoc, text: string): void {
  const typed = text.replace(LONE_SURROGATE, "\uFFFD");
  const body = scriptBody(doc);
  const last = blocksOf(body.materialize()).at(-1);
  body.write((writer) =>
    last === undefined || last.attrs.id === null
      ? writer.insertBlocks(null, [
          {
            type: "block",
            attrs: { id: randomBlockId(), type: "action" },
            content: [{ type: "text", text: typed }],
          },
        ])
      : writer.insertText(last.attrs.id, blockText(last).length, typed),
  );
}

const search = new URLSearchParams(location.search);
const userId = search.get("user");
const token = search.get("token");
if (userId === null || token === null)
  throw new TypeError(
    "the harness is opened with ?user=<userId>&token=<session token>",
  );
const seedId = search.get("seed");
if (seedId !== null)
  await forgetOnNewSeed({
    indexedDb: globalThis.indexedDB,
    seedId,
    remembered: {
      read: () => localStorage.getItem(SEED_KEY),
      write: (id) => localStorage.setItem(SEED_KEY, id),
    },
  });
// a page without Web Locks leads by the lease, so taking them away is how the lease is chosen
if (search.get("lease") === "1")
  Reflect.deleteProperty(Navigator.prototype, "locks");
const ports = await browserPorts({
  baseUrl: location.origin,
  session: () => token,
  userId,
});
const client = createSyncClient({
  userId,
  deviceId: browserRandom.bytes(8).toHex(),
  build: "e2e",
  versions: VERSIONS,
  minServer: VERSIONS,
  ports,
});

// the browser's network state is what the person wants: an open socket can outlive going offline
client.setOnline(navigator.onLine);
addEventListener("offline", () => client.setOnline(false));
addEventListener("online", () => client.setOnline(true));

let handle: DocHandle | null = null;
const current = (): DocHandle => {
  if (handle === null) throw new Error("the harness has no document open");
  return handle;
};

window.harness = {
  async open(docId) {
    handle = await client.open(docId);
  },
  async create(request) {
    handle = await client.create(request);
    return handle.docId;
  },
  type: (text) => write(current().doc(), text),
  text: () =>
    blocksOf(scriptBody(current().doc()).materialize())
      .map(blockText)
      .join("\n"),
  status: () => current().status.get(),
  recovered: () => [...current().recovered.get()],
  setOnline: (wanted) => client.setOnline(wanted),
  retryNow: () => client.retryNow(),
  async storeSummary() {
    const documents = await ports.store.documents();
    return { database: localDatabaseName(userId), documents: documents.length };
  },
  leader: () => client.link.get().leader,
  close: () => client.close(),
};
