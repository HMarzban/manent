// The question a restore asks before it runs, drawn by the History tab as the consequence dialog while it is not null.
import { createValue } from "@manent/ui";
import type { Subscribable } from "@manent/ui";

export interface RestoreRequest {
  title: string;
  body: string;
  action: string;
  /** The line of a restore the server refused; null the first time it is asked. */
  refusal: string | null;
}

interface RestoreQuestion extends RestoreRequest {
  answer(restore: boolean): void;
}

const asked = createValue<RestoreQuestion | null>(null);

export const restoreQuestion: Subscribable<RestoreQuestion | null> = asked;

/** Asks `request`, answering true when the person chooses the action and false when they cancel. */
export function askRestore(request: RestoreRequest): Promise<boolean> {
  return new Promise((resolve) =>
    asked.set({
      ...request,
      answer(restore) {
        asked.set(null);
        resolve(restore);
      },
    }),
  );
}
