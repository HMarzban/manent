import { expect, test } from "bun:test";
import { createDoc, jsonMap } from "@manent/crdt";
import { indexDocId } from "@manent/sync-protocol";
import { warmChecksContext } from "../src/checks/checks-context.ts";
import { readDemoCached } from "../src/demo/use-demo.ts";
import {
  clearOutlineLinkCache,
  resolveOutlineDocId,
  watchOutlineLink,
} from "../src/outline-doc/outline-link.ts";
import {
  createCachedApi,
  createDocRequestDeduper,
  invalidateApiCache,
  routeConfirmMe,
} from "../src/services/api-cache.ts";
import { fakeApi, testServices } from "./services.fixtures.ts";
import { fakeHandle, turn } from "./sync.fixtures.ts";

test("a route profile check hands its answer once to the session cache and never caches refusals or seeding", async () => {
  let calls = 0;
  const api = fakeApi({
    me: async () => {
      calls += 1;
      return {
        ok: true,
        me: {
          userId: "dana",
          name: "Dana Reyes",
          workspaces: [{ id: "small", name: "Small", seeding: null }],
        },
      };
    },
  });
  const first = await routeConfirmMe(api, "tok-1");
  const cached = createCachedApi(api, { token: "tok-1" });
  const [second, third] = await Promise.all([cached.me(), cached.me()]);
  expect([calls, first.ok, second, third]).toEqual([1, true, first, first]);

  // a fresh PersonServices instance after handoff was consumed asks the server again
  const nextInstance = createCachedApi(api, { token: "tok-1" });
  await nextInstance.me();
  expect(calls).toBe(2);

  // { ok: false } answers are never cached
  let failCalls = 0;
  const failApi = fakeApi({
    me: async () => {
      failCalls += 1;
      return { ok: false, reason: "unreachable" };
    },
  });
  const failCached = createCachedApi(failApi, { token: "tok-fail" });
  expect(await failCached.me()).toEqual({ ok: false, reason: "unreachable" });
  expect(await failCached.me()).toEqual({ ok: false, reason: "unreachable" });
  expect(failCalls).toBe(2);

  // seeding answers are never cached
  let seedCalls = 0;
  const seedApi = fakeApi({
    me: async () => {
      seedCalls += 1;
      return {
        ok: true,
        me: {
          userId: "dana",
          name: "Dana Reyes",
          workspaces: [
            {
              id: "heavy",
              name: "Lanternfield",
              seeding: { done: 1, total: 10, failed: false },
            },
          ],
        },
      };
    },
  });
  const seedCached = createCachedApi(seedApi, { token: "tok-seed" });
  await seedCached.me();
  await seedCached.me();
  expect(seedCalls).toBe(2);

  // a rejected in-flight route handoff clears meInFlight so the next call recovers
  let rejectCalls = 0;
  const deferred = Promise.withResolvers<never>();
  const recoveringApi = fakeApi({
    me: () => {
      rejectCalls += 1;
      if (rejectCalls === 1) return deferred.promise;
      return Promise.resolve({
        ok: true,
        me: {
          userId: "dana",
          name: "Dana Reyes",
          workspaces: [{ id: "small", name: "Small", seeding: null }],
        },
      });
    },
  });
  const routePending = routeConfirmMe(recoveringApi, "tok-rej");
  const recoveringCached = createCachedApi(recoveringApi, { token: "tok-rej" });
  const joinedPending = recoveringCached.me();
  const settled = Promise.allSettled([routePending, joinedPending]);
  deferred.reject(new Error("network offline"));
  const [routeOutcome, joinedOutcome] = await settled;
  expect(routeOutcome.status).toBe("rejected");
  expect(joinedOutcome.status).toBe("rejected");
  const recovered = await recoveringCached.me();
  expect([rejectCalls, recovered.ok]).toEqual([2, true]);

  invalidateApiCache({ api, token: "tok-1" });
});

test("concurrent and repeated role checks share one request per session without caching missing roles", async () => {
  let calls = 0;
  const answers: ("edit" | null)[] = ["edit", null, "edit"];
  const api = fakeApi({
    role: async () => {
      calls += 1;
      return answers.shift() ?? null;
    },
  });
  const cached = createCachedApi(api, { token: "tok-role" });
  const [a, b] = await Promise.all([
    cached.role("doc-1"),
    cached.role("doc-1"),
  ]);
  const c = await cached.role("doc-1");
  expect([calls, a, b, c]).toEqual([1, "edit", "edit", "edit"]);

  // null role is never cached
  expect(await cached.role("doc-2")).toBeNull();
  expect(await cached.role("doc-2")).toBe("edit");
  expect(calls).toBe(3);
});

