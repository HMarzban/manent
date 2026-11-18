import { expect, test } from "bun:test";
import { readServerEnv } from "../src/env.ts";
import { buildServerConfig } from "../src/main.ts";

const config = () =>
  buildServerConfig(
    readServerEnv({ MANENT_DEMO: "1" }),
    new Uint8Array(32),
    4747,
  );

test("the server announces the engine and table versions it runs", () => {
  expect(config().socket.versions.current).toMatchObject({
    engine: 1,
    table: 1,
  });
  expect(config().socket.versions.min).toMatchObject({ engine: 1, table: 1 });
});
