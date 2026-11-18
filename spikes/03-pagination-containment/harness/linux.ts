// bun harness/linux.ts --untimed | --timed
// The Linux run, inside the container. Untimed: wrapper conformance and the behaviour checks in the three engines.
// Timed: the typing gate, and the 120- and 2,000-page paginated rows of the matrix. Everything goes to results/linux.
import { chromium } from 'playwright'
import { runSuite, SUITES } from './bench.ts'
import { requireTimed } from './timing.ts'

const RESULTS = 'results/linux'
const ENGINES = ['chromium', 'firefox', 'webkit'] as const
const TIMED_MATRIX_ROWS: readonly string[] = ['120p-pg1', '2000p-pg1']

// One harness in its own process; a harness that exits non-zero is reported and the run goes on to the next.
function harness(args: string[]): number {
  const r = Bun.spawnSync(['bun', ...args], { env: { ...process.env, MANENT_RESULTS_DIR: RESULTS }, stdout: 'inherit', stderr: 'inherit' })
  if (r.exitCode !== 0) process.stderr.write(`linux.ts: bun ${args.join(' ')} exited ${r.exitCode}\n`)
  return r.exitCode
}

if (import.meta.main) {
  const mode = process.argv[2]
  if (mode === '--untimed') {
    const codes = [harness(['harness/conformance.ts', 'all']), ...ENGINES.map((engine) => harness(['harness/risk.ts', engine]))]
    process.exit(codes.some((c) => c !== 0) ? 1 : 0)
  } else if (mode === '--timed') {
    const { baseline } = requireTimed()
    process.env.MANENT_RESULTS_DIR = RESULTS
    await runSuite('gate', SUITES.gate, { browserType: chromium, loads: null, baseline })
    const matrix = { ...SUITES.matrix, configs: SUITES.matrix.configs.filter((c) => TIMED_MATRIX_ROWS.includes(c.name)) }
    await runSuite('matrix', matrix, { browserType: chromium, loads: null, baseline })
  } else {
    console.error('Usage: bun harness/linux.ts --untimed | --timed')
    process.exit(2)
  }
}
