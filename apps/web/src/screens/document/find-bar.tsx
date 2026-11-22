// The Find bar's row between the state bar and the Ruler: its text is looked for as it is typed, from the caret on.
import { FindBar } from "@manent/ui";
import { useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { FactsContext } from "../../state/bridge-contexts.ts";
import { useEditorFact } from "../../state/facts.store.ts";
import { findActions, useFindBar } from "../../state/find.store.ts";
import { useKeepPageStill } from "./document-state-bar.tsx";
import { useCanEdit } from "./ruler-bar.tsx";

const FIND_AREA = Object.freeze({ gridArea: "findbar" });

/**
 * The bar while open. Each opening holds the selected text, or keeps what the bar held when nothing is selected;
 * closing it looks for nothing, so no match stays marked.
 */
function OpenFindBar(props: { docId: string; openings: number }): ReactNode {
  const { editor } = useServices();
  const { dom } = useEnvironment();
  const facts = useContext(FactsContext);
  const selected = (): string => facts?.get("selectedText") ?? "";
  const [find, setFind] = useState(selected);
  const [opened, setOpened] = useState(props.openings);
  if (opened !== props.openings) {
    setOpened(props.openings);
    const text = selected();
    if (text !== "") setFind(text);
  }
  useEffect(() => {
    editor.run({ kind: "find", search: find });
  }, [editor, find]);
  useEffect(
    () => () => void editor.run({ kind: "find", search: "" }),
    [editor],
  );
  return (
    <FindBar
      find={find}
      onFindChange={setFind}
      count={useEditorFact("findCount")}
      current={useEditorFact("findCurrent")}
      focusKey={props.openings}
      replaceable={useCanEdit(props.docId)}
      onStep={(direction) =>
        editor.run({ kind: direction === 1 ? "find_next" : "find_previous" })
      }
      onReplace={(text) => editor.run({ kind: "replace", text })}
      onReplaceAll={(text) => editor.run({ kind: "replace_all", text })}
      onClose={() => {
        // the caret is left at the current match
        findActions.close();
        dom.focusPage();
      }}
    />
  );
}

/** Its row is 0 px high while closed; its appearing and going scroll the page by its height, so the lines stay put. */
export function FindBarRow(props: { docId: string }): ReactNode {
  const { open, openings } = useFindBar();
  const bar = useRef<HTMLDivElement>(null);
  useKeepPageStill(bar);
  // another document opens with the bar closed
  useEffect(() => findActions.close, [props.docId]);
  return (
    <div ref={bar} style={FIND_AREA}>
      {open ? <OpenFindBar docId={props.docId} openings={openings} /> : null}
    </div>
  );
}
