// The production service: the state of a script in production and every request that changes it,
// each sequenced by the authority.
import type {
  FileRequest,
  IssueRequest,
  IssueResponse,
  LayoutRequest,
  LockRequest,
  PagesRequest,
  ProductionState,
  RecallRequest,
} from "@manent/sync-protocol";
import type { HistoryExtras } from "../history/service.ts";
import { endMutation, lockMutation, unlockMutation } from "./lock.ts";
import type { ProductionOutcome } from "./outcome.ts";
import { pagesMutation } from "./pages.ts";
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

const unbuilt = (what: string) => () =>
  Promise.reject(new Error(`${what} is not built yet`));

export function createProductionService(
  options: ProductionOptions,
): ProductionService {
  const requests = createRequests(options);
  return {
    state(userId, docId) {
      const opened = requests.open(userId, docId);
      if (!opened.ok) return opened;
      const value = productionState(opened.file, docId, options.names);
      return { ok: true, value };
    },
    lock: (userId, request) =>
      requests.mutate(userId, lockMutation(options, requests, userId, request)),
    pages: (userId, request) =>
      requests.mutate(userId, pagesMutation(options, request)),
    unlock: (userId, request) =>
      requests.mutate(
        userId,
        unlockMutation(options, requests, userId, request),
      ),
    end: (userId, request) =>
      requests.mutate(userId, endMutation(options, requests, userId, request)),
    layout: unbuilt("layout"),
    issue: unbuilt("issue"),
    recall: unbuilt("recall"),
    file: unbuilt("file"),
    hooks: { subscribed: () => null, checkPush: () => [] },
    extras: { locksAt: () => null, authority: () => () => null },
  };
}
