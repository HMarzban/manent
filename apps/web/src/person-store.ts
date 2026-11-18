// The only holder of the tab's person.

import { create } from "zustand";
import type { StoreApi, UseBoundStore } from "zustand";
import { readPerson, writePerson } from "./session.ts";
import type { TabPerson, TabStorage } from "./session.ts";

export interface PersonState {
  person: TabPerson | null;
  setPerson(person: TabPerson | null): void;
}

export type PersonStore = UseBoundStore<StoreApi<PersonState>>;

/** The tab's person, read from `storage` and kept there so a reload restores it. */
export function createPersonStore(storage: TabStorage | null): PersonStore {
  return create<PersonState>((set) => ({
    person: readPerson(storage),
    setPerson(person) {
      writePerson(storage, person);
      set({ person });
    },
  }));
}
