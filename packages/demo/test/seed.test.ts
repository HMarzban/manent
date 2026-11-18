import { expect, test } from "bun:test";
import { buildSeed, createRng, seededIdSource } from "../src/index.ts";
import type { Rng, SeedStep } from "../src/index.ts";

const take = (r: Rng) => Array.from({ length: 50 }, () => r.next());

const drawIds = () => {
  const ids = seededIdSource(createRng(4747));
  return [ids(), ids(), ids()];
};

const projectStep = (
  id: string,
  workspace: string,
  background = false,
): SeedStep => ({
  id,
  workspace,
  background,
  run: async (c) => [
    {
      project: `${id}-${c.rng.int(0, 999)}-${c.workspace.id}-${c.dataDir}`,
      documents: 1,
    },
  ],
});

test("the generator is deterministic", () => {
  const first = take(createRng(4747));
  expect(take(createRng(4747))).toEqual(first);
  expect(take(createRng(4748))).not.toEqual(first);
  for (const n of first) {
    expect(n).toBeGreaterThanOrEqual(0);
    expect(n).toBeLessThan(1);
  }
});

test("the generator draws the same numbers on every machine", () => {
  const rng = createRng(1);
  expect(Array.from({ length: 3 }, () => rng.next())).toEqual([
    0.6270739405881613, 0.002735721180215478, 0.5274470399599522,
  ]);
});

test("int and pick stay in range", () => {
  const rng = createRng(4747);
  const seen = new Set<number>();
  for (let i = 0; i < 1000; i += 1) seen.add(rng.int(3, 5));
  expect([...seen].toSorted()).toEqual([3, 4, 5]);
  const picked = new Set<string>();
  for (let i = 0; i < 1000; i += 1) picked.add(rng.pick(["a", "b", "c"]));
  expect([...picked].toSorted()).toEqual(["a", "b", "c"]);
  expect(() => rng.pick([])).toThrow(RangeError);
  expect(() => rng.int(5, 3)).toThrow(RangeError);
  expect(() => rng.int(0, 1.5)).toThrow(RangeError);
});

test("seeded IDs repeat for the same seed and look like block IDs", () => {
  const first = drawIds();
  expect(drawIds()).toEqual(first);
  expect(new Set(first).size).toBe(3);
  for (const id of first) expect(id).toMatch(/^[A-Za-z0-9_-]{16}$/);
});

test("a seed with no steps holds the six people and the four empty workspaces", async () => {
  expect(await buildSeed({ steps: [] })).toEqual({
    formatVersion: 1,
    seed: 4747,
    userIds: ["dana", "sam", "priya", "leo", "ana", "you"],
    workspaces: [
      { id: "small", name: "Sam's desk", memberUserIds: ["sam"], projects: [] },
      {
        id: "medium",
        name: "Writers' room",
        memberUserIds: ["dana", "sam", "priya", "leo", "ana"],
        projects: [],
      },
      {
        id: "heavy",
        name: "Lanternfield Studios",
        memberUserIds: ["dana", "priya"],
        projects: [],
      },
      { id: "you", name: "Your desk", memberUserIds: ["you"], projects: [] },
    ],
  });
});

test("steps run in order with one shared generator, add to their own workspace, and know where to write", async () => {
  const steps = [
    projectStep("a", "small"),
    projectStep("b", "medium"),
    projectStep("c", "heavy", true),
  ];
  const m = await buildSeed({ seed: 1, steps, dataDir: "/d" });
  const projects = (id: string) =>
    m.workspaces.find((w) => w.id === id)!.projects.map((p) => p.project);
  expect(projects("small")[0]).toMatch(new RegExp("^a-\\d+-small-/d$"));
  expect(projects("medium")[0]!.startsWith("b-")).toBe(true);
  expect(projects("heavy")).toEqual([]);
  expect(await buildSeed({ seed: 1, steps, dataDir: "/d" })).toEqual(m);
});

test("a step's context holds null for an option left out", async () => {
  const seen: unknown[] = [];
  const probe: SeedStep = {
    id: "probe",
    workspace: "you",
    background: false,
    run: async (c) => {
      seen.push({
        dataDir: c.dataDir,
        serverUrl: c.serverUrl,
        people: c.people.map((p) => p.userId),
      });
      return [];
    },
  };
  await buildSeed({ steps: [probe] });
  await buildSeed({
    steps: [probe],
    dataDir: "/d",
    serverUrl: "http://127.0.0.1:1",
  });
  const people = ["dana", "sam", "priya", "leo", "ana", "you"];
  expect(seen).toEqual([
    { dataDir: null, serverUrl: null, people },
    { dataDir: "/d", serverUrl: "http://127.0.0.1:1", people },
  ]);
});

test("the background phase runs only the background steps and reports progress", async () => {
  const seen: unknown[] = [];
  const heavy: SeedStep = {
    id: "h",
    workspace: "heavy",
    background: true,
    run: async (c) => {
      c.report(1, 2);
      c.report(2, 2);
      return [{ project: "p", documents: 1 }];
    },
  };
  const m = await buildSeed({
    steps: [heavy],
    phase: "background",
    onProgress: (w, done, total) => seen.push([w, done, total]),
  });
  expect(seen).toEqual([
    ["heavy", 1, 2],
    ["heavy", 2, 2],
  ]);
  expect(m.workspaces.find((w) => w.id === "heavy")!.projects).toEqual([
    { project: "p", documents: 1 },
  ]);
});

test("the all phase runs every step, in the order given", async () => {
  const ran: string[] = [];
  const step = (id: string, background: boolean): SeedStep => ({
    id,
    workspace: "small",
    background,
    run: async () => {
      ran.push(id);
      return [];
    },
  });
  const steps = [step("a", false), step("h", true), step("b", false)];
  await buildSeed({ steps, phase: "all" });
  await buildSeed({ steps, phase: "foreground" });
  expect(ran).toEqual(["a", "h", "b", "a", "b"]);
});

test("a step for a workspace that does not exist is refused", async () => {
  let ran = false;
  const stray: SeedStep = {
    id: "stray",
    workspace: "nowhere",
    background: false,
    run: async () => {
      ran = true;
      return [];
    },
  };
  const refused = buildSeed({ steps: [stray] });
  await expect(refused).rejects.toThrow(RangeError);
  await expect(refused).rejects.toThrow("stray");
  expect(ran).toBe(false);
});
