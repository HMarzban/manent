// One keystroke through the write path, from the PUSH to its ACK, at 120 and at 2,000 pages.
import { fakeClock } from "@manent/server-core/testing";
import { createMemoryStorage } from "@manent/storage/testing";
import type { Measurement, Scenario } from "../harness.ts";
import {
  HOME,
  OWNER,
  createBenchPeer,
  createBenchService,
  createKeystrokes,
  docIdOf,
  firstBlockOf,
  joinAsEditor,
  placeScript,
  scriptOfPages,
  stateOf,
} from "./support.ts";

const KEYSTROKES = 200;
/** Four keystrokes a second, so the connection's frame bucket never runs dry. */
const BETWEEN_KEYSTROKES_MS = 250;
const TYPIST_CLIENT = 1001;

function pushTimes(pages: number): number[] {
  const clock = fakeClock(1_000);
  const storage = createMemoryStorage({ now: clock.clock.now });
  const service = createBenchService({
    storage,
    clock: clock.clock,
    defer: clock.defer,
  });
  const script = scriptOfPages(pages);
  const docId = docIdOf(0);
  const state = stateOf(script);
  placeScript(service, storage, { docId, home: HOME, state, editors: [] });
  const keystrokes = createKeystrokes({
    docId,
    state,
    clientId: TYPIST_CLIENT,
    blockId: firstBlockOf(script),
  });
  const answers: { at: number; refused: string | null }[] = [];
  const peer = createBenchPeer(OWNER, (message) => {
    if (message.type === "ACK")
      answers.push({ at: performance.now(), refused: null });
    if (message.type === "ERROR")
      answers.push({ at: performance.now(), refused: message.message });
  });
  joinAsEditor(service, peer, {
    docId,
    clientId: TYPIST_CLIENT,
    vector: keystrokes.vector,
  });
  return Array.from({ length: KEYSTROKES }, (_, n) => {
    const push = keystrokes.next();
    const sentAt = performance.now();
    service.receive(peer, push);
    clock.runDeferred();
    const answer = answers.at(n);
    if (answer === undefined || answer.refused !== null)
      throw new Error(
        `keystroke ${n + 1} at ${pages} pages was answered ${answer?.refused ?? "nothing"}`,
      );
    clock.advance(BETWEEN_KEYSTROKES_MS);
    return answer.at - sentAt;
  });
}

const scenario: Scenario = {
  id: "server.push-cost",
  workload: null,
  processes: 5,
  async run(): Promise<Measurement[]> {
    return [
      { metric: "push_ms_120", unit: "ms", samples: pushTimes(120) },
      { metric: "push_ms_2000", unit: "ms", samples: pushTimes(2000) },
    ];
  },
};

export default scenario;
