// Details → Scene: the caret's scene, its length and omitted badge, synopsis, and Omit/Bring back actions.
import {
  CommandButton,
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
