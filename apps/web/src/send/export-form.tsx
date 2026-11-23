// The Send screen's Export form, loaded with the screen; the body of the document's kind loads apart from it. Also
// what both forms read of a document: the file types and What options it is offered.
import { SEND_WORDS, Segmented } from "@manent/ui";
import { useRouterState } from "@tanstack/react-router";
import {
  Suspense,
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { useDocKind } from "../screens/document/document-screen.tsx";
import type { SendFormId } from "../screens/send/form-ids.ts";
import type { SendForm, SendFormProps } from "../screens/send/forms.ts";
import type { SendRow } from "../screens/send/send-frame.tsx";
import { useServices } from "../services/context.tsx";
import { useProductionContext } from "../state/production-context.store.ts";
import { typesOffered } from "./file-types.ts";
import type { OfferedTo } from "./file-types.ts";
import { sendBodyOf } from "./kind-bodies.ts";
import { whatOffered } from "./what-options.ts";
import type { SendWhatOption } from "./what-options.ts";

/** A hook: what decides the file types and What options `docId` is offered. */
export function useOfferedTo(docId: string): OfferedTo {
  const docKind = useDocKind(docId);
  const store = useServices().openScriptStore(docId);
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe("script.format", listener),
    [store],
  );
  const format = useSyncExternalStore(subscribe, () =>
    store.get("script.format"),
  );
  const locked = useProductionContext(docId)?.locked === true;
  return useMemo(
    () => ({ docKind, format, locked }),
    [docKind, format, locked],
  );
}

/** A hook: the value of `name` in the address's search; null when it has none. */
export function useSearchChoice(name: "as" | "what"): string | null {
  const searchStr = useRouterState({
    select: (state): string => state.location.searchStr,
  });
  return new URLSearchParams(searchStr).get(name);
}

/**
 * A hook: `form`'s What row for the file type `fileTypeId` (null: none chosen), and the option chosen in it. The
 * address's `what` is chosen first when the form offers it, else the first option offered; one option is said, more
 * are a choice. Null with no option offered.
 */
export function useWhatRow(
  form: SendFormId,
  fileTypeId: string | null,
  locked: boolean,
): { option: SendWhatOption; row: SendRow } | null {
  const asked = useSearchChoice("what");
  const [chosenId, choose] = useState(asked);
  const offered = whatOffered(form, fileTypeId, locked);
  const option =
    offered.find((entry) => entry.id === chosenId) ?? offered[0] ?? null;
  if (option === null) return null;
  const content =
    offered.length === 1 ? (
      <span data-tour="send:what">{option.label}</span>
    ) : (
      <div data-tour="send:what">
        <Segmented
          label={SEND_WORDS.what}
          value={option.id}
          options={offered.map(({ id, label }) => ({ value: id, label }))}
          onChange={choose}
        />
      </div>
    );
  return { option, row: { id: "what", content } };
}

function useOffersExport(docId: string): boolean {
  return typesOffered("export", useOfferedTo(docId)).length > 0;
}

// nothing is drawn while the body loads
function ExportBody(props: SendFormProps): ReactNode {
  const { Export } = sendBodyOf(useDocKind(props.docId));
  return (
    <Suspense fallback={null}>
      <Export docId={props.docId} />
    </Suspense>
  );
}

export const exportForm: SendForm = {
  id: "export",
  useAvailable: useOffersExport,
  Body: ExportBody,
};
