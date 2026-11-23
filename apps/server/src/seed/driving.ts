// What every action of the seed driver reaches the server with: a person's routes, socket, ids and keys.
import { SeedDriverError } from "@manent/demo";
import type { SeedCapability } from "@manent/demo";
import type { Clock } from "@manent/server-core";
import { seedCapabilities } from "./capabilities.ts";
import type { LiveTarget } from "./driver.ts";
import { isFields, openSeamLink } from "./link.ts";
import type { SeamLink } from "./link.ts";
import { callRoute } from "./server.ts";
import type { SeedClock, SeedServer } from "./server.ts";

export type Route = { method: "GET" | "POST"; path: string; body?: unknown };

/** What every action of the driver reaches the server with. */
export interface Driving {
  readonly target: SeedServer | LiveTarget;
  readonly capabilities: ReadonlySet<SeedCapability>;
  /** A route as `userId`: the body of its 200 answer; any other answer is refused. */
  call(userId: string, route: Route): Promise<unknown>;
  /** The person's one socket, opened on first use. */
  link(userId: string): Promise<SeamLink>;
  bytes(count: number): Uint8Array;
  /** A Yjs client id: an unsigned 32-bit integer above 0. */
  clientId(): number;
  /** A request key: 32 lower-case hex characters. */
  key(): string;
  /** Runs the seed clock's due timers; nothing on the live server, whose timers run by themselves. */
  runDue(): Promise<void>;
}

const KEY_BYTES = 16;
const UINT32 = 4_294_967_296;

export const isSeedClock = (clock: Clock): clock is SeedClock =>
  "set" in clock && "runDue" in clock;

const hex = (byte: number): string => byte.toString(16).padStart(2, "0");

export function createDriving(
  target: SeedServer | LiveTarget,
  random: () => number,
): Driving {
  const tokens = new Map<string, string>();
  const links = new Map<string, Promise<SeamLink>>();
  const bytes = (count: number) =>
    Uint8Array.from({ length: count }, () => Math.floor(random() * 256));
  const tokenOf = (userId: string): string => {
    const token = tokens.get(userId) ?? target.sessions.issue(userId);
    tokens.set(userId, token);
    return token;
  };
  return {
    target,
    capabilities: seedCapabilities(target),
    async call(userId, route) {
      const answer = await callRoute(target.server, tokenOf(userId), route);
      const body: unknown = await answer.json().catch(() => null);
      if (answer.status === 200) return body;
      const code = isFields(body) ? String(body.error) : "no code";
      const what = `${route.method} ${route.path} as ${userId}`;
      throw new SeedDriverError("refused", `${what}: ${answer.status} ${code}`);
    },
    link(userId) {
      const link = links.get(userId) ?? openSeamLink(target, userId);
      links.set(userId, link);
      return link;
    },
    bytes,
    clientId: () => Math.floor(random() * (UINT32 - 1)) + 1,
    key: () => Array.from(bytes(KEY_BYTES), hex).join(""),
    async runDue() {
      if (isSeedClock(target.clock)) await target.clock.runDue();
    },
  };
}
