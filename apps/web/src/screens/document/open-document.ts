// A document's services, held open for as long as the component that asked for them is drawn.
import { useLayoutEffect, useState } from "react";
import { useServices } from "../../services/context.tsx";
import type { DocumentServices } from "../../services/ports.ts";

/** The services of `docId`: opened before the first frame is drawn and closed when it goes; null until then. */
export function useOpenDocument(docId: string): DocumentServices | null {
  const { documents } = useServices();
  const [opened, setOpened] = useState<{
    docId: string;
    doc: DocumentServices;
  } | null>(null);
  useLayoutEffect(() => {
    setOpened({ docId, doc: documents.open(docId) });
    return () => documents.close(docId);
  }, [documents, docId]);
  return opened?.docId === docId ? opened.doc : null;
}
