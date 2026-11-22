// Details → Script → Import: what a file brought in and what is kept but not shown.
import { Suspense, lazy } from "react";
import type { ComponentType } from "react";

// its words would ride in the first load of every script, most of which were never imported
const ImportGroup = lazy(async () => ({
  default: (await import("./import-group.tsx")).ImportGroup,
}));

export const ImportSection: ComponentType<{ docId: string }> = ({ docId }) => (
  <Suspense fallback={null}>
    <ImportGroup docId={docId} />
  </Suspense>
);
