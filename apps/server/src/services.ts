// What the server composes beside its sync service, one entry per line: a feature adds its own module and one line.
import type {
  AirWindows,
  Clock,
  DraftEvents,
  HistoryService,
  PrompterService,
  RenderPdf,
  RoundCounts,
  ServerConfig,
  SettingRules,
  SyncHooks,
  SyncService,
  SyncSettings,
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
  /** History service from an earlier entry in the list, for services that keep versions inside a commit. */
  history?: Pick<HistoryService, "keep">;
  /** Air windows from an earlier entry in the list, shared with services that read them. */
  airWindows?: Pick<AirWindows, "windowOf" | "isInside">;
  /** Data directory for auxiliary server files (such as search indexes); absent in tests that need none. */
  dataDir?: string;
  /** Enables the derived full-text search index; defaults to true. Disabled for staging seed servers. */
  searchEnabled?: boolean;
  /** Base address people open Manent at, for links sent outside the app; absent when none. */
  openUrl?: string;
  /** API key for outbound email delivery; null or absent keeps email off. */
  resendApiKey?: string | null;
  /** Sender address for outbound email; null or absent uses the service default. */
  resendFrom?: string | null;
  /** Optional sink for background service failures; omitted stays quiet. */
  log?: (error: unknown) => void;
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
      | "mos"
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
  /** Per-service handler for SUBSCRIBE in prompter mode; the first given is the sync service's. */
  readonly prompterSubscribe?: PrompterService["subscribePrompter"];
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

/** Every service of the list made: their hooks in list order, the first `airWindow`, `airWindowOf` and `prompterSubscribe` given (null: none), and their parts of the configuration. */
export function composeServices(deps: ServiceDeps): {
  hooks: readonly SyncHooks[];
  airWindow: ((docId: string, now: number) => boolean) | null;
  airWindowOf:
    ((docId: string) => { startsAt: number; endsAt: number } | null) | null;
  prompterSubscribe: PrompterService["subscribePrompter"] | null;
  sync: Pick<
    SyncSettings,
    "hooks" | "airWindow" | "airWindowOf" | "prompterSubscribe"
  >;
  config: ComposedService["config"];
} {
  const project = createProjectWiring(deps);
  const wired: ServiceDeps = {
    ...deps,
    draftEvents: deps.draftEvents ?? project.draftEvents,
    roundCounts: deps.roundCounts ?? project.roundCounts,
  };
  const composed: ComposedService[] = [];
  let history: Pick<HistoryService, "keep"> | undefined = wired.history;
  let airWindow: ((docId: string, now: number) => boolean) | null =
    wired.airWindows?.isInside ?? null;
  let airWindowOf:
    ((docId: string) => { startsAt: number; endsAt: number } | null) | null =
    wired.airWindows?.windowOf ?? null;
  for (const service of SERVER_SERVICES) {
    const built = service.create({
      ...wired,
      ...(history === undefined ? {} : { history }),
      ...(airWindow !== null && airWindowOf !== null
        ? { airWindows: { isInside: airWindow, windowOf: airWindowOf } }
        : {}),
    });
    composed.push(built);
    history ??= built.config.history;
    airWindow ??= built.airWindow ?? null;
    airWindowOf ??= built.airWindowOf ?? null;
  }
  const hooks = [...composed.flatMap((c) => c.hooks), project.hooks];
  const prompterSubscribe =
    composed.find((c) => c.prompterSubscribe !== undefined)
      ?.prompterSubscribe ?? null;
  return {
    hooks,
    airWindow,
    airWindowOf,
    prompterSubscribe,
    sync: {
      hooks,
      ...(airWindow === null ? {} : { airWindow }),
      ...(airWindowOf === null ? {} : { airWindowOf }),
      ...(prompterSubscribe === null ? {} : { prompterSubscribe }),
    },
    config: composed.reduce<ComposedService["config"]>(
      (all, c) => ({ ...all, ...c.config }),
      {},
    ),
  };
}

/** Stops every composed service that holds background work or open handles. */
export function stopComposedServices(config: ComposedService["config"]): void {
  void config.mos?.stop();
  config.prompter?.stop();
  config.trash?.stop();
  config.search?.stop();
  config.notify?.stop();
}
