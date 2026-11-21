// The test build's stand-in screen: the document frame around the stand-in editor, which the shell mounts in the page.
import { useSubscribable } from "@manent/ui";
import type { ReactNode } from "react";
import { useEnvironment } from "../../services/context.tsx";
import { DocumentFrame } from "../document/document-screen.tsx";

/**
 * The frame of the document the shell shows on this route, whose id the page carries for the end-to-end tests; nothing
 * until the shell has published it.
 */
export function StandInScreen(): ReactNode {
  const { docId } = useSubscribable(useEnvironment().shellState);
  if (docId === null) return null;
  return (
    <>
      <DocumentFrame docId={docId} />
      <span hidden data-stand-in-doc-id={docId} />
    </>
  );
}
