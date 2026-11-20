// The route that replays edits made against a generation the document has since left.
import type { ReplayRefusal, ReplayResponse } from "@manent/sync-protocol";
import type { ReplayOutcome } from "../../rebuild/replay.ts";
import { DEFAULT_LIMITS } from "../../sync/ports.ts";
import { failure, json } from "../respond.ts";
import type { Route } from "../route.ts";
import type { ServerConfig } from "../server.ts";

type Replay = (userId: string, body: unknown) => Promise<ReplayOutcome>;

/** Where a replay posted through a configuration goes: the sync service the server built from it. */
const replays = new WeakMap<ServerConfig, { replay: Replay }>();

/** The server that serves `config` names the service each replay posted through it goes to. */
export function hearReplays(
  config: ServerConfig,
  service: { replay: Replay },
): void {
  replays.set(config, service);
}

const STATUS: Readonly<Record<ReplayRefusal, number>> = {
  bad_request: 400,
  forbidden: 403,
  not_found: 404,
  deleted: 410,
  generation_current: 409,
  unknown_generation: 409,
  past_window: 409,
  too_large: 413,
  incomplete: 422,
  invalid: 422,
  busy: 429,
};

const UTF8 = new TextDecoder();

export const replayRoutes: Route[] = [
  {
    method: "POST",
    path: "/api/docs/replay",
    async handle({ config, request, user }) {
      const service = replays.get(config);
      if (config.sync === null || service === undefined)
        return failure("not_found", 404);
      const identity = user();
      if (identity === null) return failure("unauthenticated", 401);
      const limit =
        config.sync.limits?.replayBodyBytes ?? DEFAULT_LIMITS.replayBodyBytes;
      const bytes = await request.arrayBuffer();
      if (bytes.byteLength > limit) return failure("too_large", 413);
      let body: unknown;
      try {
        body = JSON.parse(UTF8.decode(bytes));
      } catch {
        return failure("bad_request", 400);
      }
      const outcome = await service.replay(identity.userId, body);
      if (!outcome.ok) return failure(outcome.code, STATUS[outcome.code]);
      return json<ReplayResponse>(outcome.response);
    },
  },
];
