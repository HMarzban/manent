// What the server composes beside its sync service, one entry per line: a feature adds its own module and one line.
import type {
  Clock,
  RenderPdf,
  ServerConfig,
  SettingRules,
  SyncHooks,
  SyncService,
} from "@manent/server-core";
import { createSuggestionHooks } from "@manent/server-core";
import type { Storage } from "@manent/storage";
import { workflowService } from "./workflow.ts";
import { commentsService } from "./comments.ts";
import { sharingService } from "./sharing.ts";
import { draftsService } from "./drafts.ts";
import { privateCopyService } from "./private-copy.ts";
import { driverService } from "./driver.ts";
import { projectService } from "./project.ts";
import { rundownService } from "./rundown.ts";
import { prompterService } from "./prompter.ts";
import { trashService } from "./trash.ts";
import { searchService } from "./search.ts";
import { workspaceService } from "./workspace.ts";
import { notificationsService } from "./notifications.ts";
import { publicApiService } from "./public-api.ts";

/** What each service is given. `sync` answers once the server has been built. */
export interface ServiceDeps {
  storage: Storage;
  sync: () => SyncService;
  clock: Clock;
  ids: () => string;
  /** A person's name in the server's directory; their user id when it holds none. */
  names: (userId: string) => string;
  renderPdf: RenderPdf;
  rules: SettingRules;
}

/** What a service adds to the server. */
export interface ComposedService {
  /** Told and asked by the sync service after the hooks of the services before it in the list. */
  readonly hooks: readonly SyncHooks[];
  readonly config: Partial<
    Pick<
      ServerConfig,
      | "history"
      | "production"
      | "comments"
      | "sharing"
      | "drafts"
      | "privateCopy"
      | "driver"
      | "project"
      | "rundown"
      | "prompter"
      | "trash"
      | "search"
      | "workspace"
      | "notify"
      | "publicApi"
    >
  >;
  /** Whether a document is on air now; the first given is the sync service's, which is never on air without one. */
  readonly airWindow?: (docId: string, now: number) => boolean;
}

export interface ServerService {
  create(deps: ServiceDeps): ComposedService;
}

export const SERVER_SERVICES: readonly ServerService[] = [
  workflowService,
  commentsService,
  sharingService,
  draftsService,
  privateCopyService,
  driverService,
  projectService,
  rundownService,
  prompterService,
  trashService,
  searchService,
  workspaceService,
  notificationsService,
  publicApiService,
  { create: () => ({ hooks: [createSuggestionHooks({})], config: {} }) },
];

/** Every service of the list made: their hooks in list order, the first `airWindow` given (null: none), and their parts of the configuration. */
export function composeServices(deps: ServiceDeps): {
  hooks: readonly SyncHooks[];
  airWindow: ((docId: string, now: number) => boolean) | null;
  config: ComposedService["config"];
} {
  const composed = SERVER_SERVICES.map((service) => service.create(deps));
  return {
    hooks: composed.flatMap((c) => c.hooks),
    airWindow:
      composed.find((c) => c.airWindow !== undefined)?.airWindow ?? null,
    config: composed.reduce<ComposedService["config"]>(
      (all, c) => ({ ...all, ...c.config }),
      {},
    ),
  };
}
