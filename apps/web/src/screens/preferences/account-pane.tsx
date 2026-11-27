// Preferences → Account: who you are, where your preferences are kept, and Sign out, inside a raised card.
import { DEMO_PEOPLE } from "@manent/demo";
import {
  CommandButton,
  PREFERENCES_WORDS,
  useCommandState,
  useSubscribable,
} from "@manent/ui";
import type { ReactNode } from "react";
import { SignOutDialogHost } from "../../account/sign-out-dialog.tsx";
import { useServices } from "../../services/context.tsx";
import { SettingsCard } from "../../settings-shell/settings-card.tsx";

/** In the demo, the person and their title, read-only, with Switch person. */
function DemoPerson(): ReactNode {
  const { userId } = useServices();
  const person = DEMO_PEOPLE.find((p) => p.userId === userId);
  return (
    <div className="flex min-h-row-2 flex-wrap items-center justify-between gap-4 px-4 py-3">
      {person === undefined ? null : (
        <div className="flex min-w-0 flex-col">
          <span className="text-ui font-medium text-fg">{person.name}</span>
          <span className="text-meta text-fg-muted">{person.title}</span>
        </div>
      )}
      <CommandButton id="app.switchPerson" variant="outline" />
    </div>
  );
}

export function AccountPane(): ReactNode {
  const services = useServices();
  const demo = useCommandState("app.switchPerson").visible;
  const signedOut = useCommandState("app.signInToSync").visible;
  const synced = useSubscribable(services.privateIndexSynced());
  return (
    <>
      <SettingsCard divided>
        {demo ? <DemoPerson /> : null}
        {signedOut ? (
          <div className="flex min-h-row-2 flex-wrap items-center justify-between gap-4 px-4 py-3">
            <p className="text-ui text-fg-muted">
              {PREFERENCES_WORDS.accountNotSignedIn}
            </p>
            <CommandButton id="app.signInToSync" variant="outline" />
          </div>
        ) : (
          <div className="flex min-h-row-2 flex-wrap items-center justify-between gap-4 px-4 py-3">
            <p className="text-ui text-fg-muted">
              {PREFERENCES_WORDS.accountSaved(synced ? "synced" : "waiting")}
            </p>
            <CommandButton id="app.signOut" variant="outline" />
          </div>
        )}
      </SettingsCard>
      <SignOutDialogHost />
    </>
  );
}
