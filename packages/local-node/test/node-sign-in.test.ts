import { expect, test } from "bun:test";
import type { SignInProvider } from "@manent/server-core";
import { createSignedSessionStore } from "@manent/server-core";
import { createFakeSignIn } from "@manent/server-core/testing";
import type { Person } from "../src/index.ts";
import { createNodeSignIn } from "../src/index.ts";
import { createMemoryRecords } from "../src/testing/index.ts";

const SAM = { userId: "sam", name: "Sam Okafor" };
const YOU = { userId: "you", name: "You" };

// The fake registers everyone; You starts without an account, as in the demo.
function providerWithYou(): SignInProvider {
  const fake = createFakeSignIn([SAM, YOU]);
  return {
    describe: () => ({
      choices: fake
        .describe()
        .choices.map((c) => ({ ...c, registered: c.userId !== "you" })),
    }),
    authenticate: (body) => fake.authenticate(body),
  };
}

function world() {
  const records = createMemoryRecords();
  const sessions = createSignedSessionStore({
    secret: records.secret(),
    now: () => 1_000,
  });
  const chosen: Person[] = [];
  const signIn = createNodeSignIn({
    provider: providerWithYou(),
    records,
    sessions,
    now: () => 2_000,
    onChosen: (person) => chosen.push(person),
  });
  return { records, sessions, chosen, signIn };
}

test("choosing a person makes them current; You is not sent to the cloud until they ask", async () => {
  const { records, sessions, chosen, signIn } = world();
  expect(signIn.describe()).toEqual(providerWithYou().describe());
  expect(await signIn.authenticate({ userId: "sam" })).toEqual({
    ok: true,
    identity: SAM,
  });
  const sam: Person = {
    ...SAM,
    wantsCloud: true,
    cloudToken: null,
    chosenAt: 2_000,
  };
  expect([records.person("sam"), chosen]).toEqual([sam, [sam]]);
  const current = records.current();
  expect([current?.userId, sessions.resolve(current?.nodeToken ?? "")]).toEqual(
    ["sam", { userId: "sam" }],
  );
  expect(await signIn.authenticate({ userId: "you" })).toEqual({
    ok: true,
    identity: YOU,
  });
  expect([
    records.person("you")?.wantsCloud,
    records.current()?.userId,
  ]).toEqual([false, "you"]);
  expect(await signIn.authenticate({ userId: "leo" })).toEqual({
    ok: false,
    reason: "unknown_user",
  });
  expect([chosen.length, records.current()?.userId]).toEqual([2, "you"]);
});

test("choosing a person again keeps what the cloud gave them", async () => {
  const { records, signIn } = world();
  records.savePerson({
    ...YOU,
    wantsCloud: true,
    cloudToken: "c1",
    chosenAt: 5,
  });
  await signIn.authenticate({ userId: "you" });
  expect(records.person("you")).toEqual({
    ...YOU,
    wantsCloud: true,
    cloudToken: "c1",
    chosenAt: 2_000,
  });
});
