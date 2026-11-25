// What people write in the desktop world: the window's and the collaborators' edits of the script,
// and the collaborators' browsers, opened at the cloud on their first turn.
import { scriptBody } from "@manent/crdt";
import type { Rng } from "@manent/demo";
import { blockText, blocksOf } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import type { Random, SyncClient } from "@manent/sync-client";
import { createFaultyStoreSpace } from "@manent/sync-client/testing";
import type { FakeClock } from "@manent/sync-client/testing";
import type { SimCloud } from "./desktop-cloud.ts";
import { V1, createSimClient } from "./desktop-node.ts";
import { DOC, Device } from "./device.ts";
import type { Books } from "./device.ts";
import type { Tools } from "./script.ts";

export type Edit = "type" | "type_into" | "delete_block";

/** The settings a window asks for, each with the values it picks from. */
const ASKED: readonly (readonly [string, readonly unknown[]])[] = Object.freeze(
  [
    ["script.paper", ["letter", "a4"]],
    ["script.moresAtBreaks", [true, false]],
  ],
);

const blockOf = (id: string, text: string): BlockJSON => ({
  type: "block",
  attrs: { id, type: "action" },
  content: [{ type: "text", text }],
});

/** A new block holding a marker, a marker at either end of a block, or a block deleted; a script with no block gets one. */
export function editScript(device: Device, kind: Edit, tools: Tools): void {
  const { rng } = tools;
  const blocks = blocksOf(scriptBody(device.handle.doc()).materialize());
  const ids = blocks.flatMap((view) =>
    view.attrs.id === null
      ? []
      : [{ id: view.attrs.id, text: blockText(view) }],
  );
  const picked = ids.length === 0 ? null : rng.pick(ids);
  if (picked === null || kind === "type") {
    const block = blockOf(tools.ids(), device.nextMarker());
    return device.write((w) => w.insertBlocks(picked?.id ?? null, [block]));
  }
  const { id, text } = picked;
  if (kind === "delete_block") return device.write((w) => w.deleteBlock(id));
  const at = rng.next() < 0.5 ? 0 : text.length;
  device.write((w) => w.insertText(id, at, device.nextMarker()));
}

export function askSetting(device: Device, rng: Rng): void {
  const [key, values] = rng.pick(ASKED);
  device.handle.setSetting(key, rng.pick(values));
}

/** People typing at the cloud in a browser, each an editor of the script once the cloud holds it. */
export class Collaborators {
  /** Null until the browser is open. */
  private readonly browsers = new Map<string, Device | null>();

  constructor(
    userIds: readonly string[],
    private readonly parts: {
      cloud: SimCloud;
      books: Books;
      tools: Tools;
      clock: FakeClock;
      random: () => Random;
    },
  ) {
    for (const userId of userIds) this.browsers.set(userId, null);
  }

  get size(): number {
    return this.browsers.size;
  }

  /** One of them types; one whose browser is not open opens it instead. */
  type(): void {
    const { tools } = this.parts;
    const userId = tools.rng.pick([...this.browsers.keys()]);
    const browser = this.browsers.get(userId);
    const kind = tools.rng.next() < 0.5 ? "type" : "type_into";
    if (browser !== null && browser !== undefined)
      return editScript(browser, kind, tools);
    if (browser === null && this.parts.cloud.holdsScript()) this.open(userId);
  }

  isSynced(): boolean {
    return [...this.browsers.values()].every(
      (browser) => browser?.handle.status.get().synced ?? true,
    );
  }

  private open(userId: string): void {
    const { cloud, books } = this.parts;
    this.browsers.delete(userId);
    const { directory } = cloud.storage;
    if (directory.roleOf(DOC, userId) === null)
      directory.setRole(DOC, userId, "edit", []);
    const store = createFaultyStoreSpace().store(userId);
    const transport = cloud.network.transport(userId);
    const clock = this.parts.clock.clock;
    const make = (): SyncClient =>
      createSimClient({
        userId,
        deviceId: userId,
        transport,
        store,
        clock,
        random: this.parts.random(),
      });
    const client = make();
    void client.open(DOC).then((handle) => {
      const opened = { client, handle, versions: V1 };
      const device = new Device(userId, userId, store, make, books, opened);
      this.browsers.set(userId, device);
    });
  }
}
