// The two live regions the shell keeps outside the editor, and the announcer that speaks through them.
import { createAnnouncer } from "@manent/ui";
import type { Announcer } from "@manent/ui";
import { useMemo } from "react";
import type { ReactNode } from "react";

/** Drawn once, by the shell; nothing in it takes space or focus. */
export function AnnouncerRegion(): ReactNode {
  return (
    <div data-announcer="" className="sr-only">
      <div aria-live="polite" />
      <div aria-live="assertive" />
    </div>
  );
}

/** Speaks through the regions `AnnouncerRegion` draws in `doc`; says nothing while they are not drawn. */
export function shellAnnouncer(doc: Document): Announcer {
  return {
    announce(text, urgency) {
      const region = doc.querySelector("[data-announcer]");
      if (region instanceof HTMLElement)
        createAnnouncer(region).announce(text, urgency);
    },
  };
}

/** The shell's announcer, for any surface. */
export function useAnnouncer(): Announcer {
  return useMemo(() => shellAnnouncer(document), []);
}
