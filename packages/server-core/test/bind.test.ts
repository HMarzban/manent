import { expect, test } from "bun:test";
import { checkDemoBind } from "../src/index.ts";

const check = (host: string, lan = false) => checkDemoBind(host, { lan });

test("the demo starts only on this machine or a private network", () => {
  for (const [h, address] of [
    ["127.0.0.1", "127.0.0.1"],
    ["127.8.9.1", "127.8.9.1"],
    ["::1", "::1"],
    ["[::1]", "::1"],
    ["localhost", "localhost"],
  ] as const) {
    expect(check(h)).toEqual({ ok: true, scope: "loopback", address });
  }
  for (const h of [
    "192.168.1.20",
    "10.0.0.5",
    "172.16.0.1",
    "172.31.255.254",
    "fd12:3456::1",
    "::ffff:192.168.1.20",
  ]) {
    expect(check(h, true)).toEqual({ ok: true, scope: "private", address: h });
    expect(check(h, false)).toEqual({ ok: false, reason: "private_needs_lan" });
  }
  for (const h of ["0.0.0.0", "::", "[::]"]) {
    expect(check(h, true)).toEqual({ ok: false, reason: "wildcard" });
  }
  for (const h of [
    "8.8.8.8",
    "172.32.0.1",
    "100.64.0.1",
    "169.254.10.10",
    "::ffff:8.8.8.8",
    "2001:db8::1",
    "fe80::1",
  ]) {
    expect(check(h, true)).toEqual({ ok: false, reason: "public" });
  }
  for (const h of ["example.com", "", "localhost.evil.example", "999.1.1.1"]) {
    expect(check(h, true)).toEqual({ ok: false, reason: "not_an_address" });
  }
});

test("odd spellings of an address are checked by their value", () => {
  expect(check("0:0:0:0:0:0:0:1", true)).toEqual({
    ok: true,
    scope: "loopback",
    address: "0:0:0:0:0:0:0:1",
  });
  expect(check("0:0:0:0:0:0:0:0", true)).toEqual({
    ok: false,
    reason: "wildcard",
  });
  expect(check("::ffff:0.0.0.0", true)).toEqual({
    ok: false,
    reason: "wildcard",
  });
  expect(check("::ffff:127.0.0.1", true)).toEqual({
    ok: true,
    scope: "loopback",
    address: "::ffff:127.0.0.1",
  });
  expect(check("FD00::1", true)).toEqual({
    ok: true,
    scope: "private",
    address: "FD00::1",
  });
  expect(check("fc00::1", true)).toEqual({
    ok: true,
    scope: "private",
    address: "fc00::1",
  });
  for (const h of [
    "1.2.3",
    "01.2.3.4",
    "1.2.3.4.5",
    "[127.0.0.1]",
    "::1::",
    "1:2:3:4:5:6:7:8:9",
    "fd12::zz",
  ]) {
    expect(check(h, true)).toEqual({ ok: false, reason: "not_an_address" });
  }
});

test("an allowed address comes back without its brackets, and one with a zone is refused", () => {
  expect(checkDemoBind("[fc00::1]", { lan: true })).toEqual({
    ok: true,
    scope: "private",
    address: "fc00::1",
  });
  expect(checkDemoBind("fe80::1%eth0", { lan: true })).toEqual({
    ok: false,
    reason: "public",
  });
  expect(checkDemoBind("fd12::1%eth0", { lan: true })).toEqual({
    ok: false,
    reason: "public",
  });
});
