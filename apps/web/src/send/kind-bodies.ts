// What the Export and Print forms draw for a document of each kind; a kind adds its line here.
import type { DocKind } from "@manent/sync-protocol";
import { lazy } from "react";
import type { ComponentType } from "react";
import type { SendFormProps } from "../screens/send/forms.ts";

export interface SendKindBody {
  readonly kind: DocKind;
  readonly Export: ComponentType<SendFormProps>;
  readonly Print: ComponentType<SendFormProps>;
}

// a script's frames, the pages and the PDF writer load apart from the forms
const SCRIPT_BODY: SendKindBody = {
  kind: "script",
  Export: lazy(async () => ({
    default: (await import("./export-frame.tsx")).LiveExport,
  })),
  Print: lazy(async () => ({
    default: (await import("./print-frame.tsx")).LivePrint,
  })),
};

/** A kind with no line gets the script's body. */
export const SEND_KIND_BODIES: readonly SendKindBody[] = [SCRIPT_BODY];

/** The body of a document of `kind`. */
export function sendBodyOf(kind: DocKind): SendKindBody {
  return SEND_KIND_BODIES.find((body) => body.kind === kind) ?? SCRIPT_BODY;
}
