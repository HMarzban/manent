import {
  createFakeDirectory,
  createFakeSignIn,
  directoryContract,
  signInContract,
} from "../src/testing/index.ts";

const LEO = { userId: "leo", name: "Leo Marsh" };
const ROOM = { id: "medium", name: "Writers' room", seeding: null };

signInContract(() => ({
  provider: createFakeSignIn([LEO]),
  known: { body: { userId: "leo" }, identity: LEO },
  unknownBody: { userId: "mallory" },
  malformed: [null, [], "leo", { userId: 7 }, {}],
}));

directoryContract(() => ({
  directory: createFakeDirectory([{ user: LEO, workspaces: [ROOM] }]),
  known: { identity: LEO, workspaces: [ROOM] },
}));
