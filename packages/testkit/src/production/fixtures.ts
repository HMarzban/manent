// The people of a production world and what each may do; the ten-page script they work on, three
// scenes a page, each a heading and eight one-line actions; and the server whose routes answer them.
import { scriptBody } from "@manent/crdt";
import type { Rng } from "@manent/demo";
import { blocksOf } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import {
  createServer,
  createSignedSessionStore,
  createTicketStore,
} from "@manent/server-core";
import type {
  Clock,
  HistoryService,
  ProductionService,
} from "@manent/server-core";
import {
  createFakeDirectory,
  createFakeSignIn,
} from "@manent/server-core/testing";
import type { MemoryStorage } from "@manent/storage/testing";
import type { Capability, ServerVersions } from "@manent/sync-protocol";
import type { SimClient } from "../sync/index.ts";

/** Pages of the script as it is written. */
export const SCRIPT_PAGES = 10;
const SCENES_PER_PAGE = 3;
const ACTIONS = 8;
/**
 * What each bout of typing adds to the end of an action. An action is at most 17 characters as
 * written, so it takes eight words before it passes the action's 60 and wraps onto a second line.
 */
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
        `Sleet ticks, ${scene}.${j + 1}`,
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

/** The services every server of a production world hooks in. */
export interface WorldServices {
  history: HistoryService;
  production: ProductionService;
}

/** Where the world's clients reach the server's routes. */
export const LINE_ORIGIN = "http://manent.test";

/** The server's routes over `services`, for the people of the world, each signed in with a session. */
export interface WorldServer {
  /** The route's answer; it rejects only for a request that asks to become a socket. */
  fetch(request: Request): Promise<Response>;
  /** The session token `userId` signs their requests with. */
  tokenOf(userId: string): string;
}

const NOT_A_SOCKET = Object.freeze({ remoteAddress: "", upgrade: () => false });

export function createWorldServer(options: {
  services: WorldServices;
  storage: MemoryStorage;
  clock: Clock;
  versions: ServerVersions;
  people: readonly string[];
}): WorldServer {
  const { services, storage, clock, versions } = options;
  const users = options.people.map((userId) => ({
    userId,
    name: personName(userId),
  }));
  const sessions = createSignedSessionStore({
    secret: new Uint8Array(32).fill(7),
    now: clock.now,
  });
  const server = createServer({
    http: {
      allowedHosts: [new URL(LINE_ORIGIN).host],
      openUrl: LINE_ORIGIN,
      webDir: null,
    },
    auth: {
      signIn: createFakeSignIn(users),
      directory: createFakeDirectory(
        users.map((user) => ({ user, workspaces: [] })),
      ),
      sessions,
    },
    demo: null,
    socket: {
      tickets: createTicketStore({ now: clock.now }),
      versions,
      allowedOrigins: [LINE_ORIGIN],
    },
    // the history routes answer only a server that serves documents; this one's sync service is never
    // reached, the world's serves every frame
    sync: {
      storage,
      clock,
      defer: (fn) => fn(),
      ids: () => {
        throw new RangeError("the world's server makes no version");
      },
    },
    history: services.history,
    production: services.production,
  });
  const tokens = new Map(
    users.map(({ userId }) => [userId, sessions.issue(userId)]),
  );
  return {
    async fetch(request) {
      const response = await server.fetch(request, NOT_A_SOCKET);
      if (response === null)
        throw new TypeError(`${request.url} asked for a socket`);
      return response;
    },
    tokenOf(userId) {
      const token = tokens.get(userId);
      if (token === undefined) throw new RangeError(`no session of ${userId}`);
      return token;
    },
  };
}
