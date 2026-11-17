import { expect, test } from "bun:test";
import {
  createDemoSignIn,
  DEMO_PEOPLE,
  DEMO_WORKSPACES,
} from "../src/index.ts";

test("the demo provider offers the six seeded people", () => {
  expect(createDemoSignIn().describe()).toEqual({
    provider: "demo",
    people: DEMO_PEOPLE,
  });
  expect(DEMO_PEOPLE.map((p) => [p.id, p.name, p.role])).toEqual([
    ["dana", "Dana Reyes", "Showrunner, workspace owner"],
    ["sam", "Sam Okafor", "Staff writer, editor"],
    [
      "priya",
      "Priya Nair",
      "Script coordinator, editor with production permissions",
    ],
    ["leo", "Leo Marsh", "Executive, reader and commenter"],
    ["ana", "Ana Costa", "News producer, editor of rundowns"],
    ["you", "You", "A new person with an empty workspace"],
  ]);
});

test("choosing a person needs no password; anything else is refused", async () => {
  const p = createDemoSignIn();
  expect(await p.authenticate({ personId: "leo" })).toEqual({
    userId: "leo",
    name: "Leo Marsh",
  });
  for (const body of [
    { personId: "mallory" },
    { personId: 7 },
    {},
    null,
    "leo",
  ]) {
    expect(await p.authenticate(body)).toBeNull();
  }
  expect(p.lookup("ana")).toEqual({ userId: "ana", name: "Ana Costa" });
  expect(p.lookup("nobody")).toBeNull();
});

test("a person id is matched exactly, never through inherited properties", async () => {
  const p = createDemoSignIn();
  for (const personId of [
    "toString",
    "__proto__",
    "constructor",
    "Leo",
    " leo",
  ]) {
    expect(await p.authenticate({ personId })).toBeNull();
    expect(p.lookup(personId)).toBeNull();
    expect(p.workspaces(personId)).toEqual([]);
  }
});

test("the four seeded workspaces and who is in them", () => {
  expect(DEMO_WORKSPACES).toEqual([
    { id: "small", name: "Writer's desk", members: ["sam"] },
    {
      id: "medium",
      name: "Writers' room",
      members: ["dana", "sam", "priya", "leo", "ana"],
    },
    { id: "heavy", name: "Studio", members: ["dana", "priya"] },
    { id: "you", name: "Your workspace", members: ["you"] },
  ]);
  const p = createDemoSignIn();
  const ids = (userId: string) => p.workspaces(userId).map((w) => w.id);
  expect(ids("sam")).toEqual(["small", "medium"]);
  expect(ids("dana")).toEqual(["medium", "heavy"]);
  expect(ids("you")).toEqual(["you"]);
  expect(ids("nobody")).toEqual([]);
  expect(p.workspaces("leo")).toEqual([
    { id: "medium", name: "Writers' room", seeding: null },
  ]);
});

test("the demo provider has no redirect flow", async () => {
  const p = createDemoSignIn();
  expect(await p.begin({ redirectUri: "http://localhost:4747/cb" })).toBeNull();
  expect(
    await p.complete({
      code: "c",
      state: "s",
      verifier: "v",
      redirectUri: "http://localhost:4747/cb",
    }),
  ).toBeNull();
});
