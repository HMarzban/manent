// What the node composes beside its sync service, one entry per line: a feature adds its module under services/ and
// one line. Each entry's hooks are told and asked only for a room in authority mode: a relayed room's are the cloud's.
import type {
  ServerConfig,
  SessionStore,
  SyncHooks,
  SyncService,
} from "@manent/server-core";
import { createSuggestionHooks } from "@manent/server-core";
import type { NodeCoreOptions } from "./ports.ts";
import { workflowService } from "./services/workflow.ts";
import { commentsService } from "./services/comments.ts";
import { projectService } from "./services/project.ts";
import { driverService } from "./services/driver.ts";
import { rundownService } from "./services/rundown.ts";
import { prompterService } from "./services/prompter.ts";
import { prompterFilesService } from "../prompter-files/service.ts";

/** What each service is given. `sync` answers once the server has been built. */
export interface NodeServiceDeps extends NodeCoreOptions {
  sessions: SessionStore;
  ids(): string;
  sync: () => SyncService;
}

/** What a service adds to the node. */
export interface ComposedNodeService {
  /** Told and asked by the sync service after the hooks of the services before it in the list. */
  readonly hooks: readonly SyncHooks[];
  readonly config: Partial<Pick<ServerConfig, "history" | "production">>;
  /** Whether a document is on air now; the first given is the sync service's, which is never on air without one. */
  readonly airWindow?: (docId: string, now: number) => boolean;
  /** A request it answers before server-core does; null for any other. */
  readonly forward?: (request: Request) => Promise<Response | null>;
}

export interface NodeService {
  create(deps: NodeServiceDeps): ComposedNodeService;
}

export const NODE_SERVICES: readonly NodeService[] = [
  workflowService,
  commentsService,
  projectService,
  driverService,
  rundownService,
  prompterService,
  prompterFilesService,
  { create: () => ({ hooks: [createSuggestionHooks({})], config: {} }) },
];

/** `hook` as the node's sync service tells it: a relayed room's events are the cloud's. */
function authorityOnly(
  hook: SyncHooks,
  isAuthority: (docId: string) => boolean,
): SyncHooks {
  return {
    committed(committed) {
      if (committed.room.mode === "authority") hook.committed?.(committed);
    },
    editorLeft(room, userId) {
      if (room.mode === "authority") hook.editorLeft?.(room, userId);
    },
    forgotten(room) {
      if (room.mode === "authority") hook.forgotten?.(room);
    },
    subscribed: (docId) =>
      isAuthority(docId) ? (hook.subscribed?.(docId) ?? null) : null,
    checkPush: (room, report) =>
      room.mode === "authority" ? (hook.checkPush?.(room, report) ?? []) : [],
  };
}

/**
 * Every service of the list made: their hooks in list order, each told only of a room in authority mode; the first
 * `airWindow` given (null: none); their parts of the configuration; and their requests, each asked in list order.
 */
export function composeNodeServices(deps: NodeServiceDeps): {
  hooks: readonly SyncHooks[];
  airWindow: ((docId: string, now: number) => boolean) | null;
  config: ComposedNodeService["config"];
  forward(request: Request): Promise<Response | null>;
} {
  const composed = NODE_SERVICES.map((service) => service.create(deps));
  const isAuthority = (docId: string): boolean =>
    deps.records.docState(docId) === null;
  return {
    hooks: composed.flatMap((c) =>
      c.hooks.map((hook) => authorityOnly(hook, isAuthority)),
    ),
    airWindow:
      composed.find((c) => c.airWindow !== undefined)?.airWindow ?? null,
    config: composed.reduce<ComposedNodeService["config"]>(
      (all, c) => ({ ...all, ...c.config }),
      {},
    ),
    async forward(request) {
      for (const c of composed) {
        const answered = (await c.forward?.(request)) ?? null;
        if (answered !== null) return answered;
      }
      return null;
    },
  };
}
