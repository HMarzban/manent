// Which script's Hand in view the History tab shows; null while none is shown.
import { createValue } from "@manent/ui";

export const handInShown = createValue<string | null>(null);
