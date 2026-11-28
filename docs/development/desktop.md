# Desktop app

Manent's desktop app shows the same web app in a window of its own, built on Electrobun (2.0.6 is in the catalog). Only `apps/desktop` may import Electrobun; the boundary check enforces that. This page says how to build and run it, and what it does.

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

`.github/workflows/desktop.yml` builds, installs and smoke-tests the app on macOS, Windows and Linux whenever the desktop code changes (cancelling superseded non-`main` runs and caching `~/.bun/install/cache`), and `.github/workflows/release.yml` builds and publishes the installers for a tag that starts with `v`. A release also carries the server on its own, compiled concurrently via `tools/build-server-release.ts` into one `manent-<system>-<arch>` file for macOS, Linux and Windows on Intel and Arm alongside `manent-web.tar.gz`.

## What the app does

- **Custom studio window chrome and display-aware sizing.** The window stays hidden until the page has drawn its first frame, opens at `1440 × 940` (clamped cleanly to the primary display's work area with a `960 × 640` minimum floor), and keeps its size and place between launches. On macOS, a dedicated `36 px` theme-matched titlebar centres the inset traffic lights on the left and syncs the active script title to the OS; on Windows, the main window and secondary Room/Prompter windows use `hiddenInset` with a left-side **Menu (`☰`)** trigger on the main window and right-side Minimise, Maximise/Restore and Close caption controls routed by `windowKey`; Linux keeps native window-manager chrome.
- **Native menus, custom About window and Bound "M" icons.** macOS draws the global menu bar from the page's command model (`File`–`Help`), **Manent → About Manent** (`shell.about`) opens a compact, non-resizable theme-matched About window (`360 × 484`, `/about`) with the Bound "M" mark, version/channel, Layout engine, registered file types, **Copy details**, live update check and the AI pledge; Windows exposes the same live menu tree inside the custom titlebar; and `tools/desktop/generate-icons.ts` builds the unified Bound "M" icon set from `site/favicon.svg` across `apps/desktop/icon.iconset/`, `apps/desktop/assets/icon.png`, `apps/web/public/icons/` and `site/apple-touch-icon.png`.
- **One running copy.** Opening the app again brings the running window forward.
- **Its own server.** An installed app starts the demo's server program as a child process on a free loopback port, from the seed it was built with; a seed more than six hours old is seeded again at first launch. With `MANENT_CLOUD_URL` set, as `make desktop` sets it, the app uses that server instead.
- **A local node with full offline resilience.** Every script is kept in SQLite files on the device and relayed to the server, which stays the authority for every synced script. When the server is stopped or there is no internet, choosing a person, browsing, creating, editing and exporting continue locally (`GET /api/local/status` and SSE `cloud_state` surface an unobtrusive **Offline · Saved on this device** pill in the titlebar and a live **Connection** card with on-demand **Check connection** probing in `Preferences → This device`), and queued edits and new scripts sync and hand off automatically when the server returns. Open SSE event streams and heartbeat timers close cleanly on quit (`NodeCore.close()`). A script that has never synced shows "On this device only". Choosing **Start in a clean workspace** persists `demo_dismissed` in `records.sqlite` (`RECORDS_VERSION = 2` via `POST /api/local/demo-mode`), injects `manent.workspace.clean` before first paint in `bootScript` across ephemeral loopback ports, gates `/api/demo`, and shields local `You` scripts from cloud demo reseeds until **Turn Demo and Tour back on** is chosen in `Preferences → This device` or `Account`. The data folder is `~/Library/Application Support/Manent` on macOS, `%APPDATA%\Manent` on Windows and `~/.local/share/manent` on Linux, or `MANENT_DATA_DIR` when it is set.
- **History and production revisions.** Versions, locking, issuing and recalling work in the app as in the browser; a script locked or issued on the device keeps its production and its versions when it first syncs.
- **Open… and files from the system.** **Open…** (`Ctrl+O`, `⌘O` on a Mac) and files opened via Finder double-click or Dock drop (`file://` associations for `.fdx`, `.fountain`, `.ink`, `.docx`, queued cleanly until `first_frame`) import through the same path as browser import; unsupported types or files larger than 32 MB are refused with a clear sentence. See [Import a script](../guide/export-and-print.md#import-a-script).
- **Automatic updates.** An installed app checks its channel (`stable` or `canary`) on window show and every 6 hours while running (`PERIODIC_UPDATE_CHECK_MS`), downloads quietly, surfaces **Restart to update** in the titlebar, `Preferences → This device` and the About window once staged, and applies it on restart or next launch. `--dev` builds disable updates.

See the [architecture overview](../architecture/overview.md) for how the local node fits with the server.
