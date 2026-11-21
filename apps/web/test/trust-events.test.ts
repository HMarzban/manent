import { expect, test } from "bun:test";
import { createDoc } from "@manent/crdt";
import type { RemovedDocResponse } from "@manent/sync-protocol";
import { messageFor } from "@manent/ui";
import type { Message, TrustEvent } from "@manent/ui";
import { trustEventsOf } from "../src/services/sync/trust-events.ts";
import { SYNCED_STATUS, fakeHandle, turn } from "./sync.fixtures.ts";

const DOC = "0b9f6c2e-3c1a-4c55-9a43-5d8f1e2a7b10";
const NOV_12 = new Date(2026, 10, 12, 9, 30).getTime();
const AUG_12 = new Date(2026, 7, 12, 18, 0).getTime();

/** The handle and the messages its events become, each as the person reads it. */
function told(options: {
  removedInfo?: (docId: string) => Promise<RemovedDocResponse | null>;
  lastSyncedAt?: number;
}) {
  const handle = fakeHandle(DOC, createDoc());
  const messages: Message[] = [];
  const stop = trustEventsOf({
    handle,
    title: () => "Low Tide",
    removedInfo: options.removedInfo ?? (async () => null),
    lastSyncedAt: async () => options.lastSyncedAt ?? null,
    push: (event: TrustEvent) => messages.push(messageFor(event)),
  });
  const said = () =>
    messages.map((m) => [m.text, m.actions.map((a) => a.label)]);
  return { handle, said, stop };
}

test("a reconnect is told as a receipt with its counts", () => {
  const { handle, said } = told({});
  handle.emit({ type: "receipt", sent: 340, setAside: 3, overlaps: 2 });
  expect(said()).toEqual([
    [
      "340 changes synced · 2 passages overlap — review · 3 could not be placed — kept in Recovered text",
      ["Review"],
    ],
  ]);
});

test("a script whose access was removed while away is told with what was not sent", () => {
  const { handle, said } = told({});
  handle.status.set({ ...SYNCED_STATUS, side: ["access_removed"], waiting: 0 });
  handle.status.set({ ...SYNCED_STATUS, side: [], waiting: 5 });
  handle.status.set({ ...SYNCED_STATUS, side: ["access_removed"], waiting: 5 });
  expect(said()).toEqual([
    [
      "You no longer have access to 'Low Tide'. Your 5 changes that were not sent are kept on this device.",
      ["Open them", "Export"],
    ],
  ]);
});

test("a script deleted while away is told with who and when", async () => {
  const answers: (RemovedDocResponse | null | Error)[] = [
    new Error("unreachable"),
    { deletedByUserId: "dana", deletedByName: "Dana Reyes", deletedAt: NOV_12 },
  ];
  const asked: string[] = [];
  const { handle, said } = told({
    async removedInfo(docId) {
      asked.push(docId);
      const answer = answers.shift() ?? null;
      if (answer instanceof Error) throw answer;
      return answer;
    },
  });
  const deleted = { ...SYNCED_STATUS, side: ["deleted"] as const, waiting: 5 };
  handle.status.set({ ...deleted, link: "offline" });
  await turn();
  expect([asked.length, said()]).toEqual([1, []]);
  handle.status.set({ ...deleted, link: "online" });
  await turn();
  expect([asked.length, said()]).toEqual([
    2,
    [
      [
        "'Low Tide' was deleted by Dana Reyes on 12 Nov. Your 5 changes that were not sent are kept on this device.",
        ["Open them", "Export"],
      ],
    ],
  ]);

  const gone = told({});
  gone.handle.status.set({ ...deleted, link: "offline" });
  gone.handle.status.set({ ...deleted, link: "online" });
  await turn();
  expect(gone.said()).toEqual([]);
});

test("a rebuild is told in the words of what happened", async () => {
  const { handle, said } = told({ lastSyncedAt: AUG_12 });
  handle.emit({ type: "rebuilt", applied: 14, overlaps: 0, setAside: 0 });
  handle.emit({ type: "rebuilt", applied: 0, overlaps: 0, setAside: 0 });
  handle.emit({ type: "rebuilt", applied: 3, overlaps: 2, setAside: 1 });
  handle.emit({ type: "past_window", versionId: "version-1" });
  await turn();
  handle.emit({ type: "rejected", code: 4422, replayed: 0, setAside: 2 });
  handle.emit({ type: "rejected", code: 4422, replayed: 4, setAside: 1 });
  expect(said()).toEqual([
    [
      "Manent reorganised how this script is stored while you were away. Your 14 changes were re-applied. Undo history for this script starts again from now.",
      ["See what changed"],
    ],
    [
      "Manent reorganised how this script is stored. Undo history for this script starts again from now.",
      [],
    ],
    [
      "Manent reorganised how this script is stored while you were away. Your 3 changes were re-applied. Undo history for this script starts again from now.",
      ["See what changed"],
    ],
    [
      "3 changes synced · 2 passages overlap — review · 1 could not be placed — kept in Recovered text",
      ["Review"],
    ],
    [
      "Your changes made offline since 12 Aug could not be merged automatically. They are saved as 'Recovered — this device, 12 Aug'.",
      ["Open beside"],
    ],
    [
      "Manent could not accept this device's changes. They are saved as 'Recovered — this device'.",
      ["Open beside"],
    ],
    [
      "Manent could not accept some changes from this device. They are saved as 'Recovered — this device' and the rest were re-applied.",
      ["See what changed"],
    ],
  ]);

  const never = told({});
  never.handle.emit({ type: "past_window", versionId: "version-2" });
  await turn();
  expect(never.said()).toEqual([
    [
      "Your changes made offline could not be merged automatically. They are saved as 'Recovered — this device'.",
      ["Open beside"],
    ],
  ]);
});
