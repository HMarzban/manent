// The local node as its own process, for the Electron shell: prints one JSON line `{ port, token }` once it listens.
import { startLocalNode } from './node.ts'
import { appDataDir } from './paths.ts'

const pageDir = process.env.MANENT_SPIKE_PAGE_DIR
if (!pageDir) throw new Error('MANENT_SPIKE_PAGE_DIR must name the page folder')
// the Electron main process passes its app's version, which the build took from SPIKE_VERSION
const node = await startLocalNode({ dataDir: appDataDir('electron'), version: process.env.SPIKE_VERSION ?? '0.0.1', pageDir })
process.on('SIGTERM', () => {
  void node.stop().then(() => process.exit(0))
})
console.log(JSON.stringify({ port: node.port, token: node.token }))
