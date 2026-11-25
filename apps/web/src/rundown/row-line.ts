// The Library Continue row's second line for a rundown: formatted broadcast date and air time.
import { observeRundown, readRundown } from "@manent/crdt";
import type { DocHandle } from "@manent/sync-client";
import { RUNDOWN_WORDS, formatTime, useSubscribable } from "@manent/ui";
import { useEffect, useMemo, useState } from "react";
import type { DocumentRowLine } from "../screens/library/document-row-lines.ts";
import { useEnvironment, useServices } from "../services/context.tsx";
import { formatAirDate } from "./dur-format.ts";

function useRundownLine(docId: string): string | null {
  const services = useServices();
  const { now } = useEnvironment();
  const kindSource = useMemo(
    () => services.library.docKindOf(docId),
    [services.library, docId],
  );
  const isRundown = useSubscribable(kindSource) === "rundown";
  const [fields, setFields] = useState<{
    readonly airDate: string;
    readonly airAt: number | null;
  } | null>(null);

  useEffect(() => {
    if (!isRundown) {
      setFields(null);
      return undefined;
    }
    let live = true;
    let stopDoc = (): void => {};
    let opened: DocHandle | null = null;
    void services
      .openHandle(docId)
      .then((handle) => {
        if (!live) {
          void handle.close();
          return;
        }
        opened = handle;
        const read = (): void => {
          if (!live) return;
          const { airDate, airAt } = readRundown(handle.doc()).rundown;
          setFields({ airDate, airAt });
        };
        read();
        stopDoc = observeRundown(handle.doc(), read);
      })
      .catch(() => {
        // handle unavailable offline: fall back to project and kind
      });
    return () => {
      live = false;
      stopDoc();
      if (opened !== null) void opened.close();
    };
  }, [services, docId, isRundown]);

  if (!isRundown || fields === null) return null;
  const date =
    fields.airDate === "" ? "" : formatAirDate(fields.airDate, now());
  const air = fields.airAt === null ? "" : formatTime(fields.airAt);
  return date !== "" && air !== ""
    ? RUNDOWN_WORDS.continueMeta(date, air)
    : null;
}

export const rundownRowLine: DocumentRowLine = Object.freeze({
  id: "rundown",
  useLine: useRundownLine,
});
