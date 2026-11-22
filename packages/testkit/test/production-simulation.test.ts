import { expect, test } from "bun:test";
import { createRng } from "@manent/demo";
import { memoText } from "@manent/revisions";
import type { RequestOutcome } from "@manent/sync-client";
import type {
  IssueRequest,
  LockRequest,
  ProductionState,
  RevisionSetView,
} from "@manent/sync-protocol";
import { SCRIPT_PAGES, createProductionWorld } from "../src/index.ts";
import type { ProductionWorld, SimClient } from "../src/index.ts";

const SEEDS = Number(process.env.MANENT_SIM_SEEDS ?? 25);
const LONG = { timeout: 600_000 };
const PEOPLE = ["priya", "dana", "sam"] as const;
const COORDINATORS = ["priya", "dana"] as const;
const NAMES: Readonly<Record<(typeof COORDINATORS)[number], string>> = {
  priya: "Priya Nair",
  dana: "Dana Reyes",
};
const DAY = "2026-11-16";
const LOCK: Omit<LockRequest, "docId" | "key"> = {
  numbering: "suffix",
  colourOrder: "standard",
  lockedOn: "2026-11-02",
};
/** Settles needed at most for one request to be answered. */
const MAX_SETTLES = 10;
/** Issues in a row in the idempotence run. */
const ROUNDS = 3;
/** Words typed between two production requests. */
const TYPED = 6;

let made = 0;
/** A request key no other request of any world has used. */
function freshKey(): string {
  made += 1;
  return made.toString(16).padStart(32, "0");
}

const forSeeds = async (run: (world: ProductionWorld) => Promise<void>) => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    const world = await createProductionWorld({ seed, people: PEOPLE });
    await run(world);
    await world.settle();
    world.check();
  }
};

/** The value `answer` settles with once the world has run far enough to answer it. */
async function answered<T>(w: ProductionWorld, answer: Promise<T>): Promise<T> {
  const held: { value: T }[] = [];
  void answer.then((value) => held.push({ value }));
  for (let i = 0; i < MAX_SETTLES && held.length === 0; i++) await w.settle();
  const [first] = held;
  if (first === undefined) throw new RangeError(`seed ${w.seed}: no answer`);
  return first.value;
}

function clientOf(w: ProductionWorld, userId: string): SimClient {
  const found = w.clients.find((c) => c.userId === userId);
  if (found === undefined) throw new RangeError(`no client of ${userId}`);
  return found;
}

function setNamed(state: ProductionState, name: string): RevisionSetView {
  const found = state.sets.find((set) => set.name === name);
  if (found === undefined) throw new RangeError(`no revision ${name}`);
  return found;
}

function valueOf<T>(w: ProductionWorld, outcome: RequestOutcome<T>): T {
  if (!outcome.ok) throw new RangeError(`seed ${w.seed}: ${outcome.code}`);
  return outcome.value;
}

/** A world of Priya, Dana and Sam, locked by Priya: Blue is the active revision. */
async function lockedWorld(w: ProductionWorld): Promise<void> {
  valueOf(w, await answered(w, w.productionOf("priya").lock(LOCK)));
}

/** What `userId`'s Send screen asks to issue: the revision their device holds, the pages the server would send. */
function issueRequest(
  w: ProductionWorld,
  userId: string,
): Omit<IssueRequest, "docId"> {
  const active = w.productionOf(userId).current().get()?.state.sets.at(-1);
  if (active === undefined) throw new RangeError(`${userId} sees no revision`);
  const { pages } = w.activeRevision();
  return {
    key: freshKey(),
    expectedOrdinal: active.ordinal,
    what: "changed",
    pages,
    files: ["pdf_marked"],
    tint: false,
    recipientUserIds: ["dana", "sam"],
    memo: memoText(active.name, DAY, pages),
    issuedOn: DAY,
  };
}

const issue = (
  w: ProductionWorld,
  userId: string,
  request: Omit<IssueRequest, "docId">,
) => w.productionOf(userId).issue(request);

