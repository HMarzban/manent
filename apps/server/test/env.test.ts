import { expect, test } from "bun:test";
import { readServerEnv } from "../src/env.ts";

test("the defaults are loopback and port 4747", () => {
  expect(readServerEnv({ MANENT_DEMO: "1" })).toEqual({
    port: 4747,
    lanHost: null,
    dataDir: ".manent-demo",
    webDir: "apps/web/dist",
    control: null,
  });
});

test("every setting is read from its variable", () => {
  expect(
    readServerEnv({
      MANENT_DEMO: "1",
      MANENT_PORT: "4800",
      MANENT_DATA_DIR: "/tmp/d",
      MANENT_WEB_DIR: "/tmp/w",
      MANENT_CONTROL_URL: "http://127.0.0.1:4748",
      MANENT_CONTROL_TOKEN: "abc",
    }),
  ).toEqual({
    port: 4800,
    lanHost: null,
    dataDir: "/tmp/d",
    webDir: "/tmp/w",
    control: { url: "http://127.0.0.1:4748", token: "abc" },
  });
});

test("without demo mode the server does not start", () => {
  for (const env of [{}, { MANENT_DEMO: "0" }, { MANENT_DEMO: "true" }]) {
    expect(() => readServerEnv(env)).toThrow(
      "This build has only the demo sign-in. Start it with `make demo`.",
    );
  }
});

test("only a private address may be added", () => {
  expect(
    readServerEnv({ MANENT_DEMO: "1", MANENT_LAN_HOST: "192.168.1.20" })
      .lanHost,
  ).toBe("192.168.1.20");
  expect(
    readServerEnv({ MANENT_DEMO: "1", MANENT_LAN_HOST: "[fd12::1]" }).lanHost,
  ).toBe("fd12::1");
  for (const h of ["0.0.0.0", "8.8.8.8", "example.com"]) {
    expect(() =>
      readServerEnv({ MANENT_DEMO: "1", MANENT_LAN_HOST: h }),
    ).toThrow(/only starts on this machine or a private network/);
  }
});

test("a bad port or half a control pair is refused in one sentence", () => {
  for (const port of [
    "0",
    "70000",
    "abc",
    "47.5",
    "-1",
    "",
    " 4747",
    "4747abc",
  ]) {
    expect(() =>
      readServerEnv({ MANENT_DEMO: "1", MANENT_PORT: port }),
    ).toThrow("MANENT_PORT must be a port number.");
  }
  expect(() =>
    readServerEnv({
      MANENT_DEMO: "1",
      MANENT_CONTROL_URL: "http://127.0.0.1:4748",
    }),
  ).toThrow(
    "MANENT_CONTROL_URL and MANENT_CONTROL_TOKEN must be set together.",
  );
  expect(() =>
    readServerEnv({ MANENT_DEMO: "1", MANENT_CONTROL_TOKEN: "abc" }),
  ).toThrow(
    "MANENT_CONTROL_URL and MANENT_CONTROL_TOKEN must be set together.",
  );
});
