// bun harness/xbrowser.ts <webkit|firefox>
// Typing at 2,000 pages in WebKit or Firefox, which have no CPU throttle: a flat document against 100-block sections
// with content-visibility and pagination, in the middle of the document, with the instrumentation of bench.ts.
import { firefox, webkit } from 'playwright'
import { runSuite, pageConfig } from './bench.ts'
import type { Suite } from './bench.ts'
import { requireTimed } from './timing.ts'

const ENGINES = { firefox, webkit }

const XBROWSER: Suite = {
  interleaved: false,
  configs: [
    pageConfig('2000p-flat', { pages: '2000', wrap: '0', pg: '0' }, [1], { positions: ['middle'] }),
    pageConfig('2000p-pg1', { pages: '2000', pg: '1' }, [1], { positions: ['middle'] }),
  ],
}

if (import.meta.main) {
  const engine = process.argv[2]
  if (engine !== 'webkit' && engine !== 'firefox') {
    console.error('Usage: bun harness/xbrowser.ts <webkit|firefox>')
    process.exit(2)
  }
  const { baseline } = requireTimed()
  await runSuite(`xbrowser-${engine}`, XBROWSER, { browserType: ENGINES[engine], loads: null, baseline })
}
