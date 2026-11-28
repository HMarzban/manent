// Announces a document or rundown screen's title on open, and once more if it resolves from a fallback placeholder.
import { useEffect, useRef } from "react";
import type { ShellDom } from "../../shell/regions.tsx";

/**
 * Announces `title` when `docId` opens, updating once if the previous announcement for this `docId` was a fallback.
 * Subsequent title edits for the same `docId` (such as renaming or changing a rundown's date) are not re-announced.
 */
export function useScreenAnnounce(
  docId: string,
  dom: ShellDom,
  title: string,
  isFallback: boolean,
): void {
  const announced = useRef<{
    docId: string;
    title: string;
    fallback: boolean;
  } | null>(null);
  useEffect(() => {
    const prev = announced.current;
    if (
      prev?.docId === docId &&
      (prev.title === title || !prev.fallback || isFallback)
    )
      return;
    announced.current = { docId, title, fallback: isFallback };
    dom.announce(title);
  }, [docId, dom, title, isFallback]);
}
