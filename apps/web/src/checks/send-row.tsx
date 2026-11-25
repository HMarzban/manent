// The Checks row every Send form shows at its top: the list Details → Script → Checks shows.
import type { SendRow } from "../screens/send/send-frame.tsx";
import { ChecksList, findChecks } from "./checks-list.tsx";

/** What the script's checks find now, or the sentence saying nothing needs a look. It walks the script: never on a keystroke. */
export function checksRow(docId: string): SendRow {
  return { id: "checks", content: <ChecksList checks={findChecks(docId)} /> };
}
