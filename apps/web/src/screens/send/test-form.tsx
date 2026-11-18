// A form for the test build only: its title, its button and its rows are read from the address, so it holds no words.
import { useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { SendForm } from "./forms.ts";
import { SEND_ROW_IDS, SendFrame } from "./send-frame.tsx";
import type { SendAction } from "./send-frame.tsx";

/** `?title=…&button=…`, and one parameter per row it draws, named by the row's id and holding its text. */
function TestFormBody(): ReactNode {
  const searchStr = useRouterState({
    select: (state): string => state.location.searchStr,
  });
  const search = new URLSearchParams(searchStr);
  const label = search.get("button") ?? "";
  const rows = SEND_ROW_IDS.flatMap((id) => {
    const content = search.get(id);
    return content === null ? [] : [{ id, content }];
  });
  const action: SendAction = {
    label,
    // the test form is never busy: its button sends nothing
    busyLabel: label,
    busy: false,
    disabledReason: null,
    problem: null,
    progress: null,
    cancel: null,
    run: () => {},
  };
  return (
    <SendFrame
      title={search.get("title") ?? ""}
      aside={null}
      rows={rows}
      pages={null}
      action={action}
    />
  );
}

// a plain literal, so that a production build, which never names it, leaves it out
export const testSendForm: SendForm = {
  id: "send_draft",
  useAvailable: () => true,
  Body: TestFormBody,
};
