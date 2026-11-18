import { expect, test } from "bun:test";
import { createConnectionCaps, createTokenBucket } from "../src/index.ts";

let t = 0;
const now = () => t;
const who = (userId: string, address = "127.0.0.1") => ({ userId, address });

test("a bucket allows a burst, then the steady rate, and says how long to wait", () => {
  t = 0;
  const b = createTokenBucket({ perSecond: 300, burst: 600, now });
  for (let i = 0; i < 600; i++) expect(b.take(1)).toEqual({ ok: true });
  // one token takes 1000 / 300 ms, rounded up
  expect(b.take(1)).toEqual({ ok: false, retryAfterMs: 4 });
  t = 1_000;
  for (let i = 0; i < 300; i++) expect(b.take(1).ok).toBe(true);
  expect(b.take(30)).toEqual({ ok: false, retryAfterMs: 100 });
  // it never holds more than the burst
  t = 9_999_999;
  expect(b.take(600).ok).toBe(true);
  expect(b.take(1).ok).toBe(false);
  // a cost that can never fit waits as long as a full bucket takes
  expect(b.take(601)).toEqual({ ok: false, retryAfterMs: 2_000 });
});

test("a clock that goes backwards refills nothing and breaks nothing", () => {
  t = 5_000;
  const b = createTokenBucket({ perSecond: 300, burst: 600, now });
  expect(b.take(600)).toEqual({ ok: true });
  t = 1_000;
  expect(b.take(1)).toEqual({ ok: false, retryAfterMs: 4 });
  t = 1_300;
  expect(b.take(90)).toEqual({ ok: true });
  expect(b.take(1)).toEqual({ ok: false, retryAfterMs: 4 });
});

test("connections are capped per user and per address", () => {
  const caps = createConnectionCaps({
    connectionsPerUser: 2,
    connectionsPerAddress: 3,
  });
  expect([
    caps.admit(who("sam")),
    caps.admit(who("sam")),
    caps.admit(who("sam")),
  ]).toEqual([true, true, false]);
  expect(caps.admit(who("dana"))).toBe(true);
  expect(caps.admit(who("leo"))).toBe(false); // the address is full
  caps.release(who("sam"));
  expect(caps.admit(who("leo"))).toBe(true);
  expect(caps.admit(who("ana", "10.0.0.9"))).toBe(true);
});
