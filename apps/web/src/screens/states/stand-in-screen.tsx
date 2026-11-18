// The test build's stand-in screen: the document frame around the stand-in editor, which the shell mounts in the page.
import { useSubscribable } from "@manent/ui";
import type { ReactNode } from "react";
import { useEnvironment } from "../../services/context.tsx";
import { DocumentFrame } from "../document/document-screen.tsx";

/** The frame of the document the shell shows on this route; nothing until the shell has published it. */
export function StandInScreen(): ReactNode {
  const { docId } = useSubscribable(useEnvironment().shellState);
  return docId === null ? null : <DocumentFrame docId={docId} />;
}
