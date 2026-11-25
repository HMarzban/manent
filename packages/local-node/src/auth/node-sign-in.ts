// Choosing a person on the desktop: the injected provider decides, and the node remembers who is here.
import type { SessionStore, SignInProvider } from "@manent/server-core";
import { ConnectError } from "@manent/sync-client";
import type { CloudApi } from "../node/ports.ts";
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

/** Tracks cloud sign-ins triggered on person choice so concurrent mirrors wait for the token. */
export function createCloudSessions(options: {
  cloud: Pick<CloudApi, "signIn">;
  records: NodeRecords;
  tokenOf: (userId: string) => string | null;
  onSignedIn: (userId: string) => void;
}): {
  signIn(person: Person): Promise<string | null>;
  chosen(person: Person): void;
  reauthenticate(userId: string): Promise<string | null>;
  invalidate(): void;
  waitToken(userId: string): Promise<string | null>;
} {
  const { cloud, records, tokenOf, onSignedIn } = options;
  const pending = new Map<string, Promise<string | null>>();
  let epoch = 0;

  async function signIn(person: Person): Promise<string | null> {
    const started = epoch;
    let signed;
    try {
      signed = await cloud.signIn(person.userId);
    } catch (error) {
      if (!(error instanceof ConnectError)) throw error;
      return null;
    }
    if (!signed.ok || started !== epoch) return null;
    const latest = records.person(person.userId) ?? person;
    records.savePerson({
      ...latest,
      wantsCloud: true,
      cloudToken: signed.token,
    });
    return signed.token;
  }

  function start(person: Person): Promise<string | null> {
    const running = pending.get(person.userId);
    if (running !== undefined) return running;
    const run = signIn(person).then(
      (token) => {
        if (token !== null) onSignedIn(person.userId);
        return token;
      },
      () => null,
    );
    pending.set(person.userId, run);
    void run.finally(() => {
      if (pending.get(person.userId) === run) pending.delete(person.userId);
    });
    return run;
  }

  return {
    signIn,
    chosen(person) {
      if (!person.wantsCloud) return;
      if (person.cloudToken !== null) return onSignedIn(person.userId);
      void start(person);
    },
    async reauthenticate(userId) {
      const running = pending.get(userId);
      if (running !== undefined) return running;
      const person = records.person(userId);
      if (person === null || !person.wantsCloud) return null;
      const cleared: Person = { ...person, cloudToken: null };
      records.savePerson(cleared);
      return start(cleared);
    },
    invalidate() {
      epoch += 1;
      pending.clear();
      for (const person of records.people()) {
        if (person.cloudToken !== null)
          records.savePerson({ ...person, cloudToken: null });
      }
    },
    async waitToken(userId) {
      const existing = tokenOf(userId);
      if (existing !== null) return existing;
      const running = pending.get(userId);
      if (running !== undefined) return running;
      const person = records.person(userId);
      if (person === null || !person.wantsCloud) return null;
      return start(person);
    },
  };
}
