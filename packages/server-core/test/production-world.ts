// A thirty-page script on a sync service over memory storage, with the history and production services
// in its hooks: Priya coordinates it, Dana may issue, Sam edits and Leo views.
import { loadDoc, scriptBody, scriptDocFromJSON } from "@manent/crdt";
import type { BlockWriter, CrdtDoc } from "@manent/crdt";
import { blocksOf, sectionize } from "@manent/schema";
import type { BlockJSON, DocJSON, FlatBlock } from "@manent/schema";
import type { DocFile, VersionRow } from "@manent/storage";
import { createMemoryStorage } from "@manent/storage/testing";
import type { MemoryStorage } from "@manent/storage/testing";
import type {
  LockRequest,
  Message,
  ProductionState,
  VersionContent,
  VersionSet,
} from "@manent/sync-protocol";
import {
  PRODUCT_SETTING_RULES,
  contentAt,
  createHistoryService,
  createProductionService,
  createSyncService,
} from "../src/index.ts";
import type {
  ProductionOutcome,
  ProductionService,
  RenderPdf,
  SyncService,
} from "../src/index.ts";
import { fakeClock, fakePeer } from "../src/testing/index.ts";
import type { FakeClock, FakePeer } from "../src/testing/index.ts";
import { DOC, HOME, PROJECT, appendAll } from "./seed.ts";
import { EMPTY_VECTOR, subscribe } from "./service-world.ts";

export const T0 = 1_811_808_000_000;
const LOCKED_ON = "2026-10-27";
const V1: VersionSet = { protocol: 1, schema: 1, engine: 1, table: 0 };
const OPEN_LIMITS = {
  framesPerSecond: 1e9,
  frameBurst: 1e9,
  bytesPerSecond: 1e12,
  byteBurst: 1e12,
};
/** Three scenes a page, each a heading and eight one-line actions: every page opens on a heading. */
const SCENES = 90;
const ACTIONS = 8;
const NAMES: Readonly<Record<string, string>> = {
  priya: "Priya Nair",
  dana: "Dana Reyes",
  sam: "Sam Okafor",
  leo: "Leo Marsh",
};
const WORD = "spray ";

export const headingId = (scene: number): string => `heading-${scene}`;
export const actionId = (scene: number, line: number): string =>
  `action-${scene}-${line}`;
export const key = (n: number): string => n.toString(16).padStart(32, "0");
export const KEY1 = key(1);

const textBlock = (id: string, type: string, text: string): BlockJSON => ({
  type: "block",
  attrs: { id, type },
  content: [{ type: "text", text }],
});

function scriptBlocks(): BlockJSON[] {
  return Array.from({ length: SCENES }, (_, i) => i + 1).flatMap((scene) => [
    textBlock(
      headingId(scene),
      "scene_heading",
      `INT. FERRY DECK ${scene} - NIGHT`,
    ),
    ...Array.from({ length: ACTIONS }, (__, j) =>
      textBlock(
        actionId(scene, j + 1),
        "action",
        `Gulls wheel over the wake, scene ${scene} line ${j + 1}.`,
      ),
    ),
  ]);
}

/** The last block of page `page` as the script was seeded. */
export const lastBlockOf = (page: number): string =>
  actionId(3 * page, ACTIONS);

/** One person's device: a replica taken from the server when they join, and the edits they push. */
export interface Person {
  readonly peer: FakePeer;
  /** Writes on the replica and pushes the update; it commits on the next `run`. */
  push(edit: (writer: BlockWriter) => void): void;
  /** Asks the server to set a script setting. */
  set(key: string, value: unknown): void;
  /** What the server sent since the last call, the updates applied to the replica. */
  take(): Message[];
  text(blockId: string): string;
}

export interface ProductionWorld {
  readonly clock: FakeClock;
  readonly storage: MemoryStorage;
  readonly file: DocFile;
  readonly service: ProductionService;
  readonly sync: SyncService;
  readonly sam: Person;
  readonly leo: Person;
  /** Lets every queued commit run, and every promise waiting on one settle. */
  run<T>(answer: Promise<T>): Promise<T>;
  lock(key?: string): Promise<ProductionState>;
  /** Sam appends `words` words to the last block of the page as seeded, committed. */
  editPage(page: number, words: number): Promise<void>;
  blocks(): FlatBlock[];
  settings(): Record<string, unknown>;
  versions(): VersionRow[];
  /** The kinds of CONTROL Leo was sent since the last call. */
  controlKinds(): string[];
}

export function valueOf<T>(outcome: ProductionOutcome<T>): T {
  if (!outcome.ok)
    throw new RangeError(`refused: ${JSON.stringify(outcome.body)}`);
  return outcome.value;
}

export const lockRequest = (requestKey: string): LockRequest => ({
  docId: DOC,
  key: requestKey,
  numbering: "suffix",
  colourOrder: "standard",
  lockedOn: LOCKED_ON,
});

const fakeRenderPdf: RenderPdf = (input) =>
  Promise.resolve(
    new TextEncoder().encode(
      JSON.stringify({
        pages: input.pages,
        engineVersion: input.engine.version,
        paper: input.profile.paper,
        anchors: input.anchors.length,
        marked: input.marked,
        tint: input.tint,
      }),
    ),
  );

