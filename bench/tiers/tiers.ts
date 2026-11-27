// The tiers a run measures on, the areas of the suite, the tier that judges each area, and the
// container a capped tier runs in.

export const TIER_IDS = [
  "host",
  "D-modest",
  "D-typical",
  "D-small",
  "ci-shared",
] as const;
export type TierId = (typeof TIER_IDS)[number];

export const AREAS = [
  "corpus",
  "crdt",
  "client",
  "server",
  "desktop",
  "demo",
] as const;
export type Area = (typeof AREAS)[number];

/** A tier with `cpus` and `memoryBytes` runs in a container capped to them; one with null runs on the machine itself. */
export interface Tier {
  id: TierId;
  cpus: number | null;
  memoryBytes: number | null;
  throttles: readonly (1 | 4 | 6)[];
  areas: readonly Area[];
  standsFor: string;
}

/** What a container is allowed: null where nothing limits it, or where it cannot be read. */
export interface ContainerLimits {
  cpus: number | null;
  memoryBytes: number | null;
}

const GIB = 2 ** 30;

export const TIERS: Readonly<Record<TierId, Tier>> = Object.freeze({
  host: {
    id: "host",
    cpus: null,
    memoryBytes: null,
    throttles: [1],
    areas: AREAS,
    standsFor: "This machine, uncapped: the fast reference",
  },
  "D-modest": {
    id: "D-modest",
    cpus: 2,
    memoryBytes: 4 * GIB,
    throttles: [1, 4, 6],
    areas: ["corpus", "crdt", "client"],
    standsFor: "A modest laptop; budgets are judged here",
  },
  "D-typical": {
    id: "D-typical",
    cpus: 4,
    memoryBytes: 8 * GIB,
    throttles: [1],
    areas: ["crdt", "client"],
    standsFor: "A current laptop",
  },
  "D-small": {
    id: "D-small",
    cpus: 1,
    memoryBytes: GIB,
    throttles: [1],
    areas: ["server"],
    standsFor: "A small server, for the server scenarios",
  },
  "ci-shared": {
    id: "ci-shared",
    cpus: null,
    memoryBytes: null,
    throttles: [1],
    areas: ["corpus", "crdt", "client", "server"],
    standsFor: "A shared CI machine: works or does not, never timing",
  },
});

/** The tier on which each area's budgets are judged. */
export const JUDGED_ON: Readonly<Record<Area, TierId>> = Object.freeze({
  corpus: "D-modest",
  crdt: "D-modest",
  client: "D-modest",
  server: "D-small",
  desktop: "host",
  demo: "host",
});

/** Bytes in gibibytes, to one decimal place: what the terminal and the reasons call GB. */
export function toGigabytes(bytes: number): number {
  return Math.round((bytes / GIB) * 10) / 10;
}

/** The `docker run` command line of `tier`'s container, `docker` first. RangeError for a tier that runs on the machine itself. */
export function dockerRunArgs(
  tier: Tier,
  options: {
    image: string;
    throttle: 1 | 4 | 6;
    resultsDir: string;
    readOnly: readonly { from: string; to: string }[];
    readWrite?: readonly { from: string; to: string }[];
    args: readonly string[];
  },
): string[] {
  const { cpus, memoryBytes } = tier;
  if (cpus === null || memoryBytes === null)
    throw new RangeError(`tier ${tier.id} has no container`);
  // The swap limit equals the memory limit, so the container cannot swap.
  const memory = `${memoryBytes / GIB}g`;
  // Client tiers run under Xvfb so headed browser scenarios have a virtual display inside Docker.
  const command = tier.areas.includes("client")
    ? ["xvfb-run", "-a", "bun", "bench/run.ts", "--inside", ...options.args]
    : ["bun", "bench/run.ts", "--inside", ...options.args];
  return [
    "docker",
    "run",
    "--rm",
    "--init",
    `--cpus=${cpus}`,
    `--memory=${memory}`,
    `--memory-swap=${memory}`,
    "--shm-size=1g",
    "--env",
    `MANENT_BENCH_TIER=${tier.id}`,
    "--env",
    `MANENT_BENCH_THROTTLE=${options.throttle}`,
    "--volume",
    `${options.resultsDir}:/repo/bench/results`,
    ...options.readOnly.flatMap((v) => ["--volume", `${v.from}:${v.to}:ro`]),
    ...(options.readWrite ?? []).flatMap((v) => [
      "--volume",
      `${v.from}:${v.to}`,
    ]),
    options.image,
    ...command,
  ];
}

const DIGITS = /^\d+$/;

/** The limits cgroup v2 sets on this container; `read` returns a file's text, or null when it is missing. */
export function readContainerLimits(
  read: (path: string) => string | null,
): ContainerLimits {
  const [quota = "", period = ""] = (read("/sys/fs/cgroup/cpu.max") ?? "")
    .trim()
    .split(" ");
  const memory = (read("/sys/fs/cgroup/memory.max") ?? "").trim();
  return {
    cpus:
      DIGITS.test(quota) && DIGITS.test(period) && Number(period) > 0
        ? Number(quota) / Number(period)
        : null,
    memoryBytes: DIGITS.test(memory) ? Number(memory) : null,
  };
}

function shown(value: number | null): string {
  return value === null ? "unlimited" : String(value);
}

function gigabytes(bytes: number | null): string {
  return bytes === null ? "unlimited" : `${toGigabytes(bytes)} GB`;
}

/** Whether a container's limits are exactly `tier`'s; the reason names the first that differs. */
export function checkTierLimits(
  tier: Tier,
  limits: ContainerLimits,
): { ok: true } | { ok: false; reason: string } {
  if (limits.cpus !== tier.cpus)
    return {
      ok: false,
      reason: `cpus are ${shown(limits.cpus)}, not ${shown(tier.cpus)}`,
    };
  if (limits.memoryBytes !== tier.memoryBytes)
    return {
      ok: false,
      reason: `memory is ${gigabytes(limits.memoryBytes)}, not ${gigabytes(tier.memoryBytes)}`,
    };
  return { ok: true };
}
