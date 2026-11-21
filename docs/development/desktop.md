# Desktop app

Manent's desktop app is planned, and this build does not have it. This page says what exists towards it, so nobody mistakes a placeholder for a working build.

## What runs today

Nothing that produces an app:

```text
$ make desktop
The desktop app is not in this build yet.
```

`make desktop` (and `bun run desktop`) prints that line and stops with a non-zero exit status. The scripts `desktop:build`, `desktop:smoke` and `desktop:headless` point at files in `tools/desktop/` that hold no code yet, and `desktop:check` names a TypeScript configuration that does not exist yet.

## What exists towards it

| Part                  | State                                                                                                                                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/local-node` | A library with tests: the service the app will run on loopback, with a durable SQLite store, a relay to the server, an outbox, a lock so only one copy runs, and the hand-off of a script's first sync. Nothing outside its tests uses it yet                 |
| `apps/desktop/src`    | Starting the web server as a child process on a free loopback port (`cloud.ts`), the window's size and place (`window-state.ts`, `frames.ts`), each with tests, and the app's words (`words.ts`). The shell itself (window, menus, dialogs, updater) is empty |
| `tools/desktop/`      | Empty: the build, the size check, the smoke and headless tests, and the release notes                                                                                                                                                                         |
| The web app           | The desktop words and status wording ("On this device only") exist; the desktop parts of the web app are empty                                                                                                                                                |

The shell will be built on Electrobun (2.0.6 is in the catalog). Only `apps/desktop` may import it; the boundary check enforces that.

## How it is meant to work

The desktop app will show the same web app in its own window. A local service inside the app keeps every script in SQLite files on the device and relays changes to the server, which stays the authority for every synced script. A script that was never synced is kept on the device alone. See the [architecture overview](../architecture/overview.md).