export function productionWorld(): ProductionWorld {
  const clock = fakeClock(T0);
  const storage = createMemoryStorage({ now: () => clock.clock.now() });
  let made = 0;
  const ids = (): string => `id-${String(++made).padStart(5, "0")}`;
  let built: SyncService | null = null;
  const sync = (): SyncService => {
    if (built === null) throw new RangeError("no sync service yet");
    return built;
  };
  const history = createHistoryService({
    sync,
    storage,
    clock: clock.clock,
    ids,
  });
  const service = createProductionService({
    storage,
    sync,
    history,
    now: clock.clock.now,
    ids,
    names: (userId) => NAMES[userId] ?? userId,
    renderPdf: fakeRenderPdf,
    rules: PRODUCT_SETTING_RULES,
  });
  built = createSyncService({
    storage,
    clock: clock.clock,
    defer: clock.defer,
    ids,
    versions: { current: V1, min: V1 },
    limits: OPEN_LIMITS,
    registry: PRODUCT_SETTING_RULES,
    hooks: [history, service.hooks],
  });
  const { access } = sync();
  access.create("priya", {
    docId: DOC,
    kind: "script",
    home: `project:${PROJECT}`,
  });
  storage.directory.setRole(DOC, "dana", "edit", ["issue_revisions"]);
  storage.directory.setRole(DOC, "sam", "edit", []);
  storage.directory.setRole(DOC, "leo", "view", []);
  const script: DocJSON = {
    type: "doc",
    content: [{ type: "section", content: scriptBlocks() }],
  };
  const seed = scriptDocFromJSON(script, { clientId: 9001 });
  appendAll(storage, [seed.encodeState()], { userId: "priya" });
  const file = storage.open(HOME);

  const run = async <T>(answer: Promise<T>): Promise<T> => {
    for (let i = 0; i < 50; i++) {
      clock.runDeferred();
      await Promise.resolve();
    }
    return answer;
  };

  const person = (
    userId: string,
    clientId: number,
    mode: "edit" | "view",
  ): Person => {
    const peer = fakePeer({ userId, name: NAMES[userId], versions: V1 });
    sync().attach(peer);
    sync().receive(
      peer,
      subscribe(DOC, mode, mode === "edit" ? [clientId] : []),
    );
    sync().receive(peer, {
      type: "SYNC",
      docId: DOC,
      generation: 1,
      step: "step1",
      data: EMPTY_VECTOR,
    });
    let doc: CrdtDoc | null = null;
    const inbox: Message[] = [];
    const pull = (): void => {
      for (const message of peer.take()) {
        if (message.type === "SYNC" && message.step === "step2")
          doc = loadDoc(message.data, { clientId });
        else if (message.type === "SYNC" && message.step === "update")
          doc?.applyUpdate(message.data);
        inbox.push(message);
      }
    };
    pull();
    let clientSeq = 0;
    const replica = (): CrdtDoc => {
      pull();
      if (doc === null) throw new RangeError(`${userId} holds no replica`);
      return doc;
    };
    return {
      peer,
      push(edit) {
        const replicaDoc = replica();
        const sent: Uint8Array[] = [];
        const stop = replicaDoc.subscribe((update) => sent.push(update));
        scriptBody(replicaDoc).write(edit);
        stop();
        for (const update of sent)
          sync().receive(peer, {
            type: "PUSH",
            docId: DOC,
            generation: 1,
            clientSeq: ++clientSeq,
            update,
            heal: false,
          });
      },
      set(settingKey, value) {
        sync().receive(peer, {
          type: "SET",
          docId: DOC,
          generation: 1,
          clientSeq: ++clientSeq,
          key: settingKey,
          value: new TextEncoder().encode(JSON.stringify(value)),
        });
      },
      take() {
        pull();
        return inbox.splice(0);
      },
      text: (blockId) =>
        blocksOf(scriptBody(replica()).materialize())
          .find((block) => block.attrs.id === blockId)
          ?.runs.map((r) => r.text)
          .join("") ?? "",
    };
  };
  const sam = person("sam", 1001, "edit");
  const leo = person("leo", 5005, "view");
  leo.take();

  const content = (): VersionContent => {
    const seq = file.log.get(DOC)?.headSeq ?? 0;
    const found = contentAt(file, DOC, { generation: 1, seq });
    if (found === null) throw new RangeError(`no content of ${DOC} at ${seq}`);
    return found;
  };

  return {
    clock,
    storage,
    file,
    service,
    sync: sync(),
    sam,
    leo,
    run,
    lock: async (lockKey = KEY1) =>
      valueOf(await run(service.lock("priya", lockRequest(lockKey)))),
    async editPage(page, words) {
      const id = lastBlockOf(page);
      const at = sam.text(id).length;
      sam.push((w) => w.insertText(id, at, ` ${WORD.repeat(words).trim()}`));
      await run(Promise.resolve());
    },
    blocks: () => blocksOf(sectionize(content().blocks)),
    settings: () => content().settings,
    versions: () => file.history.page(DOC, null, 500),
    controlKinds: () =>
      leo.take().flatMap((m) => (m.type === "CONTROL" ? [m.kind] : [])),
  };
}
