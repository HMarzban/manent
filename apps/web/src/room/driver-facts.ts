// The state bar's "⟨name⟩ is driving · Pitch · Take keys" while someone else drives this script for an editor.
import type { StateFact } from "@manent/ui";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useServices } from "../services/context.tsx";
import {
  canEditDriverDoc,
  currentDriver,
  firstNameOf,
  subscribeDriver,
  watchDriver,
} from "./driver.ts";

const NO_FACTS: readonly StateFact[] = Object.freeze([]);
const NO_SUBSCRIBE = (): (() => void) => () => {};

/** Watches `docId`'s driver and returns the `driving` state-bar fact while someone else drives and this person can edit. */
export function useDriverFacts(docId: string): readonly StateFact[] {
  const services = useServices();
  useEffect(
    () => watchDriver(docId, services, { emitMessages: true }),
    [docId, services],
  );
  const subscribe = useMemo(
    () =>
      docId === ""
        ? NO_SUBSCRIBE
        : (listener: () => void) =>
            subscribeDriver(services.userId, docId, listener),
    [services.userId, docId],
  );
  const driver = useSyncExternalStore(subscribe, () =>
    currentDriver(services.userId, docId),
  );
  const canEdit = useSyncExternalStore(subscribe, () =>
    canEditDriverDoc(services.userId, docId),
  );
  return useMemo(
    () =>
      driver === null || driver.userId === services.userId || !canEdit
        ? NO_FACTS
        : [{ kind: "driving", name: firstNameOf(driver.name) }],
    [driver, services.userId, canEdit],
  );
}
