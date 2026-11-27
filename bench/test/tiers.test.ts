import { afterAll, afterEach, expect, spyOn, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempTrees } from "@manent/testkit";
import fc from "fast-check";
import { readResultFile } from "../result.ts";
import type { ResultFile } from "../result.ts";
import { parseBenchArgs } from "../run.ts";
import { runTiers } from "../tiers/orchestrate.ts";
import {
  TIERS,
  checkTierLimits,
  dockerRunArgs,
  readContainerLimits,
} from "../tiers/tiers.ts";

const trees = createTempTrees("manent-tiers-");
afterAll(() => trees.removeAll());

const printed = spyOn(console, "log").mockImplementation(() => {});
afterEach(() => printed.mockClear());
afterAll(() => printed.mockRestore());

const TIER_TABLE = [
  [
    "host",
    null,
    null,
    [1],
    ["corpus", "crdt", "client", "server", "desktop", "demo"],
  ],
  ["D-modest", 2, 4_294_967_296, [1, 4, 6], ["corpus", "crdt", "client"]],
  ["D-typical", 4, 8_589_934_592, [1], ["crdt", "client"]],
  ["D-small", 1, 1_073_741_824, [1], ["server"]],
  ["ci-shared", null, null, [1], ["corpus", "crdt", "client", "server"]],
];

const D_MODEST_RUN =
  "docker run --rm --init --cpus=2 --memory=4g --memory-swap=4g --shm-size=1g --env MANENT_BENCH_TIER=D-modest --env MANENT_BENCH_THROTTLE=4 --volume /r:/repo/bench/results manent-bench:abc xvfb-run -a bun bench/run.ts --inside --filter typing";

const NOT_INSTALLED =
  "Docker is not installed, so the Docker tiers are recorded as not measured. Install Docker and run bun run bench again to measure them.";
const NOT_RUNNING =
  "Docker is not running, so the Docker tiers are recorded as not measured. Start Docker and run bun run bench again to measure them.";

test("each tier is the owner's", () => {
  expect(
    Object.values(TIERS).map((t): unknown[] => [
      t.id,
      t.cpus,
      t.memoryBytes,
      t.throttles,
      t.areas,
    ]),
  ).toEqual(TIER_TABLE);
  expect(Object.values(TIERS).map((t) => t.standsFor)).toEqual([
    "This machine, uncapped: the fast reference",
    "A modest laptop; budgets are judged here",
    "A current laptop",
    "A small server, for the server scenarios",
    "A shared CI machine: works or does not, never timing",
  ]);
});

test("a tier's container is started with its caps and its throttle", () => {
  expect(
    dockerRunArgs(TIERS["D-modest"], {
      image: "manent-bench:abc",
      throttle: 4,
      resultsDir: "/r",
      readOnly: [],
      args: ["--filter", "typing"],
    }).join(" "),
  ).toBe(D_MODEST_RUN);
  expect(
    dockerRunArgs(TIERS["D-small"], {
      image: "i",
      throttle: 1,
      resultsDir: "/r",
      readOnly: [{ from: "/t", to: "/repo/bench/corpus/traces" }],
      readWrite: [{ from: "/c", to: "/repo/bench/corpus/cache" }],
      args: [],
    }).join(" "),
  ).toBe(
    "docker run --rm --init --cpus=1 --memory=1g --memory-swap=1g --shm-size=1g --env MANENT_BENCH_TIER=D-small --env MANENT_BENCH_THROTTLE=1 --volume /r:/repo/bench/results --volume /t:/repo/bench/corpus/traces:ro --volume /c:/repo/bench/corpus/cache i bun bench/run.ts --inside",
  );
});

test("a container whose limits are not the tier's is refused", () => {
  const files = {
    "/sys/fs/cgroup/cpu.max": "200000 100000",
    "/sys/fs/cgroup/memory.max": "2147483648",
  };
  expect(
    readContainerLimits((p) => files[p as keyof typeof files] ?? null),
  ).toEqual({ cpus: 2, memoryBytes: 2_147_483_648 });
  expect(
    checkTierLimits(TIERS["D-modest"], { cpus: 2, memoryBytes: 2_147_483_648 }),
  ).toEqual({ ok: false, reason: "memory is 2 GB, not 4 GB" });
  expect(readContainerLimits(() => null)).toEqual({
    cpus: null,
    memoryBytes: null,
  });
});

