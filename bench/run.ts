// `bun run bench [--quick | --full] [--prove] [--filter <text>]` runs the suite; `--child <file>`
// is the harness's own way to run one scenario in a fresh process; `bun run bench fetch-traces`
// downloads the editing traces.

import { fetchTraces } from "./corpus/traces.ts";
import { runChild, runSuite } from "./harness.ts";
import { readQuiet } from "./measure.ts";
import { readResultFile } from "./result.ts";

function optionValue(args: readonly string[], name: string): string | null {
  const at = args.indexOf(name);
  if (at === -1) return null;
  const value = args[at + 1];
  if (value === undefined) throw new Error(`${name} needs a value`);
  return value;
}

function modeOf(args: readonly string[]): "quick" | "standard" | "full" {
  if (args.includes("--quick")) return "quick";
  return args.includes("--full") ? "full" : "standard";
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args[0] === "fetch-traces") {
    const fetched = await fetchTraces({ dir: "bench/corpus/traces", fetch });
    for (const { name, reason } of fetched)
      console.log(
        reason === null
          ? `${name} fetched`
          : `${name} could not be fetched: ${reason}`,
      );
    process.exit(fetched.every((f) => f.ok) ? 0 : 1);
  }
  const child = optionValue(args, "--child");
  if (child !== null) {
    await runChild(child);
    process.exit(0);
  }
  const result = await runSuite({
    root: "bench",
    outDir: "bench/results",
    filter: optionValue(args, "--filter") ?? undefined,
    mode: modeOf(args),
    prove: args.includes("--prove"),
    quiet: readQuiet,
  });
  const file = await readResultFile(result.file);
  const { tier, throttle, mode } = file.environment;
  const measured = file.scenarios.filter((s) => s.outcome === "measured");
  console.log(`Tier: ${tier} · ${throttle}x · ${mode}`);
  console.log(
    `${result.scenarios} scenarios: ${measured.length} measured, ${result.failed} could not finish, ${result.notMeasured} not measured, ${result.void} void`,
  );
  for (const s of file.scenarios)
    if (s.outcome === "failed")
      console.log(
        `${s.id} could not finish: ${s.output.trimEnd().split("\n").at(-1) ?? ""}`,
      );
  for (const row of result.unmatched)
    console.log(`${row} has a budget and no scenario`);
  for (const row of result.unproved)
    console.log(
      `${row} cannot fail its budget: its samples do not pass through the shared measuring path`,
    );
  console.log(`Results: ${result.file}`);
  const broken =
    result.failed > 0 ||
    result.unproved.length > 0 ||
    result.unmatched.length > 0;
  if (broken) process.exit(1);
}
