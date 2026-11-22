# Desktop app

Manent's desktop app shows the same web app in a window of its own, built on Electrobun (2.0.6 is in the catalog). Only `apps/desktop` may import Electrobun; the boundary check enforces that. This page says how to build and run it, and what it does not do yet.

## Run it against the demo

```sh
make demo        # in one terminal
make desktop     # in another; without make: bun run desktop
```

`make desktop` needs a running demo: without one it says "Manent is not running. Run make demo first, then make desktop." It makes a development build (no installer, no update check), opens it, and points it at the demo's server. The app keeps its data in `desktop/` inside the demo's data folder (`.manent-demo/desktop/`).

The first build downloads the desktop toolkit: `tools/desktop/devkit.ts` fetches the Hutch launcher, which fetches the Electrobun core and Chromium into `apps/desktop/.hutch/`. Each download is checked against a recorded checksum, and the build stops with "The desktop toolkit download does not match its recorded checksum." when one differs.

## Build an installer

```sh
bun run desktop:build [--dev] [--open] [--channel stable|canary] [--version <x.y.z>] [--update-url <url>]
```

The build stages the web app, the server program, the demo's seed and the third-party notices under `apps/desktop/build/stage/`, then builds this system's installer into `apps/desktop/artifacts/`, named `Manent-<version>-<channel>-<system>-<arch>`: a `.dmg` on macOS, a `-setup.zip` on Windows and a `.tar.gz` on Linux. The installers are unsigned, so each system warns the first time the app opens; `tools/desktop/release-notes.ts` holds what a release says about that.

| Script                                        | What it does                                                                                                                           |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run desktop:check`                       | Type-checks the shell against `apps/desktop/tsconfig.shell.json`                                                                       |
| `bun run desktop:smoke`                       | Launches an installed app on a fresh data folder, checks it through its local node, and writes `results/desktop-smoke-<platform>.json` |
| `bun run desktop:headless`                    | Runs the local node with no window, serving the web app as the desktop page                                                            |
| `bun tools/desktop/check-size.ts <installer>` | Prints the installer's size against its budget of 250 MB; fails above 400 MB                                                           |

`.github/workflows/desktop.yml` builds, installs and smoke-tests the app on macOS, Windows and Linux whenever the desktop code changes, and `.github/workflows/release.yml` builds and publishes the installers for a tag that starts with `v`.

## What the app does

- **One window, shown when ready.** The window stays hidden until the page has drawn its first frame, and keeps its size and place between launches.
- **Native menus.** The menus are drawn from the page's own menu model, and each item runs the page's command.
- **One running copy.** Opening the app again brings the running window forward.
- **Its own server.** An installed app starts the demo's server program as a child process on a free loopback port, from the seed it was built with; a seed more than six hours old is seeded again at first launch. With `MANENT_CLOUD_URL` set, as `make desktop` sets it, the app uses that server instead.
- **A local node.** Every script is kept in SQLite files on the device and relayed to the server, which stays the authority for every synced script. A script that has never synced shows "On this device only". The data folder is `~/Library/Application Support/Manent` on macOS, `%APPDATA%\Manent` on Windows and `~/.local/share/manent` on Linux, or `MANENT_DATA_DIR` when it is set.
- **Updates.** An installed app checks its channel, stable or canary, for a newer build while it runs, and applies one only at the next launch.

See the [architecture overview](../architecture/overview.md) for how the local node fits with the server.

## Not in this build

**Open…** (Ctrl+O, ⌘O on a Mac) is in the File menu but does nothing yet.
