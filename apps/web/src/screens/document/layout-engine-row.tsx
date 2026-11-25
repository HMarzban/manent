// Custom Script settings rows for Lines per page, Scene numbers state notes, and Layout engine updates.
import {
  ENGINE_VERSIONS,
  LAYOUT_SETTING_KEYS,
  defaultLinesPerPage,
  engineFor,
  maxLinesPerPage,
  profileFromSettings,
  readLayoutSettings,
} from "@manent/pagination";
import type { Paper } from "@manent/pagination";
import { SETTINGS } from "@manent/settings";
import type { SettingKey, SettingsStore } from "@manent/settings";
import {
  Button,
  Input,
  LAYOUT_SETTINGS_WORDS,
  PREFERENCES_WORDS,
  useSetting,
  useSettingsStore,
} from "@manent/ui";
import { TriangleExclamationPointIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import {
  livePagination,
  subscribeLiveEditors,
} from "../../editor-host/live-editor.ts";
import { useServices } from "../../services/context.tsx";
import { useProductionContext } from "../../state/production-context.store.ts";
import type { ScriptSettingRowProps } from "./script-setting-rows.ts";
import { recordEnginePageDelta } from "./setting-messages.ts";

const MIN_LINES = 10;
const LATEST_ENGINE = ENGINE_VERSIONS.at(-1) ?? 1;

const LAYOUT_KEYS: readonly SettingKey[] = [
  ...LAYOUT_SETTING_KEYS.filter((key): key is SettingKey =>
    SETTINGS.all.some((def) => def.key === key),
  ),
  "script.engineVersion",
];

function paperLabelOf(paper: Paper): string {
  const choices = SETTINGS.get("script.paper").type.choices ?? [];
  return choices.find((choice) => choice.value === paper)?.label ?? paper;
}

function parseWholeLines(typed: string): number | null | "invalid" {
  const trimmed = typed.trim();
  if (trimmed === "") return null;
  if (!/^\d+$/.test(trimmed)) return "invalid";
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : "invalid";
}

/** Custom row for `script.linesPerPage`: format figure default, paper-capped range validation, and overflow note. */
export function LinesPerPageRow(_props: ScriptSettingRowProps): ReactNode {
  const store = useSettingsStore();
  const value = useSetting("script.linesPerPage");
  const format = useSetting("script.format");
  const paper: Paper = useSetting("script.paper") === "a4" ? "a4" : "letter";
  const explained = store.explain("script.linesPerPage");
  const def = SETTINGS.get("script.linesPerPage");
  const id = useId();
  const labelId = `${id}-label`;
  const noteId = `${id}-note`;

  const defaultLines = defaultLinesPerPage(format, paper);
  const maxLines = maxLinesPerPage(format, paper);
  const [typed, setTyped] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

  const commit = (raw: string | null): void => {
    if (raw === null) return;
    const parsed = parseWholeLines(raw);
    if (parsed === null) {
      setInvalid(false);
      setTyped(null);
      if (value !== null) store.set("script.linesPerPage", null);
      return;
    }
    if (parsed === "invalid" || parsed < MIN_LINES || parsed > maxLines) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setTyped(null);
    if (parsed !== value) store.set("script.linesPerPage", parsed);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Enter") commit(typed);
    if (event.key === "Escape") {
      event.stopPropagation();
      setTyped(null);
      setInvalid(false);
    }
  };

  const exceedsPaper = value !== null && value > maxLines;
  return (
    <div data-tour="setting:script.linesPerPage" className="flex flex-col py-1">
      <div className="flex min-h-row-2 items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col">
          <span id={labelId} className="text-ui font-medium">
            {def.label}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <p id={noteId} className="text-meta text-fg-muted">
              {LAYOUT_SETTINGS_WORDS.formatFigure(defaultLines)}
            </p>
            {explained.modified ? (
              <Button
                variant="link"
                className="h-auto p-0 text-meta"
                disabled={!explained.writable}
                onClick={() => {
                  setTyped(null);
                  setInvalid(false);
                  store.reset("script.linesPerPage");
                }}
              >
                {PREFERENCES_WORDS.reset}
              </Button>
            ) : null}
          </div>
        </div>
        <Input
          type="number"
          inputMode="numeric"
          min={MIN_LINES}
          max={maxLines}
          step={1}
          className="w-20 tabular-nums"
          value={typed ?? (value === null ? "" : String(value))}
          placeholder={String(defaultLines)}
          disabled={!explained.writable}
          aria-labelledby={labelId}
          aria-describedby={noteId}
          aria-invalid={invalid || undefined}
          onChange={(event) => {
            setTyped(event.target.value);
            if (invalid) setInvalid(false);
          }}
          onBlur={() => commit(typed)}
          onKeyDown={onKeyDown}
        />
      </div>
      {invalid ? (
        <p role="alert" className="flex items-start gap-1 text-meta text-fg">
          <TriangleExclamationPointIcon
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0 text-attention"
          />
          <span>{LAYOUT_SETTINGS_WORDS.linesRangeError(maxLines)}</span>
        </p>
      ) : null}
      {exceedsPaper ? (
        <p className="text-meta text-fg-muted">
          {LAYOUT_SETTINGS_WORDS.paperHoldsAtMost(
            paperLabelOf(paper),
            maxLines,
          )}
        </p>
      ) : null}
    </div>
  );
}

/** State note under `script.sceneNumbers` for locked-None and multi-camera defaults. */
export function SceneNumbersStateRow(props: ScriptSettingRowProps): ReactNode {
  const { settingKey, docId } = props;
  const store = useSettingsStore();
  const value = useSetting("script.sceneNumbers");
  const format = useSetting("script.format");
  const locked = useProductionContext(docId)?.locked === true;
  if (settingKey !== "script.sceneNumbers") return null;
  if (locked && value === "none") {
    return (
      <p className="text-meta text-fg-muted">
        {LAYOUT_SETTINGS_WORDS.lockedSceneNumbersNote}
      </p>
    );
  }
  const explained = store.explain("script.sceneNumbers");
  if (!locked && format === "multicam" && !explained.modified) {
    return (
      <p className="text-meta text-fg-muted">
        {LAYOUT_SETTINGS_WORDS.multicamSceneNumbersNote}
      </p>
    );
  }
  return null;
}

interface PageCounts {
  readonly before: number;
  readonly after: number;
}

function countPagesForUpdate(
  docId: string,
  store: SettingsStore,
  targetVersion: number,
): PageCounts | null {
  const current = livePagination(docId);
  const nextEngine = engineFor(targetVersion);
  if (current === null || nextEngine === null) return null;
  const layout = readLayoutSettings((key) => {
    if (
      key === "script.sceneNumbers" &&
      !store.explain("script.sceneNumbers").modified
    )
      return undefined;
    return SETTINGS.all.some((def) => def.key === key)
      ? store.get(key as SettingKey)
      : undefined;
  });
  const profile = profileFromSettings(nextEngine, layout);
  if (profile === null) return null;
  const after = nextEngine.paginate(current.blocks, profile, current.locks);
  return { before: current.pages.length, after: after.pages.length };
}

/** Custom row for `script.engineVersion`: version line, unlocked page-count preview, and Update layout engine button. */
export function LayoutEngineRow(props: ScriptSettingRowProps): ReactNode {
  const { docId } = props;
  const store = useSettingsStore();
  const services = useServices();
  const currentEngine = useSetting("script.engineVersion");
  const explained = store.explain("script.engineVersion");
  const locked = useProductionContext(docId)?.locked === true;
  const canUpdate =
    !locked && explained.writable && LATEST_ENGINE > currentEngine;

  const [counts, setCounts] = useState<PageCounts | null>(null);
  const [revision, setRevision] = useState(0);

  // Recompute only on mount, editor mount/unmount, or layout setting change — never on a keystroke.
  useEffect(() => {
    if (!canUpdate) return;
    const bump = (): void => setRevision((n) => n + 1);
    const stops = [
      subscribeLiveEditors(bump),
      ...LAYOUT_KEYS.map((key) => store.subscribe(key, bump)),
    ];
    return () => {
      for (const stop of stops) stop();
    };
  }, [canUpdate, store]);

  useEffect(() => {
    if (!canUpdate) {
      setCounts(null);
      return;
    }
    let cancelled = false;
    setCounts(null);
    const frame = requestAnimationFrame(() => {
      if (cancelled) return;
      setCounts(countPagesForUpdate(docId, store, LATEST_ENGINE));
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [canUpdate, docId, store, revision]);

  const onUpdate = (): void => {
    const resolved = counts ?? countPagesForUpdate(docId, store, LATEST_ENGINE);
    if (resolved !== null) {
      recordEnginePageDelta(store, resolved.before, resolved.after);
    }
    const result = store.set("script.engineVersion", LATEST_ENGINE);
    if (!result.ok) {
      services.messages.push({
        id: "layout_engine_refused",
        text: LAYOUT_SETTINGS_WORDS.updateRefused,
        actions: [],
        lifetime: "brief",
        ownWork: false,
      });
    }
  };

  return (
    <div
      data-tour="setting:script.engineVersion"
      className="flex flex-col gap-1 py-1"
    >
      <span className="text-ui font-medium">
        {LAYOUT_SETTINGS_WORDS.engineLine(currentEngine)}
      </span>
      {canUpdate ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-meta text-fg-muted">
            {counts === null
              ? LAYOUT_SETTINGS_WORDS.engineCounting(LATEST_ENGINE)
              : LAYOUT_SETTINGS_WORDS.engineAvailable(
                  LATEST_ENGINE,
                  counts.before,
                  counts.after,
                )}
          </p>
          <Button variant="outline" size="sm" onClick={onUpdate}>
            {LAYOUT_SETTINGS_WORDS.updateEngine}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
