import type { ReactNode } from "react";
import type { SendForm } from "../screens/send/forms.ts";

function SendDraftBody(): ReactNode {
  return null;
}

export const sendDraftForm: SendForm = {
  id: "send_draft",
  useAvailable: () => false,
  Body: SendDraftBody,
};
