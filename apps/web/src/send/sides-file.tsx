// Export → Sides: in-memory scene range selection, What-row pickers, and the scene row menu item.
import type { Pagination } from "@manent/pagination";
import {
  resolveSidesRange,
  selectSides,
  sidesScenesOf,
} from "@manent/revisions";
import type { SidesScene } from "@manent/revisions";
import {
  DropdownMenuItem,
  PRODUCTION_OUTPUTS_WORDS,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import { FileTextIcon } from "lucide-react";
import { useId, useMemo, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import {
  liveEditor,
  livePagination,
  subscribeLiveEditors,
} from "../editor-host/live-editor.ts";
import { sendPath } from "../screens/send/form-ids.ts";
import { useProductionContext } from "../state/production-context.store.ts";
import type { SendWhatControlsProps, SendWhatOption } from "./what-options.ts";

interface SidesRange {
  readonly firstId: string;
  readonly lastId: string;
}

export interface ResolvedSidesChoice {
  readonly first: SidesScene;
  readonly last: SidesScene;
  readonly ids: ReadonlySet<string>;
}

const ranges = new Map<string, SidesRange>();
const listeners = new Set<() => void>();
let activeDocId: string | null = null;

function subscribeRanges(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Clears any stored sides scene range for `docId` so Sides falls back to the whole script. */
export function clearSidesRange(docId: string): void {
  if (!ranges.delete(docId)) return;
  for (const listener of listeners) listener();
}

/** Stores the chosen first and last scene heading ids for `docId` in memory only. */
export function setSidesRange(
  docId: string,
  firstId: string,
  lastId: string,
): void {
  activeDocId = docId;
  ranges.set(docId, { firstId, lastId });
  for (const listener of listeners) listener();
}

/** The Export URL that opens directly on Sides with scene-range selection active. */
export function sidesExportHref(docId: string): string {
  return `${sendPath(docId, "export")}?as=sides&what=sides_scenes`;
}

function selectableScenes(all: readonly SidesScene[]): readonly SidesScene[] {
  const shown = all.filter((scene) => !scene.omitted);
  return shown.length > 0 ? shown : all;
}

function resolveChoice(
  all: readonly SidesScene[],
  stored: SidesRange | null,
): ResolvedSidesChoice | null {
  const pickable = selectableScenes(all);
  if (pickable.length === 0) return null;
  const findScene = (id: string): SidesScene | undefined =>
    pickable.find((scene) => scene.blockId === id) ??
    all.find((scene) => scene.blockId === id);
  const firstScene =
    (stored === null ? undefined : findScene(stored.firstId)) ?? pickable[0]!;
  const lastScene =
    (stored === null ? undefined : findScene(stored.lastId)) ??
    pickable[pickable.length - 1]!;
  const a = all.findIndex((scene) => scene.blockId === firstScene.blockId);
  const b = all.findIndex((scene) => scene.blockId === lastScene.blockId);
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const first = all[lo]!;
  const last = all[hi]!;
  return {
    first,
    last,
    ids: resolveSidesRange(all, first.blockId, last.blockId),
  };
}

/** Resolves the active sides scene range and heading id set for `docId` against `pages`. */
export function sidesSelectionFor(
  docId: string,
  pages: Pagination,
): ResolvedSidesChoice | null {
  activeDocId = docId;
  return resolveChoice(sidesScenesOf(pages), ranges.get(docId) ?? null);
}

/** Page indices included in the active sides range for `pages`. */
export function sidesPagesOf(pages: Pagination): readonly number[] {
  const all = sidesScenesOf(pages);
  if (all.length === 0) return [];
  const matches = (stored: SidesRange | undefined): stored is SidesRange =>
    stored !== undefined &&
    all.some((scene) => scene.blockId === stored.firstId);
  let matched: SidesRange | null = null;
  if (activeDocId !== null) {
    const current = ranges.get(activeDocId);
    if (matches(current)) matched = current;
  }
  if (matched === null) {
    for (const candidate of ranges.values()) {
      if (matches(candidate)) {
        matched = candidate;
        break;
      }
    }
  }
  const choice = resolveChoice(all, matched);
  if (choice === null) return [];
  return selectSides(pages, choice.ids).pages;
}

function useEditorPagination(docId: string): Pagination | null {
  const editor = useSyncExternalStore(subscribeLiveEditors, () =>
    liveEditor(docId),
  );
  return useMemo(
    () => (editor === null ? null : livePagination(docId)),
    [editor, docId],
  );
}

function SidesRangeControls(props: SendWhatControlsProps): ReactNode {
  const { docId, onChange } = props;
  const firstControlId = useId();
  const lastControlId = useId();
  const pagination = useEditorPagination(docId);
  const stored = useSyncExternalStore(
    subscribeRanges,
    () => ranges.get(docId) ?? null,
    () => ranges.get(docId) ?? null,
  );
  const allScenes = useMemo(
    () => (pagination === null ? [] : sidesScenesOf(pagination)),
    [pagination],
  );
  const pickable = useMemo(() => selectableScenes(allScenes), [allScenes]);
  const choice = useMemo(
    () => resolveChoice(allScenes, stored),
    [allScenes, stored],
  );
  const items = useMemo(
    () =>
      pickable.map((scene) => ({
        value: scene.blockId,
        label: PRODUCTION_OUTPUTS_WORDS.sceneChoice(
          scene.number,
          scene.heading,
        ),
      })),
    [pickable],
  );
  if (choice === null) return null;
  const indexOf = (id: string): number =>
    allScenes.findIndex((scene) => scene.blockId === id);
  const handleFirst = (value: string | null): void => {
    if (value === null) return;
    const nextFirst = indexOf(value);
    const currentLast = indexOf(choice.last.blockId);
    setSidesRange(
      docId,
      value,
      nextFirst > currentLast ? value : choice.last.blockId,
    );
    onChange?.();
  };
  const handleLast = (value: string | null): void => {
    if (value === null) return;
    const currentFirst = indexOf(choice.first.blockId);
    const nextLast = indexOf(value);
    setSidesRange(
      docId,
      nextLast < currentFirst ? value : choice.first.blockId,
      value,
    );
    onChange?.();
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <label
          htmlFor={firstControlId}
          className="w-20 shrink-0 text-meta text-fg-muted"
        >
          {PRODUCTION_OUTPUTS_WORDS.firstScene}
        </label>
        <Select
          items={items}
          value={choice.first.blockId}
          onValueChange={handleFirst}
        >
          <SelectTrigger
            id={firstControlId}
            aria-label={PRODUCTION_OUTPUTS_WORDS.firstScene}
            className="min-w-0 flex-1 cursor-pointer hover:bg-accent"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start" className="max-h-72 min-w-64">
            {items.map((item) => (
              <SelectItem
                key={item.value}
                value={item.value}
                className="cursor-pointer"
              >
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-3">
        <label
          htmlFor={lastControlId}
          className="w-20 shrink-0 text-meta text-fg-muted"
        >
          {PRODUCTION_OUTPUTS_WORDS.lastScene}
        </label>
        <Select
          items={items}
          value={choice.last.blockId}
          onValueChange={handleLast}
        >
          <SelectTrigger
            id={lastControlId}
            aria-label={PRODUCTION_OUTPUTS_WORDS.lastScene}
            className="min-w-0 flex-1 cursor-pointer hover:bg-accent"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start" className="max-h-72 min-w-64">
            {items.map((item) => (
              <SelectItem
                key={item.value}
                value={item.value}
                className="cursor-pointer"
              >
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

/** Scene row menu item opening Export → Sides pre-filled with that scene; hidden until production is locked. */
export function SidesSceneItem(props: {
  docId: string;
  headingId: string;
}): ReactNode {
  const { docId, headingId } = props;
  const locked = useProductionContext(docId)?.locked === true;
  const navigate = useNavigate();
  if (!locked) return null;
  return (
    <DropdownMenuItem
      className="text-ui"
      data-tour="production.includeInSides"
      onClick={() => {
        setSidesRange(docId, headingId, headingId);
        void navigate({ href: sidesExportHref(docId) });
      }}
    >
      <FileTextIcon aria-hidden="true" className="size-icon text-fg-muted" />
      {PRODUCTION_OUTPUTS_WORDS.includeInSides}
    </DropdownMenuItem>
  );
}

export const SIDES_WHAT_OPTION: SendWhatOption = {
  id: "sides_scenes",
  label: PRODUCTION_OUTPUTS_WORDS.rangeOfScenes,
  appliesTo: ["export", "send_draft"],
  transform: null,
  fileTypes: ["sides"],
  lockedOnly: true,
  Controls: SidesRangeControls,
};
