// The people of a production world and what each may do; the ten-page script they work on, three
// scenes a page, each a heading and eight one-line actions; and what the server's routes answer them.
import { scriptBody } from "@manent/crdt";
import type { Rng } from "@manent/demo";
import { blocksOf } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import type {
  HistoryService,
  ProductionOutcome,
  ProductionService,
} from "@manent/server-core";
import type { MemoryStorage } from "@manent/storage/testing";
import {
  COLOUR_ORDER_IDS,
  ISSUE_FILES,
  NUMBERING_SCHEMES,
  PAGE_OPS,
} from "@manent/sync-protocol";
import type {
  Capability,
  IssueRequest,
  LockRequest,
  PagesRequest,
} from "@manent/sync-protocol";
import type { SimClient } from "../sync/index.ts";

/** Pages of the script as it is written. */
export const SCRIPT_PAGES = 10;
const SCENES_PER_PAGE = 3;
const ACTIONS = 8;
/** What each bout of typing adds to the end of an action. */
const WORD = " rain";

const NAMES: Readonly<Record<string, string>> = Object.freeze({
  priya: "Priya Nair",
  dana: "Dana Reyes",
  sam: "Sam Okafor",
});

/** What a person may do on the script beyond editing it: Priya coordinates, Dana may issue. */
const CAPABILITIES: Readonly<Record<string, readonly Capability[]>> =
  Object.freeze({
    priya: ["lock_page_numbers", "issue_revisions"],
    dana: ["issue_revisions"],
  });

/** The name the server gives a person; their user id for someone it does not know. */
export const personName = (userId: string): string => NAMES[userId] ?? userId;

/** Each of `people` with a part edits the script with that part's capabilities; the others keep their roles. */
export function setRoles(
  storage: MemoryStorage,
  docId: string,
  people: readonly string[],
): void {
  for (const userId of people) {
    const capabilities = CAPABILITIES[userId];
    if (capabilities !== undefined)
      storage.directory.setRole(docId, userId, "edit", [...capabilities]);
  }
}

const headingId = (scene: number): string => `heading-${scene}`;
const actionId = (scene: number, line: number): string =>
  `action-${scene}-${line}`;

const textBlock = (id: string, type: string, text: string): BlockJSON => ({
  type: "block",
  attrs: { id, type },
  content: [{ type: "text", text }],
});

function scriptBlocks(): BlockJSON[] {
  const scenes = SCRIPT_PAGES * SCENES_PER_PAGE;
  return Array.from({ length: scenes }, (_, i) => i + 1).flatMap((scene) => [
    textBlock(
      headingId(scene),
      "scene_heading",
      `INT. SIGNAL BOX ${scene} - NIGHT`,
    ),
    ...Array.from({ length: ACTIONS }, (__, j) =>
      textBlock(
        actionId(scene, j + 1),
        "action",
        `Sleet ticks on the glass, ${scene}.${j + 1}`,
      ),
    ),
  ]);
}

/** The client replaces whatever the script holds with the ten pages. */
export function writeScript(client: SimClient): void {
  const held = blocksOf(scriptBody(client.handle.doc()).materialize());
  client.write((w) => {
    for (const block of held)
      if (block.attrs.id !== null) w.deleteBlock(block.attrs.id);
    w.insertBlocks(null, scriptBlocks());
  });
}

/** The client types a word at the end of an action `rng` picks on `page` as written; the action's id. */
export function typeOnPage(client: SimClient, page: number, rng: Rng): string {
  if (!Number.isInteger(page) || page < 1 || page > SCRIPT_PAGES)
    throw new RangeError(`a page must be 1 to ${SCRIPT_PAGES}, not ${page}`);
  const scene = (page - 1) * SCENES_PER_PAGE + rng.int(1, SCENES_PER_PAGE);
  const id = actionId(scene, rng.int(1, ACTIONS));
  const block = blocksOf(scriptBody(client.handle.doc()).materialize()).find(
    (held) => held.attrs.id === id,
  );
  if (block === undefined)
    throw new RangeError(`${client.device} holds no action ${id}`);
  const at = block.runs.reduce((length, run) => length + run.text.length, 0);
  client.write((w) => w.insertText(id, at, WORD));
  return id;
}

/** A request as HTTP carries it: a POST's body as JSON text, a GET's query in its path. */
export type LineRequest =
  | { method: "POST"; path: string; body: string }
  | { method: "GET"; path: string };

export interface LineAnswer {
  status: number;
  /** The JSON the route answered, parsed. */
  body: unknown;
}

/** The services every server of a production world hooks in. */
export interface WorldServices {
  history: HistoryService;
  production: ProductionService;
}

