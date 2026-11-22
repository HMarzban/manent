// Details → Scene: the caret's scene, its synopsis, and Omit scene or Bring back scene while page numbers are locked.
import {
  CommandButton,
  Input,
  Label,
  PLACE_WORDS,
  SCENES_WORDS,
} from "@manent/ui";
import { useContext, useId, useState, useSyncExternalStore } from "react";
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

/** What is typed commits on Enter or when the field loses focus, never per key; read-only for a person who cannot edit. */
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
        value={draft ?? row.synopsis}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
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

/** Drawn while the caret is in a scene; a chapter has no number and no synopsis. */
export function SceneSection(props: { docId: string }): ReactNode {
  const sceneId = useEditorFact("sceneId");
  const row = useOutlineRowOf(sceneId);
  const editable = useCanEdit(props.docId);
  if (row === null) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="truncate text-ui">
        {row.number === null
          ? row.heading
          : PLACE_WORDS.scene(row.number, row.heading)}
      </p>
      {row.number === null ? null : (
        <SynopsisField key={row.blockId} row={row} readOnly={!editable} />
      )}
      <div className="flex gap-2">
        <CommandButton id="production.omitScene" variant="outline" size="sm" />
        <CommandButton
          id="production.bringBackScene"
          variant="outline"
          size="sm"
        />
      </div>
    </div>
  );
}
