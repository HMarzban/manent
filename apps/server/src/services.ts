// What the server composes beside its sync service, one entry per line: a feature adds its own module and one line.
import type {
  Clock,
  DraftEvents,
  RenderPdf,
  RoundCounts,
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
import { createProjectWiring, projectService } from "./project.ts";
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
  /** The settings of the project that holds `docId`, null for none; absent, no document has any. */
  projectSettings?: (docId: string) => Readonly<Record<string, unknown>> | null;
  /** Told of named, sent and issued drafts; composed from `project.ts` when absent. */
  draftEvents?: DraftEvents;
  /** Told of each comments document's round open counts; composed from `project.ts` when absent. */
  roundCounts?: RoundCounts;
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
  /** SUBSCRIBED's air window; the first given is the sync service's, which sends null without one. */
  readonly airWindowOf?: (
    docId: string,
  ) => { startsAt: number; endsAt: number } | null;
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

/** Every service of the list made: their hooks in list order, the first `airWindow` and `airWindowOf` given (null: none), and their parts of the configuration. */
export function composeServices(deps: ServiceDeps): {
  hooks: readonly SyncHooks[];
  airWindow: ((docId: string, now: number) => boolean) | null;
  airWindowOf:
    ((docId: string) => { startsAt: number; endsAt: number } | null) | null;
  config: ComposedService["config"];
} {
  const project = createProjectWiring(deps);
  const wired: ServiceDeps = {
    ...deps,
    draftEvents: deps.draftEvents ?? project.draftEvents,
    roundCounts: deps.roundCounts ?? project.roundCounts,
  };
  const composed = SERVER_SERVICES.map((service) => service.create(wired));
  return {
    hooks: [...composed.flatMap((c) => c.hooks), project.hooks],
    airWindow:
      composed.find((c) => c.airWindow !== undefined)?.airWindow ?? null,
    airWindowOf:
      composed.find((c) => c.airWindowOf !== undefined)?.airWindowOf ?? null,
    config: composed.reduce<ComposedService["config"]>(
      (all, c) => ({ ...all, ...c.config }),
      {},
    ),
  };
}
