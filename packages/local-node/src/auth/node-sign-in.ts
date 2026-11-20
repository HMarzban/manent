// Choosing a person on the desktop: the injected provider decides, and the node remembers who is here.
import type { SessionStore, SignInProvider } from "@manent/server-core";
import type { NodeRecords, Person } from "../records/ports.ts";

/**
 * The injected provider, with what a successful choice leaves on the node: the person saved (`wantsCloud` once
 * their choice is registered, or once they asked to sync; an existing `cloudToken` kept), made current with a
 * node token from `sessions`, then `onChosen`. `describe()` is the provider's own.
 */
export function createNodeSignIn(options: {
  provider: SignInProvider;
  records: NodeRecords;
  sessions: SessionStore;
  now: () => number;
  onChosen(person: Person): void;
}): SignInProvider {
  const { provider, records, sessions } = options;
  return {
    describe: () => provider.describe(),
    async authenticate(body) {
      const attempt = await provider.authenticate(body);
      if (!attempt.ok) return attempt;
      const { userId, name } = attempt.identity;
      const registered = provider
        .describe()
        .choices.some(
          (choice) => choice.userId === userId && choice.registered,
        );
      const before = records.person(userId);
      const person: Person = {
        userId,
        name,
        wantsCloud: registered || before?.wantsCloud === true,
        cloudToken: before?.cloudToken ?? null,
        chosenAt: options.now(),
      };
      records.savePerson(person);
      records.setCurrent(userId, sessions.issue(userId));
      options.onChosen(person);
      return attempt;
    },
  };
}
