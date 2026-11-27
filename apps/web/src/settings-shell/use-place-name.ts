// Resolves the name of the place Back returns to: a script's title, or the Library.
import { createValue, useSubscribable } from "@manent/ui";
import { useMemo } from "react";
import { useServices } from "../services/context.tsx";
import { TEXT } from "../text.ts";

const DOCUMENT_PATH = /^\/s\/([^/?#]+)/;

export function usePlaceName(from: string): string {
  const { library } = useServices();
  const docId = DOCUMENT_PATH.exec(from)?.[1] ?? null;
  const title = useMemo(
    () =>
      docId === null
        ? createValue<string | null>(null)
        : library.documentTitle(docId),
    [library, docId],
  );
  return useSubscribable(title) ?? TEXT.libraryTitle;
}
