// Lanternfield Studios: its index, its roles and its forty projects, their histories replayed in one time order.
import { scriptBody } from "@manent/crdt";
import { projectHome } from "@manent/sync-protocol";
import { SeedBuildError } from "../../generate/guide.ts";
import { GENERATED_MEMBERS } from "../../people/members.ts";
import { HEAVY_DOCS, HEAVY_PROJECTS } from "../catalogue-heavy.ts";
import type { SeedDoc, SeedProject } from "../catalogue.ts";
import { SeedDriverError } from "../driver.ts";
import type { SeedDriver, SeedProduction, SeedSession } from "../driver.ts";
import type { SeedContext, SeedEntry, SeedStep } from "../seed.ts";
import { HALF_HOUR_MS } from "../time.ts";
import type { HistoryStep, Sessions } from "./studio-content.ts";
import { append, overflow, writeBook } from "./studio-pages.ts";
import type { Playback, Script, Studio } from "./studio-pages.ts";

type Act = () => Promise<unknown> | void;
type Add = (at: number, act: Act) => void;

const SIGNE = "signe-vestergaard";
// how the driver words the server's refusal of a revision someone has issued already
const REFUSED = "409 already_issued";
const PRIYA = {
  userId: "priya",
  role: "edit",
  capabilities: ["issue_revisions", "lock_page_numbers"],
} as const;
// the projects whose drafts Dana names
const DANA_NAMES = ["H24", "H25"];

/** Rewrites one written action with one the script does not hold. */
async function revise({ context, studio, script }: Playback, s: SeedSession) {
  const { rng } = context;
  const { doc, blocks } = script;
  const actions = blocks.flatMap((b, n) =>
    n < script.written && b.element === "action" ? [n] : [],
  );
  const held = new Set(blocks.map((b) => b.text));
  const action = studio.revisedAction(doc, held, rng);
  if (action === null || actions.length === 0) return;
  const at = rng.pick(actions);
  const [id, old] = [script.ids[at]!, blocks[at]!.text];
  blocks[at] = action;
  await s.change((d) =>
    scriptBody(d).write((w) => {
      w.deleteText(id, 0, old.length);
      w.insertText(id, 0, action.text);
    }),
  );
}

/** One person's issue, and another's identical request beside it, which the server refuses as already issued. */
async function race(
  production: SeedProduction,
  doc: SeedDoc,
  by: readonly [string, string],
  where: string,
) {
  const issue = (userId: string) => production.issue(userId, doc.docId, "");
  const [first, second] = await Promise.allSettled(by.map(issue));
  if (first?.status === "rejected") throw first.reason;
  const reason: unknown = second?.status === "rejected" ? second.reason : null;
  if (!(reason instanceof SeedDriverError && reason.detail.endsWith(REFUSED)))
    throw new SeedBuildError("rules_broken", `${where}: ${by}`);
}

/** The script's format, set in its first session; a screenplay's is the default, and an Ink story has none. */
async function setFormat(context: SeedContext, s: SeedSession, doc: SeedDoc) {
  if (doc.format === "screenplay" || doc.kind === "ink") return;
  if (!context.driver?.capabilities.has("settings"))
    return context.skip("settings", `the format of ${doc.title}`);
  if ((await s.set("script.format", doc.format)) === "refused")
    throw new SeedDriverError("refused", `the format of ${doc.title}`);
}

/** One session by `by`, which sets the script's format when nothing is written yet. */
const session =
  (
    { context, driver, script }: Playback,
    by: string,
    fn: (s: SeedSession) => Promise<void>,
  ): Act =>
  async () => {
    const opened = await driver.open(by, script.doc.docId);
    if (script.written === 0) await setFormat(context, opened, script.doc);
    await fn(opened);
    await opened.close();
  };

/** The step's sessions at their times, each by one of `writers`. */
function sessionsOf(
  p: Playback,
  step: Sessions,
  writers: readonly string[],
  add: Add,
  fn: (s: SeedSession, n: number) => Promise<void>,
): void {
  const { time, rng } = p.context;
  for (const [n, at] of p.studio.sessionTimes(time, rng, step).entries())
    add(
      at,
      session(p, rng.pick(writers), (s) => fn(s, n)),
    );
}

/** A production action, skipped while the driver has none. */
const produce =
  (
    { context, driver, script }: Playback,
    what: string,
    act: (production: SeedProduction) => Promise<unknown>,
  ): Act =>
  () =>
    driver.production === null
      ? context.skip("production", `${what}, ${script.doc.title}`)
      : act(driver.production);

/** How many blocks each write session of `history` adds, in document order. */
function countsOf(p: Playback, history: readonly HistoryStep[]): number[] {
  const total = history.reduce(
    (n, step) => n + (step.op === "write" ? step.sessions : 0),
    0,
  );
  return total === 0 ? [] : p.studio.writeCounts(p.script.blocks, total);
}