test("an unlimited or unreadable cgroup is refused as well", () => {
  const unlimited = {
    "/sys/fs/cgroup/cpu.max": "max 100000\n",
    "/sys/fs/cgroup/memory.max": "max\n",
  };
  expect(
    readContainerLimits((p) => unlimited[p as keyof typeof unlimited] ?? null),
  ).toEqual({ cpus: null, memoryBytes: null });
  expect(
    readContainerLimits((p) => (p.endsWith("cpu.max") ? "two" : "4g")),
  ).toEqual({ cpus: null, memoryBytes: null });
  expect(
    readContainerLimits((p) => (p.endsWith("cpu.max") ? "0 0" : "")),
  ).toEqual({ cpus: null, memoryBytes: null });
  expect(
    checkTierLimits(TIERS["D-modest"], {
      cpus: 4,
      memoryBytes: 4_294_967_296,
    }),
  ).toEqual({ ok: false, reason: "cpus are 4, not 2" });
  expect(
    checkTierLimits(TIERS["D-small"], { cpus: null, memoryBytes: null }),
  ).toEqual({ ok: false, reason: "cpus are unlimited, not 1" });
  expect(
    checkTierLimits(TIERS["D-modest"], {
      cpus: 2,
      memoryBytes: 4_294_967_296,
    }),
  ).toEqual({ ok: true });
});

test("any cgroup text reads as a limit or as none, never as an error", () => {
  const text = fc.oneof(
    fc.tuple(fc.nat(), fc.nat()).map(([q, p]) => `${q} ${p}\n`),
    fc.nat().map((n) => `max ${n}`),
    fc.nat().map(String),
    fc.constant("max\n"),
    fc.string(),
  );
  fc.assert(
    fc.property(text, text, (cpu, memory) => {
      const limits = readContainerLimits((p) =>
        p.endsWith("cpu.max") ? cpu : memory,
      );
      expect(limits.cpus === null || Number.isFinite(limits.cpus)).toBe(true);
      expect(
        limits.memoryBytes === null || Number.isInteger(limits.memoryBytes),
      ).toBe(true);
    }),
    { numRuns: 300 },
  );
});

const scenario = (id: string) => `
export default {
  id: ${JSON.stringify(id)},
  workload: null,
  processes: 1,
  async run() {
    return [{ metric: "size", unit: "bytes", samples: [1] }];
  },
};
`;

/** A suite of one server and one client scenario, with no budget rows. */
function suite(): Promise<string> {
  return trees.tree({
    "budgets.json": JSON.stringify({
      formatVersion: 1,
      tier: "D-modest",
      budgets: [],
    }),
    "server/a.bench.ts": scenario("server.a"),
    "client/b.bench.ts": scenario("client.b"),
  });
}

type DockerAnswer = { exitCode: number; output: string } | { missing: true };

/** A docker command that answers `version`, `info` and `image inspect` as given, and runs nothing else. */
function fakeDocker(answers: {
  version: DockerAnswer;
  info?: string;
  image?: DockerAnswer;
  run?: (resultsDir: string) => Promise<DockerAnswer>;
}) {
  const calls: string[] = [];
  const docker = async (args: readonly string[]): Promise<DockerAnswer> => {
    calls.push(args.join(" "));
    if (args[0] === "version") return answers.version;
    if (args[0] === "info")
      return { exitCode: 0, output: `${answers.info ?? "8 17179869184"}\n` };
    if (args[0] === "image")
      return answers.image ?? { exitCode: 0, output: "[]" };
    const volume = args.find((a) => a.endsWith(":/repo/bench/results"));
    if (args[0] === "run" && volume !== undefined && answers.run !== undefined)
      return answers.run(volume.slice(0, -":/repo/bench/results".length));
    return { exitCode: 1, output: "step 4/6 failed\nno space left on device" };
  };
  return { docker, calls };
}

