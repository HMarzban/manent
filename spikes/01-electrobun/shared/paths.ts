// Where each shell keeps the spike's data, and where Electrobun keeps its own Chromium profile.
import { homedir } from 'node:os'
import { join } from 'node:path'

export type Shell = 'electrobun' | 'electron'

/** The local node's data folder: `MANENT_SPIKE_DATA_DIR` when set, otherwise the platform's per-user config folder. */
export function appDataDir (shell: Shell): string {
  const override = process.env.MANENT_SPIKE_DATA_DIR
  if (override) return override
  const name = `manent-spike-01-${shell}`
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', name)
  if (process.platform === 'win32') return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), name)
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), name)
}

/** Electrobun 2.0.6 puts the CEF profile of the stable channel here, and no setting moves it. */
export function cefProfileDir (): string {
  return join(electrobunAppData(), 'dev.manent.spike01', 'stable', 'CEF')
}

function electrobunAppData (): string {
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support')
  if (process.platform === 'win32') return process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
  return process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share')
}
