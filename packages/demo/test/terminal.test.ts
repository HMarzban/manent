import { expect, test } from "bun:test";
import { bindRefusal } from "../src/index.ts";

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
