// `bun run bench [--filter <text>]` runs the suite; `--child <file>` is the
// harness's own way to run one scenario in a fresh process.

import { RUN_TIER, runChild, runSuite } from "./harness.ts";

function optionValue(args: readonly string[], name: string): string | null {
  const at = args.indexOf(name);
  if (at === -1) return null;
  const value = args[at + 1];
  if (value === undefined) throw new Error(`${name} needs a value`);
  return value;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const child = optionValue(args, "--child");
  if (child !== null) {
    await runChild(child);
    process.exit(0);
  }
  const result = await runSuite({
    root: "bench",
    outDir: "bench/results",
    filter: optionValue(args, "--filter") ?? undefined,
  });
  console.log(`Tier: ${RUN_TIER}`);
  console.log(
    `${result.scenarios} ${result.scenarios === 1 ? "scenario" : "scenarios"}`,
  );
  console.log(`Results: ${result.file}`);
  if (result.hardFails > 0) process.exit(1);
}
