// Starts web-only PWA listeners and syncs the calm update notice when a new build is waiting.
import { useSubscribable } from "@manent/ui";
import { useEffect, useRef } from "react";
import { useEnvironment, useServices } from "../services/context.tsx";
import { startWebPwa, syncWebUpdateNotice } from "./install.ts";

/** Wires web-only PWA install/file-launch listeners and non-modal update notifications inside AppShell. */
export function useWebPwa(): void {
  const { where, updateState } = useEnvironment();
  const { messages } = useServices();
  const update = useSubscribable(updateState);
  const notified = useRef(false);
  useEffect(() => {
    if (where.shell === "web") startWebPwa();
  }, [where.shell]);
  useEffect(() => {
    if (where.shell !== "web") return;
    syncWebUpdateNotice({
      ready: update === "ready",
      notified,
      messages,
    });
  }, [where.shell, update, messages]);
}
