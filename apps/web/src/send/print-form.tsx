// The Send screen's Print form; its frame and the print view load apart from the entry.
import { Suspense, lazy } from "react";
import type { ReactNode } from "react";
import type { SendForm, SendFormProps } from "../screens/send/forms.ts";
import { useOffersOutput } from "./export-form.tsx";

const LazyPrint = lazy(() =>
  import("./print-frame.tsx").then((loaded) => ({
    default: loaded.LivePrint,
  })),
);

// nothing is drawn while the frame loads
function PrintBody(props: SendFormProps): ReactNode {
  return (
    <Suspense fallback={null}>
      <LazyPrint docId={props.docId} />
    </Suspense>
  );
}

export const printForm: SendForm = {
  id: "print",
  useAvailable: useOffersOutput,
  Body: PrintBody,
};
