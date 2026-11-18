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

/**
 * Checks the build's update address once and logs each status, and the updater's error text, as a mark. The node
 * stops before the hand-off: the updater asks before-quit for approval, and the wait above would refuse it.
 */
async function updateAtLaunch (): Promise<void> {
  const sent: Array<Promise<unknown>> = []
  const mark = (name: string): void => {
    // once the node has stopped the request fails, so the statuses of the hand-off itself are not recorded
    sent.push(fetch(`http://127.0.0.1:${node.port}/mark?name=${encodeURIComponent(name)}&t=${node.token}`).catch(() => null))
  }
  Updater.onStatusChange((entry) => {
    mark(`update-${entry.status}`)
    if (entry.details?.errorMessage) mark(`updater-error-${entry.details.errorMessage}`)
  })
  const info = await Updater.checkForUpdate()
  if (!info.updateAvailable) return
  await Updater.downloadUpdate()
  if (!Updater.updateInfo().updateReady) return
  await Promise.all(sent)
  await node.stop()
  stopped = true
  await Updater.applyUpdate()
}
if (process.env.SPIKE_CHECK_UPDATE === '1') void updateAtLaunch()
