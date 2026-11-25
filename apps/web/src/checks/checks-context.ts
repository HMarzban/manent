// Per-script async inputs for pre-send Checks: project names (via 14:PX's handle), project.targetPages, and the last
// sent draft (via History and /api/versions/content). Never subscribes to editor typing or transactions.
import { jsonMap } from "@manent/crdt";
import type { DocJSON, TextAnchor } from "@manent/schema";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { docOfContent } from "../history/content-doc.ts";
import type { HistoryRow } from "../history/history-rows.ts";
import { readNames } from "../names/names-entries.ts";
import type { PersonServices } from "../services/ports.ts";

export interface ChecksContextSnapshot {
  readonly version: number;
  readonly names: readonly string[];
  readonly targetPages: number | null;
  readonly lastSent: DocJSON | null;
  readonly lastSentName: string | null;
}

export interface CheckDetail {
  readonly anchor: TextAnchor | null;
  readonly subject: string;
}

interface ChecksEntry {
  version: number;
  names: readonly string[];
  targetPages: number | null;
  lastSent: DocJSON | null;
  lastSentName: string | null;
  lastSentVersionId: string | null;
  loadingVersionId: string | null;
  projectId: string | null;
  namesLoadedFor: string | null;
  listeners: Set<() => void>;
  warmed: boolean;
}

const EMPTY_NAMES: readonly string[] = Object.freeze([]);
const EMPTY_SNAPSHOT: ChecksContextSnapshot = Object.freeze({
  version: 0,
  names: EMPTY_NAMES,
  targetPages: null,
  lastSent: null,
  lastSentName: null,
});

const byServices = new WeakMap<PersonServices, Map<string, ChecksEntry>>();
const checkListDocs = new WeakMap<readonly unknown[], string>();
const checkDetails = new Map<string, Map<string, CheckDetail>>();

let activeServices: PersonServices | null = null;

/** Binds the active tab's services for synchronous `findChecks(docId)` calls. */
export function bindChecksServices(services: PersonServices): void {
  activeServices = services;
}

function entriesFor(services: PersonServices): Map<string, ChecksEntry> {
  let map = byServices.get(services);
  if (map === undefined) {
    map = new Map();
    byServices.set(services, map);
  }
  return map;
}

function entryFor(services: PersonServices, docId: string): ChecksEntry {
  const map = entriesFor(services);
  let entry = map.get(docId);
  if (entry === undefined) {
    entry = {
      version: 0,
      names: EMPTY_NAMES,
      targetPages: null,
      lastSent: null,
      lastSentName: null,
      lastSentVersionId: null,
      loadingVersionId: null,
      projectId: null,
      namesLoadedFor: null,
      listeners: new Set(),
      warmed: false,
    };
    map.set(docId, entry);
  }
  return entry;
}

function emit(entry: ChecksEntry): void {
  entry.version += 1;
  for (const listener of entry.listeners) listener();
}

function isSameNames(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, i) => item === b[i]);
}

function newestSentRow(rows: readonly HistoryRow[]): HistoryRow | null {
  return rows.find((row) => row.item.kind === "sent") ?? null;
}

function loadSentDraft(
  services: PersonServices,
  docId: string,
  entry: ChecksEntry,
  rows: readonly HistoryRow[],
): void {
  const sent = newestSentRow(rows);
  if (sent === null) {
    if (entry.lastSent !== null || entry.lastSentName !== null) {
      entry.lastSent = null;
      entry.lastSentName = null;
      entry.lastSentVersionId = null;
      emit(entry);
    }
    return;
  }
  const versionId = sent.item.id;
  const draftName = sent.item.name ?? sent.title;
  if (entry.lastSentVersionId === versionId && entry.lastSentName === draftName)
    return;
  if (entry.loadingVersionId === versionId) return;
  entry.loadingVersionId = versionId;
  void services.history
    .content(docId, { versionId })
    .then((content) => {
      if (entry.loadingVersionId !== versionId) return;
      entry.loadingVersionId = null;
      const parsed = content === null ? null : docOfContent(content);
      entry.lastSent = parsed;
      entry.lastSentName = parsed === null ? null : draftName;
      entry.lastSentVersionId = versionId;
      emit(entry);
    })
    .catch(() => {
      if (entry.loadingVersionId === versionId) entry.loadingVersionId = null;
    });
}

function loadProjectNames(
  services: PersonServices,
  projectId: string,
  entry: ChecksEntry,
  onMap?: (stop: () => void) => void,
): void {
  if (entry.namesLoadedFor === projectId && onMap === undefined) return;
  entry.namesLoadedFor = projectId;
  const projectIndex = services.projectIndex(projectId);
  void projectIndex
    .handle()
    .then((handle) => {
      if (entry.projectId !== projectId) {
        void projectIndex.close();
        return;
      }
      const map = jsonMap(handle.doc(), "names");
      const update = (): void => {
        const next = readNames(map).map((item) => item.name);
        if (!isSameNames(entry.names, next)) {
          entry.names = next;
          emit(entry);
        }
      };
      update();
      if (onMap !== undefined) {
        const unsub = map.subscribe(update);
        onMap(() => {
          unsub();
          void projectIndex.close();
        });
      } else {
        void projectIndex.close();
      }
    })
    .catch(() => {
      if (entry.namesLoadedFor === projectId) entry.namesLoadedFor = null;
      void projectIndex.close();
      // the project index could not open: leave names empty until it can
    });
}