/** The document's history as timed actions, each one person's: its editors write, `namer` names its drafts. */
function plan(
  p: Playback,
  people: {
    history: readonly HistoryStep[];
    writers: readonly string[];
    namer: string;
  },
  add: Add,
): void {
  const { context, driver, studio, script } = p;
  const { doc } = script;
  const { writers } = people;
  const counts = countsOf(p, people.history);
  const at = (day: number, clock: string) =>
    studio.dayAt(context.time, day, clock);
  const where = studio.guideOf(doc)?.project ?? doc.key;
  for (const step of people.history)
    switch (step.op) {
      case "write": {
        const own = counts.splice(0, step.sessions);
        sessionsOf(p, step, writers, add, (s, n) => append(s, script, own[n]!));
        break;
      }
      case "revise":
        sessionsOf(p, step, writers, add, (s) => revise(p, s));
        break;
      case "overflow":
        add(
          at(step.day, "18:00"),
          session(p, context.rng.pick(writers), (s) =>
            overflow(p, s, step, where),
          ),
        );
        break;
      case "book":
        add(
          at(step.day, "09:00"),
          session(p, SIGNE, (s) => writeBook(p, s)),
        );
        break;
      case "name":
        add(at(step.day, "18:00"), () =>
          driver.capabilities.has("history")
            ? driver.nameDraft(people.namer, doc.docId, step.draft)
            : context.skip("history", `name ${step.draft}, ${doc.title}`),
        );
        break;
      case "lock":
      case "issue": {
        const { op, by } = step;
        add(
          at(step.day, "18:00"),
          produce(p, `${op} ${by}`, (pr) =>
            op === "lock"
              ? pr.lock(by, doc.docId)
              : pr.issue(by, doc.docId, ""),
          ),
        );
        break;
      }
      case "race": {
        const by = [step.by, step.refused] as const;
        add(
          at(step.day, step.clock),
          produce(p, `race ${by.join(" ")}`, (pr) => race(pr, doc, by, where)),
        );
        break;
      }
    }
}

/** The project's documents in its home and its entry in the index; the long book's author edits it alone. */
async function create(driver: SeedDriver, project: SeedProject, at: number) {
  const docs = HEAVY_DOCS.filter((d) => d.projectKey === project.key);
  const home = projectHome(project.projectId);
  const book = project.key === "heavy/h33";
  const author = GENERATED_MEMBERS.find((m) => book && m.userId === SIGNE);
  if (author)
    await driver.workspace("dana", "heavy", [{ ...author, role: "edit" }]);
  for (const { docId, kind } of docs)
    await driver.create("dana", { docId, kind, home, workspaceId: "heavy" });
  if (author) await driver.workspace("dana", "heavy", [author]);
  const entries = { projects: [project], documents: docs, at };
  await driver.index("dana", "heavy", entries);
}

/**
 * The projects created and indexed in catalogue order before the first action, then every project's history
 * replayed in time order; progress after each project's last action.
 */
async function replay(
  context: SeedContext,
  driver: SeedDriver,
  studio: Studio,
) {
  const timeline: { at: number; project: number; act: Act }[] = [];
  for (const [p, project] of HEAVY_PROJECTS.entries()) {
    const code = studio.codeOf(project.key);
    const writers = GENERATED_MEMBERS.filter(
      (m) => m.role === "edit" && m.activeOn.includes(code),
    ).map((m) => m.userId);
    const namer = DANA_NAMES.includes(code) ? "dana" : writers[0]!;
    const add: Add = (at, act) => timeline.push({ at, project: p, act });
    const docs = HEAVY_DOCS.filter((d) => d.projectKey === project.key);
    for (const [i, doc] of docs.entries()) {
      const blocks = studio.blocksOf(doc, i, context.rng);
      const ids = blocks.map(() => context.ids());
      const script: Script = { doc, blocks, ids, written: 0 };
      const history = studio.historyOf(doc, i, context.rng);
      const playback = { context, driver, studio, script };
      plan(playback, { history, writers, namer }, add);
    }
  }
  const ordered = timeline.toSorted((a, b) => a.at - b.at);
  const createdAt = ordered[0]!.at - HALF_HOUR_MS;
  await driver.setTime(createdAt);
  const members = GENERATED_MEMBERS.filter((m) => m.workspaceId === "heavy");
  await driver.workspace("dana", "heavy", [PRIYA, ...members]);
  for (const project of HEAVY_PROJECTS)
    await create(driver, project, createdAt);
  // a project is done at its last action in time order
  const last = new Map(ordered.map((t, n) => [t.project, n]));
  let done = 0;
  for (const [n, { at, project, act }] of ordered.entries()) {
    await driver.setTime(at);
    await act();
    if (last.get(project) === n) context.report(++done, HEAVY_PROJECTS.length);
  }
}

export const STUDIO: SeedStep = {
  id: "studio",
  workspace: "heavy",
  background: true,
  run: async (context): Promise<SeedEntry[]> => {
    if (context.driver !== null)
      await replay(
        context,
        context.driver,
        await import("./studio-content.ts"),
      );
    return HEAVY_PROJECTS.map((project) => ({
      project: project.title,
      documents: HEAVY_DOCS.filter((d) => d.projectKey === project.key).length,
    }));
  },
};
