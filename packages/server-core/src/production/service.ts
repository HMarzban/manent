// The production service: the state of a script in production and every request that changes it,
// each sequenced by the authority.
import type {
  FileRequest,
  ImportLockRequest,
  IssueRequest,
  IssueResponse,
  LayoutRequest,
  LockRequest,
  PagesRequest,
  ProductionState,
  RecallRequest,
} from "@manent/sync-protocol";
import { createHistoryService } from "../history/service.ts";
import type { HistoryExtras, HistoryService } from "../history/service.ts";
import type { Clock } from "../sync/ports.ts";
import { PRODUCTION_EXTRAS } from "./extras.ts";
import { issuedFile } from "./files.ts";
import { createProductionHooks } from "./hooks.ts";
import { importLockMutation } from "./import-lock.ts";
import { issueMutation } from "./issue.ts";
import { layoutMutation } from "./layout.ts";
import { endMutation, lockMutation, unlockMutation } from "./lock.ts";
import type { ProductionOutcome } from "./outcome.ts";
import { pagesMutation } from "./pages.ts";
import { recallMutation } from "./recall.ts";
import type { ProductionHooks } from "./ports.ts";
import { createRequests } from "./requests.ts";
import type { ProductionOptions } from "./requests.ts";
import { productionState } from "./state.ts";

export interface ProductionService {
  state(userId: string, docId: string): ProductionOutcome<ProductionState>;
  lock(
    userId: string,
    request: LockRequest,
  ): Promise<ProductionOutcome<ProductionState>>;
  importLock(
    userId: string,
    request: ImportLockRequest,
  ): Promise<ProductionOutcome<ProductionState>>;
  pages(
    userId: string,
    request: PagesRequest,
  ): Promise<ProductionOutcome<ProductionState>>;
  unlock(
    userId: string,
    request: { docId: string; key: string },
  ): Promise<ProductionOutcome<ProductionState>>;
  end(
    userId: string,
    request: { docId: string; key: string },
  ): Promise<ProductionOutcome<ProductionState>>;
  layout(
    userId: string,
    request: LayoutRequest,
  ): Promise<ProductionOutcome<ProductionState>>;
  issue(
    userId: string,
    request: IssueRequest,
  ): Promise<ProductionOutcome<IssueResponse>>;
  recall(
    userId: string,
    request: RecallRequest,
  ): Promise<ProductionOutcome<IssueResponse>>;
  file(
    userId: string,
    request: FileRequest,
  ): Promise<ProductionOutcome<Uint8Array>>;
  readonly hooks: ProductionHooks;
  readonly extras: HistoryExtras;
}

export function createProductionService(
  options: ProductionOptions,
): ProductionService {
  const { hooks, committed } = createProductionHooks(options);
  const requests = createRequests({ ...options, committed });
  return {
    state(userId, docId) {
      const opened = requests.open(userId, docId);
      if (!opened.ok) return opened;
      const value = productionState(opened.file, docId, options.names);
      return { ok: true, value };
    },
    lock: (userId, request) =>
      requests.mutate(userId, lockMutation(options, requests, userId, request)),
    importLock: (userId, request) =>
      requests.mutate(
        userId,
        importLockMutation(options, requests, userId, request),
      ),
    pages: (userId, request) =>
      requests.mutate(userId, pagesMutation(options, request)),
    unlock: (userId, request) =>
      requests.mutate(
        userId,
        unlockMutation(options, requests, userId, request),
      ),
    end: (userId, request) =>
      requests.mutate(userId, endMutation(options, requests, userId, request)),
    layout: (userId, request) =>
      requests.mutate(userId, layoutMutation(options, userId, request)),
    issue: (userId, request) =>
      requests.mutate(
        userId,
        issueMutation(options, requests, userId, request),
      ),
    recall: (userId, request) =>
      requests.mutate(
        userId,
        recallMutation(options, requests, userId, request),
      ),
    file: (userId, request) => issuedFile(options, requests, userId, request),
    hooks,
    extras: PRODUCTION_EXTRAS,
  };
}

/** An authority's history and production services over one store. */
export interface Workflow {
  readonly history: HistoryService;
  readonly production: ProductionService;
}

/** The history service and the production service, each given what it learns from the other. */
export function createWorkflow(
  options: Omit<ProductionOptions, "history" | "now"> & { clock: Clock },
): Workflow {
  const { clock, ...rest } = options;
  const { storage, sync, ids } = rest;
  const history = createHistoryService({
    sync,
    storage,
    clock,
    ids,
    extras: PRODUCTION_EXTRAS,
    draftEvents: rest.draftEvents,
  });
  const production = createProductionService({
    ...rest,
    history,
    now: clock.now,
  });
  return { history, production };
}
