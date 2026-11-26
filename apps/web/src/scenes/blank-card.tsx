// The blank card at the end of Scenes Cards: Enter or Add writes a new format-appropriate heading with its synopsis.
import { ORIGIN_MATERIAL, applyBlockOpsAsOne } from "@manent/crdt";
import { randomBlockId } from "@manent/schema";
import { Button, SCENE_MOVE_WORDS, useSubscribable } from "@manent/ui";
import { PlusIcon } from "lucide-react";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { liveEditor } from "../editor-host/live-editor.ts";
import { useServices } from "../services/context.tsx";
import { scriptBlocks } from "./moves.ts";

const headingTypeFor = (
  format: string,
): "chapter" | "slug" | "scene_heading" =>
  format === "manuscript"
    ? "chapter"
    : format === "variety"
      ? "slug"
      : "scene_heading";

/** Writes a heading of the script's format with empty text and `synopsis` at the end of the script, as one undo step; false when the script cannot be changed here. */
function writeSceneCard(
  docId: string,
  synopsis: string,
  format: string,
): boolean {
  const editor = liveEditor(docId);
  if (editor === null || !editor.editable) return false;
  const last = scriptBlocks(editor.doc).at(-1)?.attrs?.id;
  applyBlockOpsAsOne(
    editor.doc,
    [
      {
        op: "insert",
        after: typeof last === "string" ? last : null,
        block: {
          type: "block",
          attrs: {
            id: randomBlockId(),
            type: headingTypeFor(format),
            synopsis,
          },
        },
      },
    ],
    ORIGIN_MATERIAL,
  );
  return true;
}

/** The card after the last: Enter or Add writes what was typed there as a new scene's synopsis. */
export function BlankCard(props: { docId: string }): ReactNode {
  const { docId } = props;
  const services = useServices();
  const store = services.openScriptStore(docId);
  const subscribeFormat = useCallback(
    (listener: () => void) => store.subscribe("script.format", listener),
    [store],
  );
  const format = useSyncExternalStore(subscribeFormat, () =>
    store.get("script.format"),
  );
  const kindSource = useMemo(
    () => services.library.documentKind(docId),
    [services.library, docId],
  );
  const kind = useSubscribable(kindSource);
  const prompt = SCENE_MOVE_WORDS.describeFor(format, kind);
  const [text, setText] = useState("");
  const submit = (): void => {
    const synopsis = text.trim();
    if (synopsis !== "" && writeSceneCard(docId, synopsis, format)) setText("");
  };
  return (
    <div data-new="" className="mn-card flex w-full flex-col gap-2 p-3 text-ui">
      <span className="flex items-center gap-1.5 text-meta font-medium text-fg-muted">
        <PlusIcon aria-hidden="true" className="size-3.5" />
        {SCENE_MOVE_WORDS.newCardTitle(format, kind)}
      </span>
      <textarea
        data-new=""
        rows={2}
        aria-label={prompt}
        placeholder={prompt}
        value={text}
        className="w-full resize-none bg-transparent text-ui text-fg placeholder:text-fg-muted focus:outline-none"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
          event.preventDefault();
          submit();
        }}
      />
      {text.trim() === "" ? null : (
        <div className="flex justify-end">
          <Button type="button" variant="secondary" size="sm" onClick={submit}>
            {SCENE_MOVE_WORDS.addCard}
          </Button>
        </div>
      )}
    </div>
  );
}
