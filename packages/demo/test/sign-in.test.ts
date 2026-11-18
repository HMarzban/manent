import { directoryContract, signInContract } from "@manent/server-core/testing";
import { createDemoDirectory, createDemoSignIn } from "../src/index.ts";

signInContract(() => ({
  provider: createDemoSignIn(),
  known: {
    body: { userId: "leo" },
    identity: { userId: "leo", name: "Leo Marsh" },
  },
  unknownBody: { userId: "mallory" },
  malformed: [null, [], "leo", { userId: 7 }, {}],
}));

directoryContract(() => ({
  directory: createDemoDirectory(),
  known: {
    identity: { userId: "leo", name: "Leo Marsh" },
    workspaces: [{ id: "medium", name: "Writers' room", seeding: null }],
  },
}));
