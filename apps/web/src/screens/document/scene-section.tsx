// Details → Scene: the caret's scene, its length and omitted badge, synopsis, and Omit/Bring back actions.
import {
  CommandButton,
  DOCUMENT_WORDS,
  Input,
  Label,
  PLACE_WORDS,
  SCENES_WORDS,
  useCommandState,
} from "@manent/ui";
import {
  useCallback,
  useContext,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { useServices } from "../../services/context.tsx";
import { OutlineContext } from "../../state/bridge-contexts.ts";
import { useEditorFact } from "../../state/facts.store.ts";
import type { OutlineRow } from "../../state/outline.store.ts";
import { useCanEdit } from "./ruler-bar.tsx";

/** The outline's row for the heading `blockId`; null while it is not in the outline. */
function useOutlineRowOf(blockId: string | null): OutlineRow | null {
  const outline = useContext(OutlineContext);
  const read = (): OutlineRow | null => {
    if (outline === null || blockId === null) return null;
    for (let index = 0; index < outline.count(); index++) {
      const row = outline.row(index);
      if (row?.blockId === blockId) return row;
    }
    return null;
  };
  return useSyncExternalStore(
    outline?.subscribe ?? (() => () => {}),
    read,
    read,
  );
}

/** What is typed commits on Enter or blur and reverts on Escape; read-only for a person who cannot edit. */
function SynopsisField(props: {
  row: OutlineRow;
  readOnly: boolean;
}): ReactNode {
  const { row, readOnly } = props;
  const { editor } = useServices();
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (): void => {
    if (draft === null) return;
    setDraft(null);
    if (draft !== row.synopsis)
      editor.run({ kind: "synopsis", blockId: row.blockId, text: draft });
  };
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-ui">
        {SCENES_WORDS.synopsis}
      </Label>
      <Input
        id={id}
        readOnly={readOnly}
        placeholder={readOnly ? undefined : SCENES_WORDS.synopsisPlaceholder}
        value={draft ?? row.synopsis}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setDraft(null);
            return;
          }
          if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
          event.preventDefault();
          commit();
        }}
        onBlur={commit}
        className="h-control text-ui"
      />
    </div>
  );
}

/** Optional numeric word-count target for a book chapter, with a live GPU progress bar. */
function ChapterTargetField(props: {
  row: OutlineRow;
  readOnly: boolean;
}): ReactNode {
  const { row, readOnly } = props;
  const { editor } = useServices();
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const current = row.targetWords ?? null;
  const words = row.words ?? 0;

  const commit = (): void => {
    if (draft === null) return;
    const raw = draft.trim();
    setDraft(null);
    if (raw === "") {
      if (current !== null)
        editor.run({
          kind: "chapter_target",
          blockId: row.blockId,
          targetWords: null,
        });
      return;
    }
    const parsed = Number.parseInt(raw.replaceAll(",", ""), 10);
    if (!Number.isFinite(parsed) || parsed < 1) return;
    if (parsed !== current)
      editor.run({
        kind: "chapter_target",
        blockId: row.blockId,
        targetWords: parsed,
      });
  };

  const ratio =
    current !== null && current > 0 ? Math.min(1, words / current) : 0;
  const reached = current !== null && words >= current;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="text-ui">
          {DOCUMENT_WORDS.chapterTarget}
        </Label>
        {reached ? (
          <span className="text-micro font-medium text-ok">
            {DOCUMENT_WORDS.chapterTargetReached}
          </span>
        ) : null}
      </div>
      <Input
        id={id}
        type="number"
        min={1}
        step={100}
        readOnly={readOnly}
        placeholder={
          readOnly ? undefined : DOCUMENT_WORDS.chapterTargetPlaceholder
        }
        value={draft ?? (current === null ? "" : String(current))}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setDraft(null);
            return;
          }
          if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
          event.preventDefault();
          commit();
        }}
        onBlur={commit}
        className="h-control text-ui tabular-nums"
      />
      {current !== null ? (
        <div className="flex flex-col gap-1">
          <div
            role="progressbar"
            aria-label={DOCUMENT_WORDS.chapterTarget}
            aria-valuemin={0}
            aria-valuemax={current}
            aria-valuenow={Math.min(words, current)}
            className="mn-progress-track h-1.5 w-full overflow-hidden rounded-full"
          >
            <div
              className="mn-progress-fill h-full w-full origin-left"
              style={{ transform: `scaleX(${ratio})` }}
            />
          </div>
          <p className="text-micro text-fg-muted tabular-nums">
            {DOCUMENT_WORDS.chapterWordsOf(words, current)}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Drawn while the caret is in a scene or chapter. */
export function SceneSection(props: { docId: string }): ReactNode {
  const services = useServices();
  const sceneId = useEditorFact("sceneId");
  const row = useOutlineRowOf(sceneId);
  const editable = useCanEdit(props.docId);
  const omitCmd = useCommandState("production.omitScene");
  const bringBackCmd = useCommandState("production.bringBackScene");
  const scriptStore = useMemo(
    () => services.openScriptStore(props.docId),
    [services, props.docId],
  );
  const subscribeFormat = useCallback(
    (notify: () => void) => scriptStore.subscribe("script.format", notify),
    [scriptStore],
  );
  const isBook =
    useSyncExternalStore(subscribeFormat, () =>
      scriptStore.get("script.format"),
    ) === "manuscript";
  if (row === null) return null;
  const showActions = omitCmd.visible || bringBackCmd.visible;
  const pagesBadge =
    row.eighths === null
      ? null
      : isBook
        ? SCENES_WORDS.chapterPages(row.eighths)
        : SCENES_WORDS.length(row.eighths);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <p className="min-w-0 flex-1 truncate text-ui font-medium text-fg">
          {row.number === null
            ? row.heading
            : PLACE_WORDS.scene(row.number, row.heading)}
        </p>
        {row.omitted ? (
          <span className="mn-tag shrink-0 font-medium text-attention">
            {SCENES_WORDS.omitted}
          </span>
        ) : null}
        {row.eighths !== null && pagesBadge !== null ? (
          <span
            title={SCENES_WORDS.lengthPages(row.eighths)}
            className="mn-tag shrink-0 tabular-nums"
          >
            {pagesBadge}
          </span>
        ) : null}
      </div>
      {row.number === null && !isBook ? null : (
        <SynopsisField key={row.blockId} row={row} readOnly={!editable} />
      )}
      {isBook ? (
        <ChapterTargetField
          key={`target-${row.blockId}`}
          row={row}
          readOnly={!editable}
        />
      ) : null}
      {showActions ? (
        <div className="flex flex-wrap gap-2">
          <CommandButton
            id="production.omitScene"
            variant="outline"
            size="sm"
          />
          <CommandButton
            id="production.bringBackScene"
            variant="outline"
            size="sm"
          />
        </div>
      ) : null}
    </div>
  );
}
