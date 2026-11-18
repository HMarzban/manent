// The contexts through which what the bridge publishes reaches components; the composition root provides them.

import { createContext } from "react";
import type { FactsSelectors } from "./facts.store.ts";
import type { OutlineSelectors } from "./outline.store.ts";
import type { PeopleSelectors } from "./people.store.ts";

export const FactsContext = createContext<FactsSelectors | null>(null);
export const OutlineContext = createContext<OutlineSelectors | null>(null);
export const PeopleContext = createContext<PeopleSelectors | null>(null);
