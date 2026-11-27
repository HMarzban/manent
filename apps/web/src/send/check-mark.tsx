// The mark drawn before a check's sentence on a Send form: a tick for a check that passed, a warning for one that
// needs attention. It is an icon, never text, so the sentence alone is what is read.
import { CheckIcon, TriangleExclamationPointIcon } from "lucide-react";
import type { ReactNode } from "react";

export function CheckMark(props: { ok: boolean }): ReactNode {
  return props.ok ? (
    <CheckIcon aria-hidden="true" className="mt-0.5 size-icon shrink-0" />
  ) : (
    <TriangleExclamationPointIcon
      aria-hidden="true"
      className="mt-0.5 size-icon shrink-0 text-attention"
    />
  );
}
