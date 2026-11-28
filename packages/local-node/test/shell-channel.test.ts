import { expect, test } from "bun:test";
import type { PageMessage } from "@manent/sync-protocol";
import { createFakeClock } from "@manent/sync-client/testing";
import { createShellChannel } from "../src/index.ts";

const BASE = "http://127.0.0.1:51234";

const post = (path: string, body: unknown): Request =>
  new Request(`${BASE}${path}`, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const get = (path: string): Request => new Request(`${BASE}${path}`);

interface SseReader {
  next(): Promise<string>;
  cancel(): Promise<void>;
}

// Each frame of an event stream, without its closing blank line.
function sseReader(response: Response): SseReader {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  return {
    async next() {
      while (!buffered.includes("\n\n")) {
        const { done, value } = await reader.read();
        if (done) throw new RangeError("the stream ended");
        buffered += decoder.decode(value, { stream: true });
      }
      const end = buffered.indexOf("\n\n");
      const frame = buffered.slice(0, end);
      buffered = buffered.slice(end + 2);
      return frame.trimEnd();
    },
    cancel: () => reader.cancel(),
  };
}

test("the page's messages reach the shell; the shell's reach every open page", async () => {
  const fake = createFakeClock(0);
  const channel = createShellChannel({
    clock: fake.clock,
    heartbeatMs: 30_000,
  });
  const seen: PageMessage[] = [];
  channel.shell.onMessage((m) => seen.push(m));
  expect(
    (await channel.handle(
      post("/api/local/shell", { v: 1, t: "first_frame" }),
    ))!.status,
  ).toBe(204);
  for (const refused of [
    { v: 1, t: "reload" },
    "{ not json",
    { v: 2, t: "first_frame" },
  ]) {
    const answer = (await channel.handle(post("/api/local/shell", refused)))!;
    expect([answer.status, await answer.json()]).toEqual([
      400,
      { error: "bad_request" },
    ]);
  }
  expect(seen).toEqual([{ v: 1, t: "first_frame" }]);
  const events = await channel.handle(get("/api/local/shell/events"));
  expect(events!.headers.get("content-type")).toBe("text/event-stream");
  const other = sseReader(
    (await channel.handle(get("/api/local/shell/events")))!,
  );
  const reader = sseReader(events!);
  channel.shell.send({ v: 1, t: "menu_command", id: "app.palette" });
  expect(await reader.next()).toBe(
    'data: {"v":1,"t":"menu_command","id":"app.palette"}',
  );
  expect(await other.next()).toBe(
    'data: {"v":1,"t":"menu_command","id":"app.palette"}',
  );
  fake.advance(30_000);
  expect(await reader.next()).toBe(":");
  expect(channel.handle(get("/api/local/elsewhere"))).toBeNull();
});

test("a listener that stops listening hears nothing more", async () => {
  const fake = createFakeClock(0);
  const channel = createShellChannel({
    clock: fake.clock,
    heartbeatMs: 30_000,
  });
  const seen: PageMessage[] = [];
  const stop = channel.shell.onMessage((m) => seen.push(m));
  stop();
  await channel.handle(post("/api/local/shell", { v: 1, t: "open_files" }));
  expect(seen).toEqual([]);
});

test("a stream the page closed is forgotten", async () => {
  const fake = createFakeClock(0);
  const channel = createShellChannel({
    clock: fake.clock,
    heartbeatMs: 30_000,
  });
  channel.shell.send({ v: 1, t: "close_requested" });
  const closed = sseReader(
    (await channel.handle(get("/api/local/shell/events")))!,
  );
  const open = sseReader(
    (await channel.handle(get("/api/local/shell/events")))!,
  );
  expect(fake.pending()).toBe(2);
  await closed.cancel();
  expect(fake.pending()).toBe(1);
  channel.shell.send({ v: 1, t: "update_state", state: "ready" });
  expect(await open.next()).toBe(
    'data: {"v":1,"t":"update_state","state":"ready"}',
  );
  fake.advance(30_000);
  expect(await open.next()).toBe(":");
});

test("closing the channel ends open streams and cancels their heartbeats", async () => {
  const fake = createFakeClock(0);
  const channel = createShellChannel({
    clock: fake.clock,
    heartbeatMs: 30_000,
  });
  const first = sseReader(
    (await channel.handle(get("/api/local/shell/events")))!,
  );
  const second = sseReader(
    (await channel.handle(get("/api/local/shell/events")))!,
  );
  expect(fake.pending()).toBe(2);
  channel.close();
  expect(fake.pending()).toBe(0);
  await expect(first.next()).rejects.toThrow("the stream ended");
  await expect(second.next()).rejects.toThrow("the stream ended");
  channel.shell.send({ v: 1, t: "close_requested" });
});
