// Another script beside the page: its own editor, with its own session, undo and facts.
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { mountBesideEditor } from "../editor-host/beside-editor.ts";
import { useEnvironment, useServices } from "../services/context.tsx";
import { createFactsStore } from "../state/facts.store.ts";
import { createOutlineStore } from "../state/outline.store.ts";
import { registerBesideFacts } from "./beside-facts.ts";

/** The editor of `docId`, its caret at `at`'s block when given; its facts are read through `useBesideFact`. */
export function ScriptBeside(props: {
  docId: string;
  at: { blockId: string } | null;
}): ReactNode {
  const { docId, at } = props;
  const services = useServices();
  const { guard, frame, schedule } = useEnvironment();
  const [stores] = useState(() => ({
    facts: createFactsStore({ guard, frame }),
    outline: createOutlineStore({ guard, schedule, composing: () => false }),
  }));
  const place = useRef<HTMLDivElement>(null);
  useEffect(
    () => registerBesideFacts(docId, stores.facts.selectors),
    [docId, stores],
  );
  useEffect(() => {
    const element = place.current;
    if (element === null) return undefined;
    return mountBesideEditor({
      services,
      element,
      docId,
      at,
      facts: stores.facts.writer,
      outline: stores.outline.writer,
      settings: services.openScriptStore(docId),
      guard,
    });
  }, [services, docId, at, stores, guard]);
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      {/* the desk around the sheets, as the page's own */}
      <div
        ref={place}
        className="mn-desk min-h-full [--page-zoom:1] [&>.mn-zoom]:mx-auto"
      />
    </div>
  );
}
