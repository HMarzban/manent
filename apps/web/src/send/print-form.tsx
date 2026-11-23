// The Send screen's Print form; the body of the document's kind and the print view load apart from the entry.
import { Suspense } from "react";
import type { ReactNode } from "react";
import { useDocKind } from "../screens/document/document-screen.tsx";
import type { SendForm, SendFormProps } from "../screens/send/forms.ts";
import { useOfferedTo } from "./export-form.tsx";
import { typesPrinted } from "./file-types.ts";
import { sendBodyOf } from "./kind-bodies.ts";

function useOffersPrint(docId: string): boolean {
  return typesPrinted(useOfferedTo(docId)).length > 0;
}

// nothing is drawn while the body loads
function PrintBody(props: SendFormProps): ReactNode {
  const { Print } = sendBodyOf(useDocKind(props.docId));
  return (
    <Suspense fallback={null}>
      <Print docId={props.docId} />
    </Suspense>
  );
}

export const printForm: SendForm = {
  id: "print",
  useAvailable: useOffersPrint,
  Body: PrintBody,
};
