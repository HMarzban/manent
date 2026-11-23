// The documents the person has put in Trash, and taking them out again.
import type { Api } from "../api.ts";

export interface Trash {}

/** A Trash that holds nothing. */
export function createTrash(_options: { api: Api }): Trash {
  return {};
}
