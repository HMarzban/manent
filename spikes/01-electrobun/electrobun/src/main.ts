// The Electrobun shell: the local node in this process, and one window on its page.
import Electrobun, { BrowserWindow, PATHS, Updater, Utils } from 'electrobun/main'
import { join } from 'node:path'
import { startLocalNode } from '../../shared/node.ts'
import { appDataDir } from '../../shared/paths.ts'

const { version } = await Updater.getLocalInfo()
const node = await startLocalNode({ dataDir: appDataDir('electrobun'), version, pageDir: join(PATHS.RESOURCES_FOLDER, 'app', 'page') })
const selftest = process.env.SPIKE_SELFTEST === '1' ? '&selftest=1' : ''

const win = new BrowserWindow({
  title: 'ManentSpike',
  url: `http://127.0.0.1:${node.port}/?t=${node.token}${selftest}`,
  frame: { width: 1280, height: 800 },
  renderer: 'cef'
})
win.on('close', () => Utils.quit())

// the quit waits once, so the node closes its database before the process exits
let stopped = false
Electrobun.events.on('before-quit', (event) => {
  if (stopped) return
  event.response = { allow: false }
  void node.stop().then(() => {
    stopped = true
    Utils.quit()
  })
})