type Fields = Record<string, unknown>;
type Route = (
  production: ProductionService,
  userId: string,
  body: Fields,
) => Promise<ProductionOutcome<unknown>> | null;

const isFields = (value: unknown): value is Fields =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isStrings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const memberOf = <T extends string>(list: readonly T[], value: unknown) =>
  list.find((member) => member === value) ?? null;

const copy = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

const refusal = (status: number, error: string): LineAnswer => ({
  status,
  body: { error, issued: null },
});

function readMutating(body: Fields): { docId: string; key: string } | null {
  const { docId, key } = body;
  return typeof docId === "string" && typeof key === "string"
    ? { docId, key }
    : null;
}

function readLock(body: Fields): LockRequest | null {
  const mutating = readMutating(body);
  const numbering = memberOf(NUMBERING_SCHEMES, body.numbering);
  const colourOrder = memberOf(COLOUR_ORDER_IDS, body.colourOrder);
  const { lockedOn } = body;
  if (mutating === null || numbering === null || colourOrder === null)
    return null;
  return typeof lockedOn === "string"
    ? { ...mutating, numbering, colourOrder, lockedOn }
    : null;
}

function readPages(body: Fields): PagesRequest | null {
  const mutating = readMutating(body);
  const op = memberOf(PAGE_OPS, body.op);
  const { labels, label } = body;
  if (mutating === null || op === null || !isStrings(labels)) return null;
  return label === null || typeof label === "string"
    ? { ...mutating, op, labels, label }
    : null;
}

function readIssue(body: Fields): IssueRequest | null {
  const mutating = readMutating(body);
  const { what, expectedOrdinal, pages, recipientUserIds, files } = body;
  const { tint, memo, issuedOn } = body;
  if (mutating === null || (what !== "changed" && what !== "full")) return null;
  if (typeof expectedOrdinal !== "number" || !isStrings(files)) return null;
  const read = files.flatMap((file) => memberOf(ISSUE_FILES, file) ?? []);
  if (read.length !== files.length || !isStrings(pages)) return null;
  if (!isStrings(recipientUserIds) || typeof tint !== "boolean") return null;
  if (typeof memo !== "string" || typeof issuedOn !== "string") return null;
  const sending = {
    pages,
    files: read,
    tint,
    recipientUserIds,
    memo,
    issuedOn,
  };
  return { ...mutating, what, expectedOrdinal, ...sending };
}

/** Each POST route the world's clients use: null for a body it does not read. */
const ROUTES: Readonly<Record<string, Route>> = Object.freeze({
  "/api/production/state": (production, userId, { docId }) =>
    typeof docId === "string"
      ? Promise.resolve(production.state(userId, docId))
      : null,
  "/api/production/lock": (production, userId, body) => {
    const request = readLock(body);
    return request === null ? null : production.lock(userId, request);
  },
  "/api/production/pages": (production, userId, body) => {
    const request = readPages(body);
    return request === null ? null : production.pages(userId, request);
  },
  "/api/production/unlock": (production, userId, body) => {
    const request = readMutating(body);
    return request === null ? null : production.unlock(userId, request);
  },
  "/api/production/issue": (production, userId, body) => {
    const request = readIssue(body);
    return request === null ? null : production.issue(userId, request);
  },
});

/** A version's content, as `GET /api/versions/content?docId=…&versionId=…` answers it. */
async function versionContentAnswer(
  history: HistoryService,
  userId: string,
  path: string,
): Promise<LineAnswer> {
  const url = new URL(path, "http://line");
  if (url.pathname !== "/api/versions/content")
    return refusal(404, "not_found");
  const docId = url.searchParams.get("docId");
  const versionId = url.searchParams.get("versionId");
  if (docId === null || versionId === null) return refusal(400, "bad_request");
  const outcome = await history.content(userId, docId, { versionId });
  // the client asks again after any answer but 200
  if (!outcome.ok) return refusal(404, outcome.code);
  return { status: 200, body: copy(outcome.value) };
}

/** What the server's routes answer `userId`'s request with, for every path the world's clients use. */
export async function answerRequest(
  services: WorldServices,
  userId: string,
  request: LineRequest,
): Promise<LineAnswer> {
  if (request.method === "GET")
    return versionContentAnswer(services.history, userId, request.path);
  const route = ROUTES[request.path];
  if (route === undefined) return refusal(404, "not_found");
  const body: unknown = JSON.parse(request.body);
  const asked = isFields(body)
    ? route(services.production, userId, body)
    : null;
  if (asked === null) return refusal(400, "bad_request");
  const outcome = await asked;
  return outcome.ok
    ? { status: 200, body: copy(outcome.value) }
    : { status: outcome.status, body: copy(outcome.body) };
}