function readTargetPages(
  services: PersonServices,
  docId: string,
): number | null {
  try {
    return services.openScriptStore(docId).get("project.targetPages");
  } catch {
    return null;
  }
}

/** Kicks off one-shot loading of project names, targetPages and the last sent draft for `docId`. */
export function warmChecksContext(
  docId: string,
  services: PersonServices | null = activeServices,
): void {
  if (services === null) return;
  const entry = entryFor(services, docId);
  const target = readTargetPages(services, docId);
  if (target !== entry.targetPages) entry.targetPages = target;
  const projectId = services.library.documentProject(docId).get();
  if (projectId !== null) {
    entry.projectId = projectId;
    loadProjectNames(services, projectId, entry);
  }
  const historyRows = services.history.rows(docId).get().rows;
  loadSentDraft(services, docId, entry, historyRows);
  entry.warmed = true;
}

/** Synchronous snapshot of whatever async Checks inputs are currently loaded for `docId`. */
export function snapshotChecksContext(
  docId: string,
  services: PersonServices | null = activeServices,
): ChecksContextSnapshot {
  if (services === null) return EMPTY_SNAPSHOT;
  const entry = entryFor(services, docId);
  const targetPages = readTargetPages(services, docId);
  if (targetPages !== entry.targetPages) entry.targetPages = targetPages;
  return {
    version: entry.version,
    names: entry.names,
    targetPages: entry.targetPages,
    lastSent: entry.lastSent,
    lastSentName: entry.lastSentName,
  };
}

/**
 * Retains async Checks input subscriptions (project names, project.targetPages, last sent version) while a Checks list
 * is shown, returning a version counter that increments when any input arrives. Never listens to editor keystrokes.
 */
export function useChecksVersion(
  docId: string,
  services: PersonServices,
): number {
  useEffect(() => {
    activeServices = services;
    const entry = entryFor(services, docId);
    let stopNamesMap: (() => void) | null = null;
    let active = true;

    const syncProject = (): void => {
      const nextProject = services.library.documentProject(docId).get();
      if (nextProject === entry.projectId && stopNamesMap !== null) return;
      stopNamesMap?.();
      stopNamesMap = null;
      entry.projectId = nextProject;
      if (nextProject !== null) {
        loadProjectNames(services, nextProject, entry, (stop) => {
          if (active && entry.projectId === nextProject) stopNamesMap = stop;
          else stop();
        });
      }
    };

    const projectSub = services.library.documentProject(docId);
    const stopProject = projectSub.subscribe(syncProject);
    syncProject();

    let stopTarget = (): void => {};
    try {
      const store = services.openScriptStore(docId);
      const syncTarget = (): void => {
        const next = store.get("project.targetPages");
        if (next !== entry.targetPages) {
          entry.targetPages = next;
          emit(entry);
        }
      };
      stopTarget = store.subscribe("project.targetPages", syncTarget);
      syncTarget();
    } catch {
      // script store unavailable in an isolated test harness
    }

    const historySub = services.history.rows(docId);
    const syncHistory = (): void => {
      loadSentDraft(services, docId, entry, historySub.get().rows);
    };
    const stopHistory = historySub.subscribe(syncHistory);
    syncHistory();

    return () => {
      active = false;
      stopProject();
      stopTarget();
      stopHistory();
      stopNamesMap?.();
      stopNamesMap = null;
    };
  }, [docId, services]);

  const subscribe = useCallback(
    (listener: () => void) => {
      const entry = entryFor(services, docId);
      entry.listeners.add(listener);
      return () => {
        entry.listeners.delete(listener);
      };
    },
    [docId, services],
  );
  const getSnapshot = useCallback(
    () => entryFor(services, docId).version,
    [docId, services],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Associates a `findChecks(docId)` result array with its `docId` without changing the public `FoundCheck` shape. */
export function recordChecksDoc(
  checks: readonly unknown[],
  docId: string,
): void {
  checkListDocs.set(checks, docId);
}

export function docIdOfChecks(checks: readonly unknown[]): string | null {
  return checkListDocs.get(checks) ?? null;
}

/** Records a check's anchor and Flag message subject for `docId` and `checkKey`. */
export function recordCheckDetail(
  docId: string,
  checkKey: string,
  detail: CheckDetail,
): void {
  let map = checkDetails.get(docId);
  if (map === undefined) {
    map = new Map();
    checkDetails.set(docId, map);
  }
  map.set(checkKey, detail);
}

export function detailOfCheck(
  docId: string,
  checkKey: string,
): CheckDetail | null {
  return checkDetails.get(docId)?.get(checkKey) ?? null;
}
