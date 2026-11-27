// Contextual script format cue in the status bar: hidden on standard screenplays, quiet tag for specialised formats.
import { Button, formatSettingValue } from "@manent/ui";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { openDetailsAt } from "./details-tab.tsx";

/** Shows a quiet format tag in the status bar for non-screenplay formats; opens Details → Script on click. */
export function FormatReadout(props: { docId: string }): ReactNode {
  const { docId } = props;
  const services = useServices();
  const { frame } = useEnvironment();
  const scriptStore = useMemo(
    () => services.openScriptStore(docId),
    [services, docId],
  );
  const subscribeFormat = useCallback(
    (listener: () => void) => scriptStore.subscribe("script.format", listener),
    [scriptStore],
  );
  const format = useSyncExternalStore(
    subscribeFormat,
    () => scriptStore.get("script.format"),
    () => scriptStore.get("script.format"),
  );
  if (format === "screenplay") return null;
  const formatLabel = formatSettingValue("script.format", format);
  return (
    <Button
      variant="ghost"
      size="sm"
      data-tour="readout:format"
      className="shrink-0 max-md:hidden"
      onClick={() => openDetailsAt("script", frame)}
    >
      <span className="mn-tag">{formatLabel}</span>
    </Button>
  );
}
