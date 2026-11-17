import { expect, test } from "bun:test";
import { bindRefusal, checkDemoBind, isLoopbackAddress } from "../src/index.ts";

const check = (host: string, lan = false) => checkDemoBind(host, { lan });

test("the demo starts only on this machine or a private network", () => {
  for (const h of ["127.0.0.1", "127.8.9.1", "::1", "[::1]", "localhost"]) {
    expect(check(h)).toEqual({ ok: true, scope: "loopback" });
  }
  for (const h of [
    "192.168.1.20",
    "10.0.0.5",
    "172.16.0.1",
    "172.31.255.254",
    "fd12:3456::1",
    "::ffff:192.168.1.20",
  ]) {
    expect(check(h, true)).toEqual({ ok: true, scope: "private" });
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
  });
  expect(check("FD00::1", true)).toEqual({ ok: true, scope: "private" });
  expect(check("fc00::1", true)).toEqual({ ok: true, scope: "private" });
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

test("a refusal is one sentence that names the address", () => {
  expect(bindRefusal("0.0.0.0", "wildcard")).toBe(
    "Demo mode has no passwords, so it only starts on this machine or a private network. Refusing 0.0.0.0.",
  );
  expect(bindRefusal("192.168.1.20", "private_needs_lan")).toBe(
    "192.168.1.20 is a private network address. Run make demo LAN=1 to allow it.",
  );
  for (const reason of ["public", "not_an_address"] as const) {
    expect(bindRefusal("8.8.8.8", reason)).toBe(
      "Demo mode has no passwords, so it only starts on this machine or a private network. Refusing 8.8.8.8.",
    );
  }
});

test("loopback is recognised in each of its spellings", () => {
  for (const a of ["127.0.0.1", "127.3.4.5", "::1", "::ffff:127.0.0.1"]) {
    expect(isLoopbackAddress(a)).toBe(true);
  }
  for (const a of ["192.168.1.20", "::ffff:192.168.1.20", "8.8.8.8", ""]) {
    expect(isLoopbackAddress(a)).toBe(false);
  }
});