/** Each file's tier and its scenarios' outcome and reason. */
async function outcomes(files: readonly string[]) {
  const read = await Promise.all(files.map((f) => readResultFile(f)));
  return read.map((r) => ({
    tier: r.environment.tier,
    throttle: r.environment.throttle,
    scenarios: r.scenarios.map((s) => [
      s.id,
      s.outcome,
      s.outcome === "not_measured" ? s.reason : null,
    ]),
  }));
}

test("a Docker tier that cannot run is recorded as not measured, and the next tier runs", async () => {
  const cases: {
    docker: ReturnType<typeof fakeDocker>;
    reason: string;
    printed: string[];
  }[] = [
    {
      docker: fakeDocker({ version: { missing: true } }),
      reason: NOT_INSTALLED,
      printed: [NOT_INSTALLED],
    },
    {
      docker: fakeDocker({ version: { exitCode: 1, output: "no daemon" } }),
      reason: NOT_RUNNING,
      printed: [NOT_RUNNING],
    },
    {
      docker: fakeDocker({
        version: { exitCode: 0, output: "29.8.2" },
        info: "1 2147483648",
      }),
      reason: "Docker offers 1 cores and 2 GB; this tier needs 2 and 4",
      printed: [],
    },
    {
      docker: fakeDocker({
        version: { exitCode: 0, output: "29.8.2" },
        image: { exitCode: 1, output: "No such image" },
      }),
      reason: "the tier image could not be built: no space left on device",
      printed: [],
    },
    {
      docker: fakeDocker({
        version: { exitCode: 0, output: "29.8.2" },
        run: async () => ({ exitCode: 137, output: "Killed\n" }),
      }),
      reason: "the container stopped before writing results: Killed",
      printed: [],
    },
  ];
  for (const c of cases) {
    const root = await suite();
    printed.mockClear();
    const files = await runTiers({
      root,
      outDir: join(root, "out"),
      runs: [
        { tier: "D-modest", throttle: 1, filter: null },
        { tier: "D-modest", throttle: 4, filter: "client/" },
        { tier: "host", throttle: 1, filter: null },
      ],
      mode: "quick",
      prove: false,
      docker: c.docker.docker,
    });
    expect(new Set(files).size).toBe(3);
    expect(await outcomes(files)).toEqual([
      {
        tier: "D-modest",
        throttle: 1,
        scenarios: [["client.b", "not_measured", c.reason]],
      },
      {
        tier: "D-modest",
        throttle: 4,
        scenarios: [["client.b", "not_measured", c.reason]],
      },
      {
        tier: "host",
        throttle: 1,
        scenarios: [
          ["client.b", "measured", null],
          ["server.a", "measured", null],
        ],
      },
    ]);
    expect(printed.mock.calls.map(([line]) => line)).toEqual(c.printed);
  }
});

/** A container that writes one result file of the D-small tier into its results volume. */
async function written(resultsDir: string): Promise<DockerAnswer> {
  const file: ResultFile = {
    formatVersion: 2,
    startedAt: 1_794_909_600_000,
    finishedAt: 1_794_909_600_000,
    environment: {
      tier: "D-small",
      throttle: 1,
      mode: "quick",
      prove: false,
      bun: "1.4.4",
      platform: "linux",
      arch: "arm64",
      cpus: 1,
      memoryBytes: 1_073_741_824,
      limits: { cpus: 1, memoryBytes: 1_073_741_824 },
      chromium: null,
      commit: "abc",
      dirty: false,
      corpusVersion: 1,
      command: "bun bench/run.ts --tier D-small --quick",
    },
    scenarios: [],
    unmatched: [],
    unproved: [],
  };
  await mkdir(resultsDir, { recursive: true });
  await writeFile(join(resultsDir, "x.json"), JSON.stringify(file));
  return { exitCode: 0, output: "Results: bench/results/x.json\n" };
}

