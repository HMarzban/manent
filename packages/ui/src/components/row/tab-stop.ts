// Whether a row is its list's one Tab stop: null outside a list, where every activatable row is a stop.
import { createContext } from "react";

export const RowTabStop = createContext<boolean | null>(null);
