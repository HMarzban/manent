// Preferences → Account: who you are, and where your preferences are kept.
import { DEMO_PEOPLE } from "@manent/demo";
import { CommandButton, PREFERENCES_WORDS, useCommandState } from "@manent/ui";
import type { ReactNode } from "react";
import { useServices } from "../../services/context.tsx";

/** In the demo, the person and their title, read-only, with Switch person. */
function DemoPerson(): ReactNode {
  const { userId } = useServices();
  const person = DEMO_PEOPLE.find((p) => p.userId === userId);
  return (
    <div className="flex min-h-row-2 items-center justify-between gap-4">
      {person === undefined ? null : (
        <div className="flex flex-col">
          <span className="text-ui font-medium">{person.name}</span>
          <span className="text-meta text-fg-muted">{person.title}</span>
        </div>
      )}
      <CommandButton id="app.switchPerson" variant="outline" />
    </div>
  );
}

export function AccountPane(): ReactNode {
  const demo = useCommandState("app.switchPerson").visible;
  const signedOut = useCommandState("app.signInToSync").visible;
  return (
    <>
      {demo ? <DemoPerson /> : null}
      {signedOut ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-ui">{PREFERENCES_WORDS.accountNotSignedIn}</p>
          <CommandButton id="app.signInToSync" variant="outline" />
        </div>
      ) : (
        // until sync says they have reached the account
        <p className="text-ui">{PREFERENCES_WORDS.accountSaved("waiting")}</p>
      )}
    </>
  );
}