test(
  "two coordinators issuing at once: exactly one issue, and the other is told who",
  LONG,
  async () => {
    await forSeeds(async (w) => {
      await lockedWorld(w);
      w.faults({ reorder: 0.5 });
      w.typeOnPage("sam", 4);
      await w.settle();
      const asks = COORDINATORS.map((userId) =>
        issue(w, userId, issueRequest(w, userId)),
      );
      const outcomes = await answered(w, Promise.all(asks));
      const won = COORDINATORS.flatMap((userId, i) => {
        const outcome = outcomes[i];
        return outcome?.ok ? [{ userId, issue: outcome.value.issue }] : [];
      });
      const [first] = won;
      if (first === undefined)
        throw new RangeError(`seed ${w.seed}: nothing issued`);
      expect(won.map((one) => one.userId)).toEqual([first.userId]);
      expect(outcomes.find((outcome) => !outcome.ok)).toEqual({
        ok: false,
        code: "already_issued",
        body: {
          error: "already_issued",
          issued: {
            name: "Blue",
            byName: NAMES[first.userId],
            issuedAt: first.issue.issuedAt,
            nextName: "Pink",
          },
        },
      });
      expect(w.serverState().issues.map((i) => i.issueId)).toEqual([
        first.issue.issueId,
      ]);
    });
  },
);

test(
  "an issue whose answer is lost is retried and applied once",
  LONG,
  async () => {
    await forSeeds(async (w) => {
      await lockedWorld(w);
      w.typeOnPage("dana", 6);
      await w.settle();
      const request = issueRequest(w, "priya");
      w.loseNextAnswer("priya");
      const { issue: issued } = valueOf(
        w,
        await answered(w, issue(w, "priya", request)),
      );
      const state = w.serverState();
      expect(state.issues).toEqual([issued]);
      expect(state.sets.map((set) => set.name)).toEqual([
        "White",
        "Blue",
        "Pink",
      ]);
    });
  },
);

test(
  "an offline writer's edits arrive after an issue and are marked in the next revision",
  LONG,
  async () => {
    await forSeeds(async (w) => {
      await lockedWorld(w);
      const sam = clientOf(w, "sam");
      sam.online(false);
      await w.settle();
      const samTyped = w.typeOnPage("sam", 9);
      const danaTyped = w.typeOnPage("dana", 3);
      await w.settle();
      valueOf(
        w,
        await answered(w, issue(w, "priya", issueRequest(w, "priya"))),
      );
      sam.online(true);
      await w.settle();
      const blue = setNamed(w.serverState(), "Blue");
      expect(blue.blocks.map((block) => block.blockId)).toEqual([danaTyped]);
      const { marks, pages } = w.activeRevision();
      expect([...marks.keys()]).toEqual([samTyped]);
      expect(pages).toEqual(["9"]);
    });
  },
);

test(
  "a writer who was offline across an issue sees the new revision on return, and is told once",
  LONG,
  async () => {
    await forSeeds(async (w) => {
      await lockedWorld(w);
      const sam = clientOf(w, "sam");
      const samProduction = w.productionOf("sam");
      const told: unknown[] = [];
      samProduction.issuedWhileOffline().subscribe((value) => {
        if (value !== null) told.push(value);
      });
      sam.online(false);
      await w.settle();
      w.typeOnPage("sam", 9);
      w.typeOnPage("dana", 3);
      await w.settle();
      valueOf(
        w,
        await answered(w, issue(w, "priya", issueRequest(w, "priya"))),
      );
      sam.online(true);
      await w.settle();
      const held = samProduction.current().get();
      const blue = setNamed(w.serverState(), "Blue");
      expect(held?.state.sets.at(-1)?.name).toBe("Pink");
      if (blue.issuedVersionId === null)
        throw new RangeError(`seed ${w.seed}: Blue was never issued`);
      expect(held?.baseline?.versionId).toBe(blue.issuedVersionId);
      const offline = { byName: "Priya Nair", name: "Blue", active: "Pink" };
      expect(samProduction.issuedWhileOffline().get()).toEqual(offline);
      sam.online(false);
      await w.settle();
      w.typeOnPage("sam", 2);
      sam.online(true);
      await w.settle();
      expect(told).toEqual([offline]);
    });
  },
);

