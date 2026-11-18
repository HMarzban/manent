// The process the crash test kills: it appends in transactions and reports each one only after it has committed.
import { openSqliteStorage } from "../src/index.ts";
import { DOC, HOME, doc } from "./raw.ts";

if (import.meta.main) {
  const [dir = "", round = "0"] = process.argv.slice(2);
  const f = openSqliteStorage({ dir, now: () => 1_000 }).open(HOME);
  f.log.create(doc(DOC));
  // the sizes are a function of the round, so a failing round can be run again
  let x = Number(round) + 1;
  const next = () => (x = (x * 48_271) % 2_147_483_647);
  for (;;) {
    const count = 1 + (next() % 8);
    const seq = f.transaction(() => {
      let last = 0;
      for (let i = 0; i < count; i++) {
        const update = new Uint8Array(20 + (next() % 1_981)).fill(i);
        last = f.log.append({
          docId: DOC,
          generation: 1,
          update,
          userId: "sam",
          origin: "edit",
          clocks: [{ clientId: 7, clock: i }],
        });
      }
      return last;
    });
    process.stdout.write(`committed ${seq}\n`);
  }
}
