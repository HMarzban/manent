import { expect, test } from "bun:test";
import { installDesktopClose } from "../src/desktop/desktop-close.ts";
import type { CloseGuard } from "../src/services/sync/close-guard.ts";
import { fakeHost, recordingQueue } from "./desktop.fixtures.ts";
import { turn } from "./sync.fixtures.ts";

const DOC = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";
const EXPORT_PATH = `/s/${DOC}/send/export`;
const at = (time: string): number =>
  new Date(`2026-11-12T${time}:00`).getTime();

type Answer = "stay" | "leave" | "export";

/** A guard whose failing document the test sets; `answer` settles the question it was last asked. */
function fakeGuard(): CloseGuard & {
  failingAt(docId: string, since: number): void;
  answer(choice: Answer): void;
  asked: number;
} {
  let failing: { docId: string; since: number } | null = null;
  let settle: ((choice: Answer) => void) | null = null;
  let asked = 0;
  return {
    get asked() {
      return asked;
    },
    failing: () => failing,
    ask() {
      asked += 1;
      return new Promise((resolve) => {
        settle = resolve;
      });
    },
    failingAt(docId, since) {
      failing = { docId, since };
    },
    answer(choice) {
      settle?.(choice);
    },
  };
}

/** The close installed over fakes: the route is at Export until `leave`, and `exported` pushes the exported message. */
function closing() {
  const host = fakeHost();
  const guard = fakeGuard();
  const queue = recordingQueue();
  const routes = new Set<(pathname: string) => void>();
  const stop = installDesktopClose({
    host,
    guard,
    queue,
    exportedText: () => "Exported 'The Lamp Room'.",
    routeChanges(listener) {
      routes.add(listener);
      return () => routes.delete(listener);
    },
    exportPath: () => EXPORT_PATH,
  });
  return {
    host,
    guard,
    shell: host,
    stop,
    route(pathname: string) {
      for (const listener of routes) listener(pathname);
    },
    exported() {
      queue.push({
        id: "exported",
        text: "Exported 'The Lamp Room'.",
        actions: [],
        lifetime: "brief",
        ownWork: false,
      });
    },
  };
}

const settle = async (): Promise<void> => {
  await turn();
  await turn();
};

test("closing with nothing at risk closes at once", () => {
  const { host, guard, shell } = closing();
  shell.emit({ v: 1, t: "close_requested" });
  expect([host.sent, guard.asked]).toEqual([
    [{ v: 1, t: "close_answer", close: true }],
    0,
  ]);
});

test("closing while the device cannot save asks first", async () => {
  const { host, guard, shell } = closing();
  guard.failingAt(DOC, at("14:10"));
  shell.emit({ v: 1, t: "close_requested" });
  expect(host.sent).toEqual([{ v: 1, t: "close_answer", close: false }]);
  expect(guard.asked).toBe(1);
  guard.answer("leave");
  await settle();
  expect(host.sent.at(-1)).toEqual({ v: 1, t: "close_answer", close: true });
});

test("Cancel keeps the window open", async () => {
  const { host, guard, shell, exported } = closing();
  guard.failingAt(DOC, at("14:10"));
  shell.emit({ v: 1, t: "close_requested" });
  guard.answer("stay");
  await settle();
  exported();
  expect(host.sent).toEqual([{ v: 1, t: "close_answer", close: false }]);
});

test("Export a copy closes the window once the file is written", async () => {
  const { host, guard, shell, route, exported } = closing();
  guard.failingAt(DOC, at("14:10"));
  shell.emit({ v: 1, t: "close_requested" });
  guard.answer("export");
  await settle();
  route(EXPORT_PATH);
  const beforeWritten = [...host.sent];
  exported();
  expect([beforeWritten, host.sent]).toEqual([
    [{ v: 1, t: "close_answer", close: false }],
    [
      { v: 1, t: "close_answer", close: false },
      { v: 1, t: "close_answer", close: true },
    ],
  ]);
});

test("leaving Export without exporting keeps the window", async () => {
  const { host, guard, shell, route, exported } = closing();
  guard.failingAt(DOC, at("14:10"));
  shell.emit({ v: 1, t: "close_requested" });
  guard.answer("export");
  await settle();
  route(EXPORT_PATH);
  route(`/s/${DOC}`);
  exported();
  expect(host.sent).toEqual([{ v: 1, t: "close_answer", close: false }]);
});

test("a second close while Export is open asks again, and the first export no longer closes the window", async () => {
  const { host, guard, shell, exported } = closing();
  guard.failingAt(DOC, at("14:10"));
  shell.emit({ v: 1, t: "close_requested" });
  guard.answer("export");
  await settle();
  shell.emit({ v: 1, t: "close_requested" });
  exported();
  guard.answer("stay");
  await settle();
  expect([host.sent, guard.asked]).toEqual([
    [
      { v: 1, t: "close_answer", close: false },
      { v: 1, t: "close_answer", close: false },
    ],
    2,
  ]);
});

test("a stopped close answers the shell no more", () => {
  const { host, shell, stop } = closing();
  stop();
  shell.emit({ v: 1, t: "close_requested" });
  expect(host.sent).toEqual([]);
});
