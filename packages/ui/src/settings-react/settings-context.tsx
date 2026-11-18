// The settings store, handed down the tree once.
import type { SettingsStore } from "@manent/settings";
import { createContext, useContext } from "react";
import type { ReactNode } from "react";

const SettingsContext = createContext<SettingsStore | null>(null);

/** Holds `store` for every setting hook below; the store's identity never changes, so nothing re-renders through it. */
export function SettingsProvider(props: {
  store: SettingsStore;
  children: ReactNode;
}): ReactNode {
  return (
    <SettingsContext.Provider value={props.store}>
      {props.children}
    </SettingsContext.Provider>
  );
}

/** The store of the nearest SettingsProvider; throws a TypeError outside one. */
export function useSettingsStore(): SettingsStore {
  const store = useContext(SettingsContext);
  if (store === null)
    throw new TypeError("a setting was read outside a SettingsProvider");
  return store;
}
