// Full-text search latency against the seeded Lanternfield Studios demo: waits until background seeding completes
// (or records NotMeasured after 20 minutes), then times GET /api/search for three representative queries.
import { NotMeasured, benchMode } from "../../env.ts";
import type { Scenario } from "../../harness.ts";
import { measurement, sampleMs } from "../../measure.ts";
import { startBenchDemo } from "../../client/driver.ts";

const HEAVY_WORKSPACE_ID = "heavy";
const SEED_TIMEOUT_MS = 20 * 60 * 1_000;
const SEED_POLL_MS = 1_000;
const REQUESTS_PER_QUERY = { quick: 5, standard: 200, full: 200 } as const;
const SEARCH_QUERIES = [
  "Tamsin Hale",
  '"the Founding"',
  "type:outline",
] as const;

interface WorkspaceSeedState {
  id: string;
  seeding: { done: number; total: number; failed: boolean } | null;
}

function readWorkspaces(body: unknown): WorkspaceSeedState[] | null {
  if (typeof body !== "object" || body === null || !("workspaces" in body))
    return null;
  if (!Array.isArray(body.workspaces)) return null;
  const workspaces: WorkspaceSeedState[] = [];
  for (const item of body.workspaces) {
    if (typeof item !== "object" || item === null || !("id" in item)) continue;
    if (typeof item.id !== "string") continue;
    const rawSeeding = "seeding" in item ? item.seeding : null;
    if (rawSeeding === null || rawSeeding === undefined) {
      workspaces.push({ id: item.id, seeding: null });
      continue;
    }
    if (
      typeof rawSeeding === "object" &&
      "done" in rawSeeding &&
      "total" in rawSeeding &&
      "failed" in rawSeeding &&
      typeof rawSeeding.done === "number" &&
      typeof rawSeeding.total === "number" &&
      typeof rawSeeding.failed === "boolean"
    ) {
      workspaces.push({
        id: item.id,
        seeding: {
          done: rawSeeding.done,
          total: rawSeeding.total,
          failed: rawSeeding.failed,
        },
      });
    }
  }
  return workspaces;
}

/**
 * Polls `GET /api/me` until Lanternfield Studios (`id: "heavy"`) finishes seeding (`seeding === null`).
 * Throws `NotMeasured` if seeding does not finish within `timeoutMs` or reports an unrecoverable refusal.
 */
export async function waitForHeavySeed(options: {
  url: string;
  token: string;
  timeoutMs?: number;
  pollMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<void> {
  const {
    url,
    token,
    timeoutMs = SEED_TIMEOUT_MS,
    pollMs = SEED_POLL_MS,
    fetchImpl = fetch,
    now = () => performance.now(),
    sleep = (ms) => Bun.sleep(ms),
  } = options;
  const deadline = now() + timeoutMs;
  for (;;) {
    const response = await fetchImpl(`${url}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      const workspaces = readWorkspaces(
        await response.json().catch(() => null),
      );
      const heavy = workspaces?.find((ws) => ws.id === HEAVY_WORKSPACE_ID);
      if (heavy === undefined) {
        throw new NotMeasured(
          "Lanternfield Studios is absent from the demo server's /api/me response",
        );
      }
      if (heavy.seeding === null) return;
      if (heavy.seeding.failed) {
        throw new NotMeasured(
          "Lanternfield Studios seeding stopped before completing",
        );
      }
    }
    if (now() >= deadline) {
      throw new NotMeasured(
        "Lanternfield Studios did not finish seeding within 20 minutes",
      );
    }
    await sleep(pollMs);
  }
}

const scenario: Scenario = {
  id: "server.search",
  workload: null,
  processes: 5,
  async run() {
    const demo = await startBenchDemo();
    try {
      const token = await demo.token("dana");
      await waitForHeavySeed({ url: demo.url, token });
      const count = REQUESTS_PER_QUERY[benchMode()];
      const samples: number[] = [];
      for (const query of SEARCH_QUERIES) {
        const endpoint = `${demo.url}/api/search?q=${encodeURIComponent(query)}`;
        for (let i = 0; i < count; i += 1) {
          const ms = await sampleMs(async () => {
            const response = await fetch(endpoint, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (response.status === 404) {
              throw new NotMeasured(
                "GET /api/search is not enabled on this server",
              );
            }
            if (!response.ok) {
              throw new Error(
                `GET /api/search returned ${response.status} for ${query}`,
              );
            }
            await response.text();
          });
          samples.push(ms);
        }
      }
      return [measurement("search_ms", "ms", samples)];
    } finally {
      await demo.stop();
    }
  },
};

export default scenario;
