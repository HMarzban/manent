import { LIBRARY_WORDS } from "@manent/ui";
import type { ReactNode } from "react";
import { LibraryViewSection } from "./view-section.tsx";
import type { LibraryViewProps } from "./views.ts";

export function PrivateView(_props: LibraryViewProps): ReactNode {
  return (
    <LibraryViewSection
      heading={LIBRARY_WORDS.privateHeading}
      sentence={LIBRARY_WORDS.privateEmpty}
    />
  );
}
