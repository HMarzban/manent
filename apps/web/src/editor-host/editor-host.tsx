// The one element every editor is mounted into, above every route.

import { memo, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { EditorMount } from "./mount.ts";

interface EditorHostProps {
  /** Null while no document is open: nothing is mounted. */
  docId: string | null;
  /** A screen is over the host: it is hidden and inert, never unmounted. */
  covered: boolean;
  mount: EditorMount;
  ports: Omit<Parameters<EditorMount["mount"]>[0], "element" | "docId">;
}

const COVERED = Object.freeze({ visibility: "hidden" });

/** Re-renders only when `docId` or `covered` changes; `mount` and `ports` are read when `docId` does. */
export const EditorHost = memo(
  function EditorHost(props: EditorHostProps): ReactNode {
    const ref = useRef<HTMLDivElement>(null);
    const { docId } = props;
    useEffect(() => {
      const element = ref.current;
      if (docId === null || element === null) return;
      return props.mount.mount({ element, docId, ...props.ports });
    }, [docId]);
    return (
      <div
        ref={ref}
        data-editor-host=""
        inert={props.covered}
        style={props.covered ? COVERED : undefined}
      />
    );
  },
  (before, after) =>
    before.docId === after.docId && before.covered === after.covered,
);