test("a Docker tier runs in its container, built once, and keeps the file the container wrote", async () => {
  const root = await suite();
  const { docker, calls } = fakeDocker({
    version: { exitCode: 0, output: "29.8.2" },
    image: { exitCode: 1, output: "No such image" },
    run: written,
  });
  const builds: string[] = [];
  const built = async (args: readonly string[]): Promise<DockerAnswer> => {
    if (args[0] !== "build") return docker(args);
    builds.push(args.join(" "));
    return { exitCode: 0, output: "done" };
  };
  const files = await runTiers({
    root,
    outDir: join(root, "out"),
    runs: [
      { tier: "D-small", throttle: 1, filter: "server/" },
      { tier: "D-small", throttle: 1, filter: null },
    ],
    mode: "quick",
    prove: true,
    docker: built,
  });
  expect(files.map((f) => f.slice(join(root, "out").length))).toEqual([
    "/2026-11-17T10-00-00Z.json",
    "/2026-11-17T10-00-00Z-2.json",
  ]);
  expect((await readResultFile(files[0]!)).environment.limits).toEqual({
    cpus: 1,
    memoryBytes: 1_073_741_824,
  });
  const runs = calls.filter((c) => c.startsWith("run "));
  expect(calls.filter((c) => c.startsWith("image inspect"))).toHaveLength(1);
  expect(builds).toHaveLength(1);
  expect(builds[0]).toMatch(
    new RegExp(
      "^build --build-arg MANENT_BENCH_COMMIT=[0-9a-f]{40} --build-arg MANENT_BENCH_DIRTY=(true|false) -f .*/bench/tiers/Dockerfile -t manent-bench:[0-9a-f]{12} ",
    ),
  );
  expect(runs).toHaveLength(2);
  expect(runs[0]).toMatch(
    new RegExp(
      "^run --rm --init --cpus=1 --memory=1g .* manent-bench:[0-9a-f]{12} bun bench/run.ts --inside --quick --prove --filter server/ --command ",
    ),
  );
  expect(runs[1]).toContain("--inside --quick --prove --command ");
});

test("an area name runs that area on the tier that judges it", () => {
  expect(parseBenchArgs(["demo"])).toMatchObject({
    tier: "host",
    filter: "demo/",
  });
  expect(parseBenchArgs(["server"])).toMatchObject({
    tier: "D-small",
    filter: "server/",
  });
});

test("the command line names the tier, the throttle, the mode and the subcommand", () => {
  expect(parseBenchArgs([])).toEqual({
    tier: null,
    throttle: 1,
    filter: null,
    mode: "standard",
    prove: false,
    subcommand: null,
  });
  expect(
    parseBenchArgs([
      "--tier",
      "D-modest",
      "--throttle",
      "6",
      "--quick",
      "--prove",
      "--filter",
      "typing",
    ]),
  ).toEqual({
    tier: "D-modest",
    throttle: 6,
    filter: "typing",
    mode: "quick",
    prove: true,
    subcommand: null,
  });
  expect(parseBenchArgs(["compare", "a.json", "b.json", "--full"])).toEqual({
    tier: null,
    throttle: 1,
    filter: null,
    mode: "full",
    prove: false,
    subcommand: { name: "compare", args: ["a.json", "b.json"] },
  });
  expect(
    parseBenchArgs(["--inside", "--command", "bun bench/run.ts", "--quick"])
      .subcommand,
  ).toEqual({ name: "inside", args: ["bun bench/run.ts"] });
  expect(parseBenchArgs(["--child", "/x.bench.ts"]).subcommand).toEqual({
    name: "child",
    args: ["/x.bench.ts"],
  });
});

test("a command line the bench cannot run is refused", () => {
  const refused: [string[], string][] = [
    [["--tier", "D-huge"], "--tier must be one of"],
    [["--tier", "host", "--throttle", "4"], "tier host runs at 1x only"],
    [["--throttle", "4"], "--throttle needs --tier"],
    [["--filter"], "--filter needs a value"],
    [["--fast"], "--fast is not an option of bun run bench"],
    [["demo", "--filter", "x"], "an area and --filter cannot be combined"],
  ];
  for (const [argv, message] of refused)
    expect(() => parseBenchArgs(argv)).toThrow(message);
});

test("the image is built on the pinned bases", async () => {
  const text = await Bun.file(
    join(import.meta.dir, "../tiers/Dockerfile"),
  ).text();
  const lines = text.split("\n");
  expect(lines[0]).toBe("FROM mcr.microsoft.com/playwright:v1.65.1-noble");
  expect(lines.filter((l) => l.startsWith("COPY --from"))).toEqual([
    "COPY --from=oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d /usr/local/bin/bun /usr/local/bin/bun",
  ]);
});