test(
  "issuing is idempotent under duplicated and reordered delivery",
  LONG,
  async () => {
    await forSeeds(async (w) => {
      await lockedWorld(w);
      const rng = createRng(w.seed);
      w.faults({ duplicate: rng.next() * 0.5, reorder: rng.next() });
      const accepted: string[] = [];
      for (let round = 0; round < ROUNDS; round++) {
        w.typeOnPage(rng.pick(PEOPLE), rng.int(1, SCRIPT_PAGES));
        await w.settle();
        // the issuer presses one, two or three times under one key; the other coordinator may press once
        const issuer = rng.pick(COORDINATORS);
        const request = issueRequest(w, issuer);
        const sent = Array.from({ length: rng.int(1, 3) }, () => ({
          userId: issuer,
          request,
        }));
        const rival = issuer === "priya" ? "dana" : "priya";
        if (rng.next() < 0.5)
          sent.push({ userId: rival, request: issueRequest(w, rival) });
        const asks = sent.map(({ userId, request: r }) => issue(w, userId, r));
        const outcomes = await answered(w, Promise.all(asks));
        const answers = outcomes.map((o, i) => ({
          key: sent[i]?.request.key,
          answer: o.ok ? o.value.issue.issueId : o.code,
        }));
        const issued = outcomes.find((o) => o.ok)?.value.issue.issueId;
        if (issued === undefined)
          throw new RangeError(`seed ${w.seed}: nothing issued`);
        const winner = answers.find((a) => a.answer === issued)?.key;
        expect(answers).toEqual(
          answers.map(({ key }) => ({
            key,
            answer: key === winner ? issued : "already_issued",
          })),
        );
        accepted.push(issued);
      }
      const stored = w.serverState().issues.map((i) => i.issueId);
      expect(stored.toSorted()).toEqual(accepted.toSorted());
    });
  },
);

test(
  "locking and unlocking while three people type leaves every client on the server's pages",
  LONG,
  async () => {
    await forSeeds(async (w) => {
      const rng = createRng(w.seed);
      const priya = w.productionOf("priya");
      const typing = (): void => {
        for (let i = 0; i < TYPED; i++)
          w.typeOnPage(rng.pick(PEOPLE), rng.int(1, SCRIPT_PAGES));
      };
      const onServersPages = (): void => {
        const { anchors } = w.serverState();
        for (const userId of PEOPLE) {
          expect(w.productionOf(userId).current().get()?.state.anchors).toEqual(
            anchors,
          );
          expect(w.labelsOf(userId)).toEqual(w.serverLabels());
        }
      };
      typing();
      const lock = priya.lock(LOCK);
      typing();
      valueOf(w, await answered(w, lock));
      onServersPages();
      const { label } = rng.pick(w.serverState().anchors);
      typing();
      const pages = priya.pages({ op: "unlock", labels: [label], label: null });
      typing();
      valueOf(w, await answered(w, pages));
      onServersPages();
      typing();
      const unlock = priya.unlock();
      typing();
      valueOf(w, await answered(w, unlock));
      onServersPages();
    });
  },
);

test(
  "an issue while three people type issues what the screen stated, or is answered changed",
  LONG,
  async () => {
    await forSeeds(async (w) => {
      await lockedWorld(w);
      const rng = createRng(w.seed);
      const revised = rng.int(1, SCRIPT_PAGES);
      w.typeOnPage("sam", revised);
      await w.settle();
      const issuer = rng.pick(COORDINATORS);
      const request = issueRequest(w, issuer);
      const onRevised: boolean[] = [];
      const typeSomewhere = (userId: string): void => {
        const page = rng.next() < 0.5 ? revised : rng.int(1, SCRIPT_PAGES);
        onRevised.push(page === revised);
        w.typeOnPage(userId, page);
      };
      // some typing reaches the server before the button is pressed, and some races the issue
      for (const userId of PEOPLE) typeSomewhere(userId);
      await w.settle();
      const answer = issue(w, issuer, request);
      for (const userId of PEOPLE) typeSomewhere(userId);
      const outcome = await answered(w, answer);
      if (onRevised.every(Boolean)) expect(outcome.ok).toBe(true);
      const { issues } = w.serverState();
      if (outcome.ok) {
        expect(issues.map((i) => [i.issueId, i.pages])).toEqual([
          [outcome.value.issue.issueId, request.pages],
        ]);
        return;
      }
      expect(outcome.code).toBe("changed");
      expect(issues).toEqual([]);
      expect(w.activeRevision().pages).not.toEqual(request.pages);
    });
  },
);
