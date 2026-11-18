hutch: 0.29.0
hutchArchive: electrobun-hutch-macos-arm64.tar.gz https://github.com/blackboardsh/electrobun/releases/download/v2.0.6/electrobun-hutch-macos-arm64.tar.gz
hutchSha256: f081abca6d08d9d862577e77365f3cb5437e65858ca45a27173505e4e2345994
coreSha256: 99813cdc64be5aa743b2d620dcf99e77f240dce53e01dc95aa3f9c7e00705d49
cefSha256: aa04393159f57b598d44bc164da1662b530a91b382f60d5fd19691a2747b39ff
debugPort: build.mac.chromiumFlags remote-debugging-port

# Install notes: Electrobun 2.0.6 on macOS

Recorded on 2026-11-18 on an Apple M5 Max with macOS 27.0.1 and Bun 1.4.4, from this folder.

## Where each value comes from

- `hutch`: `.hutch-home/npm/electrobun/2.0.6/macos-arm64/hutch-release.json` (`"version": "0.29.0"`).
- `hutchSha256`: the bootstrap keeps no copy of the archive (that folder holds only `bin/`, `hutch-release.json` and `.electrobun-cache.json`), so the release asset was downloaded once into `artifacts/` and hashed with `shasum -a 256`. It equals the value the release's index gave on 2026-11-17, which the bootstrap's own `.electrobun-cache.json` also records as `archiveSha256`. The archive is 1,249,476 bytes.
- `coreSha256` and `cefSha256`: `.hutch/devkit.lock` is empty (0 bytes) after the build. Hutch writes both checksums to `.hutch/dependencies.lock` instead (`coreSha256` on the `electrobun` object, `cefSha256` on the `electrobun-cef` object), and both equal the release index's values.
- `debugPort`: the switch that opens Chromium's debugging port in a packaged build is `build.mac.chromiumFlags: { "remote-debugging-port": "<port>" }`. `electrobun.config.ts` adds it only when `SPIKE_DEBUG_PORT` is set. The stable build recorded here was made without it, and the port was not opened in this step.

Hutch's own downloads (the Hutch launcher, Cottontail 0.7.3, the Electrobun core, CEF and a Bun 1.4.4 toolchain) do not pass through `bun install`, so the three-day release-age rule does not cover them. Each archive is checked by SHA-256 against the v2.0.6 release's indexes instead. All of them went to `.hutch-home/`, because every command ran with `HUTCH_HOME="$PWD/.hutch-home"`; `~/.hutch` was never created.

## The build

`HUTCH_HOME="$PWD/.hutch-home" bunx electrobun build --env=stable` wrote these files to `artifacts/`:

| File | Bytes |
|---|---|
| `macos-arm64-ManentSpike.dmg` | 152,601,185 |
| `stable-macos-arm64-ManentSpike.app.tar.zst` | 148,268,469 |
| `stable-macos-arm64-update-v2.json` | 311 |
| `stable-macos-arm64-update.json` | 212 |

The installed `.app`, copied out of the mounted DMG to `artifacts/installed/electrobun/`, takes 447,636 KB on disk once its first launch has unpacked it.

Each build empties `artifacts/` before it writes. The marker file `artifacts/install-marker` (touched before `bun add`) was therefore deleted by the build, and was put back with its original time (`touch -r bunfig.toml`, which was written in the same command a moment before the marker) before the search below.

## Signing

Unsigned: no signing identity was used. The toolchain's linker signs the binaries ad hoc (`codesign -dv` on the `.app`: `Signature=adhoc`, flags `adhoc,linker-signed`), and macOS launched that build without any further step, so no ad-hoc identity `-` had to be applied.

## The first launch

The installed app's executable is `launcher` (`CFBundleExecutable`). Its first launch unpacks the app in place and then starts it. From spawn to `node.json` it took **8,778 ms**; the next launch of the same install answered `/health` 698 ms after spawn (`smoke-electrobun-darwin.json`), so about 8.1 s of the first launch was the self-extraction. The page reached its first frame 303 ms after `node.json` was written, and its user agent named `Chrome/156.0.0.0`. An earlier build of the same app took 9,331 ms to its first `node.json`, and its next launch 225 ms to `/health`. Other work was running on this machine during these launches, so the figures are indicative, not timed results.

Each build has its own self-extraction record (`self-extraction/<build hash>.recipe.json`), so the first launch of every new build unpacks again.

SIGTERM to the processes inside the `.app` (the `launcher`, `bun` and five `bun Helper` processes) quit all of them within 5 s; none was left for SIGKILL. `smoke.ts` stops the app the same way and found no process left after any of its runs.

On that earlier build (the same `electrobun.config.ts` and main process), the window measured 1280 × 832 points in the system's window list, a 32-point title bar above a 1280 × 800 content area: Electrobun's `frame` width and height set the content size.

## What the build and the launches wrote outside this folder

From `find ~/Library/Caches ~/Library/Application\ Support ~/Library/WebKit ~/Library/Preferences ~/.local ~/.config -newer artifacts/install-marker -maxdepth 3`, the entries this app wrote:

- `~/Library/Application Support/dev.manent.spike01/stable/.electrobun-uninstall.json`
- `~/Library/Application Support/dev.manent.spike01/stable/self-extraction`
- `~/Library/Application Support/dev.manent.spike01/stable/uninstall`
- `~/Library/Application Support/dev.manent.spike01/stable/CEF` (the Chromium profile, which no setting moves)
- `~/Library/Caches/dev.manent.spike01/stable/CEF`

Nothing was written to `~/Library/WebKit`, `~/Library/Preferences`, `~/.local` or `~/.config` under this app's identifier, and the local node wrote nothing under the home folder, because every launch set `MANENT_SPIKE_DATA_DIR` to a folder under `artifacts/`. The search also listed entries under `~/Library/Caches/bun` (Bun's transpiler cache, which every Bun process on this machine shares) and the folders of other applications that were running at the time; none of them is this app's.

## Findings

- A custom `preload` is not used: in Electrobun 2.0.6 it does not run under CEF. The page needs none. It reads the launch token from the `t` parameter of its own address and adds it to every request it makes, including the import of its own bundle.
- The app's version comes from the build: `app.version` in `electrobun.config.ts` is `SPIKE_VERSION` (default `0.0.1`) when the build runs, and the main process reads it back at launch with `Updater.getLocalInfo()`, because an installed app starts without the build's environment.
- `.hutch/devkit.lock` stays empty; the core and CEF checksums are in `.hutch/dependencies.lock`.
- A build deletes everything in `artifacts/`, including files that are not its own.
- The build warns that it found no `icon.iconset`, and uses a default icon.