test("identical session-scoped document lookups share one request and clear on invalidation", async () => {
  const dedupePeople = createDocRequestDeduper<{ people: string[] }>();
  let calls = 0;
  const run = async () => {
    calls += 1;
    return { people: ["dana"] };
  };
  const [first, second] = await Promise.all([
    dedupePeople("people:d1", "tok-p", run, () => true),
    dedupePeople("people:d1", "tok-p", run, () => true),
  ]);
  expect([calls, first, second]).toEqual([
    1,
    { people: ["dana"] },
    { people: ["dana"] },
  ]);
  invalidateApiCache({ token: "tok-p" });
  await dedupePeople("people:d1", "tok-p", run, () => true);
  expect(calls).toBe(2);
  invalidateApiCache({ token: "tok-p" });
});

test("concurrent demo status checks share one server request", async () => {
  let calls = 0;
  const api = fakeApi({
    demo: async () => {
      calls += 1;
      return { demo: true, seedId: "seed-1", control: null };
    },
  });
  const [a, b] = await Promise.all([readDemoCached(api), readDemoCached(api)]);
  expect([calls, a?.seedId, b?.seedId]).toEqual([1, "seed-1", "seed-1"]);
});

test("outline link lookup and checks warm-up close every handle and project index they open", async () => {
  clearOutlineLinkCache();
  const base = testServices({
    userId: "dana",
    api: fakeApi({
      me: async () => ({
        ok: true,
        me: {
          userId: "dana",
          name: "Dana Reyes",
          workspaces: [
            { id: "ws-other", name: "Other", seeding: null },
            { id: "ws-hit", name: "Hit", seeding: null },
          ],
        },
      }),
    }),
  });
  const closedHandles: string[] = [];
  const closedProjects: string[] = [];
  const otherWsDoc = createDoc({ clientId: 1 });
  const hitWsDoc = createDoc({ clientId: 2 });
  jsonMap(hitWsDoc, "projects").set("proj-1", {
    title: "Film",
    kind: "film",
    createdAt: 1,
    createdByUserId: "dana",
  });
  jsonMap(hitWsDoc, "documents").set("script-1", {
    projectId: "proj-1",
    title: "Script",
    kind: "script",
    createdAt: 1,
    editedAt: null,
    editedByUserId: null,
  });
  jsonMap(hitWsDoc, "documents").set("outline-1", {
    projectId: "proj-1",
    title: "Outline",
    kind: "outline",
    createdAt: 1,
    editedAt: null,
    editedByUserId: null,
  });
  const projectDoc = createDoc({ clientId: 3 });

  const services = {
    ...base,
    async openHandle(docId: string) {
      const doc =
        docId === indexDocId("workspace", "ws-hit") ? hitWsDoc : otherWsDoc;
      const h = fakeHandle(docId, doc);
      return {
        ...h,
        async close() {
          closedHandles.push(docId);
          await h.close();
        },
      };
    },
    projectIndex(projectId: string) {
      const h = fakeHandle(indexDocId("project", projectId), projectDoc);
      return {
        projectId,
        handle: async () => h,
        map: async (name: string) => jsonMap(projectDoc, name),
        async close() {
          closedProjects.push(projectId);
        },
      };
    },
  };

  expect(await resolveOutlineDocId(services, "script-1")).toBe("outline-1");
  expect(closedHandles).toEqual([
    indexDocId("workspace", "ws-other"),
    indexDocId("workspace", "ws-hit"),
  ]);

  closedHandles.length = 0;
  const stop = watchOutlineLink({
    services,
    scriptDocId: "script-1",
    canWrite: () => true,
    onChange: () => {},
  });
  await turn();
  await turn();
  stop();
  expect(closedHandles).toEqual([
    indexDocId("workspace", "ws-other"),
    indexDocId("workspace", "ws-hit"),
  ]);

  // warmChecksContext closes its one-shot projectIndex handle
  const warmServices = {
    ...services,
    library: {
      ...services.library,
      documentProject: () => ({
        get: () => "proj-1",
        subscribe: () => () => {},
      }),
    },
  };
  warmChecksContext("script-1", warmServices);
  await turn();
  await turn();
  expect(closedProjects).toEqual(["proj-1"]);
  base.dispose();
});
