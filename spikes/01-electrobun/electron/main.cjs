// The Electron shell: the compiled local node as a sidecar process, and one window on its page.
const { app, BrowserWindow } = require('electron')
const { spawn } = require('node:child_process')
const { join } = require('node:path')
const { createInterface } = require('node:readline')

if (process.env.MANENT_SPIKE_DATA_DIR) app.setPath('userData', join(process.env.MANENT_SPIKE_DATA_DIR, 'chromium'))
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')

const sidecar = spawn(join(process.resourcesPath, 'sidecar'), [], {
  env: { ...process.env, MANENT_SPIKE_PAGE_DIR: join(process.resourcesPath, 'page'), SPIKE_VERSION: app.getVersion() },
  stdio: ['ignore', 'pipe', 'inherit']
})

/** The sidecar's first line, `{ port, token }`. */
function readSidecar () {
  return new Promise((resolve, reject) => {
    const lines = createInterface({ input: sidecar.stdout })
    lines.once('line', (line) => resolve(JSON.parse(line)))
    sidecar.once('exit', (code) => reject(new Error(`the sidecar exited with ${code} before it listened`)))
  })
}

async function open () {
  const [{ port, token }] = await Promise.all([readSidecar(), app.whenReady()])
  const selftest = process.env.SPIKE_SELFTEST === '1' ? '&selftest=1' : ''
  const win = new BrowserWindow({ width: 1280, height: 800, useContentSize: true, title: 'ManentSpike', webPreferences: { backgroundThrottling: false } })
  await win.loadURL(`http://127.0.0.1:${port}/?t=${token}${selftest}`)
}

app.on('window-all-closed', () => app.quit())
app.on('quit', () => sidecar.kill('SIGTERM'))
open().catch((error) => {
  console.error(error)
  app.exit(1)
})
