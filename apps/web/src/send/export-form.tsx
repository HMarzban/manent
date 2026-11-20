// The Send screen's Export form, loaded with the screen; its frame, the pages and the PDF writer load apart from it.
import { Suspense, lazy, useCallback, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type { SendForm, SendFormProps } from "../screens/send/forms.ts";
import { useServices } from "../services/context.tsx";

const LazyExport = lazy(() =>
  import("./export-frame.tsx").then((loaded) => ({
    default: loaded.LiveExport,
  })),
);

/** Whether Export and Print are offered for `docId`: in every format but Ink, whose own exports come later. */
export function useOffersOutput(docId: string): boolean {
  const store = useServices().openScriptStore(docId);
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe("script.format", listener),
    [store],
  );
  const format = useSyncExternalStore(subscribe, () =>
    store.get("script.format"),
  );
  return format !== "ink";
}

// nothing is drawn while the frame loads
function ExportBody(props: SendFormProps): ReactNode {
  return (
    <Suspense fallback={null}>
      <LazyExport docId={props.docId} />
    </Suspense>
  );
}

export const exportForm: SendForm = {
  id: "export",
  useAvailable: useOffersOutput,
  Body: ExportBody,
};
