# Saving and syncing

Manent saves every change on your device first and sends it to the server when it can. You do not save by hand, and work done without a connection is kept. This page explains what the status beside a script's title tells you.

## The status

The status has two parts, separated by a dot: where your work is on this device, then where it is on the server.

```text
Saved · Synced
```

**On this device**

| Status                   | Meaning                                                       |
| ------------------------ | ------------------------------------------------------------- |
| Saved                    | Every change is stored in this browser.                       |
| Not saved on this device | The browser refused to store the last changes. Export a copy. |

**On the server**

| Status                               | Meaning                                                                                               |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Synced                               | The server has stored every change.                                                                   |
| Syncing…                             | Changes are on their way.                                                                             |
| Can't reach Manent, 3 waiting        | The server does not answer. Three changes wait on this device and are sent when it answers.           |
| Offline, 3 waiting                   | The browser has no network. After a day it says since when, for example "Offline since Mon 14:10".    |
| Sign in to sync                      | You are not signed in, so nothing is sent.                                                            |
| Only in this browser — not backed up | This script has never reached the server. It cannot be opened anywhere else.                          |
| Server out of date                   | The server runs an older Manent than this app needs. Changes stay on this device until it is updated. |
| Update Manent to sync                | This app is older than the server accepts. Changes stay on this device until you update.              |
| Access removed                       | You can no longer change this script. Changes not yet sent are counted: "Access removed, 2 not sent". |
| Deleted                              | The script was deleted. Changes not yet sent are counted: "Deleted, 2 not sent".                      |

These statuses take the place of both parts:

| Status                                    | Meaning                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| View only                                 | You can read this script but not change it.                                     |
| Read-only — update Manent to edit         | The script was written by a newer Manent. You can read it; update to change it. |
| Can't save on this device — export a copy | The browser cannot store changes and there is no connection. Export a copy now. |

"Synced" appears two seconds after the last change has been stored on the server, so it does not flicker while you type.

Click the status to open the **Sync centre**. It says what is waiting, scene by scene ("Sc. 12 · 3 waiting"), lists what each reconnection synced, and offers **Export a copy**.

## Working without a connection

Keep writing. Each change is stored on your device as you type, and the status counts how many changes wait. When the server answers again, Manent sends them in order and the status returns to **Synced**.

In the demo, **Stop the server** in the demo bar is the quickest way to try this; [What to try](getting-started.md#what-to-try) walks through it. While the server is stopped the bar says "Server stopped. Start it before reloading this tab.", so start it again before you reload.

> [!NOTE]
> The demo bar does not simulate a lost network yet. "Offline" appears only when the browser itself reports that it has no network.

## When two copies changed

Changes made in two places, by two tabs, two devices or two people, are merged; neither copy overwrites the other. After a reconnection a short message says what happened, for example "4 changes synced · 1 passage overlaps — review". If the server refuses changes outright, Manent reloads the script and merges your waiting changes back in block by block. Text that cannot be placed anywhere is not dropped: it is kept in "Recovered text".

The **To review** list, where you would choose between the merged passage and your own, is not in this build.

## Where your work is kept

- **In the browser:** one local database per person, in the browser's storage for the site. Each browser tab is its own person, and two tabs of the same person share one connection to the server.
- **On the server:** SQLite files in the demo's data folder (`.manent-demo/data/`); see [The demo's data](#the-demos-data).
- **The app itself:** after the first visit the browser keeps a copy of the app, so a script can be opened without the server. Browsers do this only on a secure address such as `http://localhost`; see [Getting started](getting-started.md#let-a-second-machine-join).

Preferences → This browser has **Ask the browser to keep it**, which asks the browser not to clear Manent's storage when space runs low.

## The demo's data

The demo's data is for trying Manent, not for keeping work. `make reset` deletes every script on the server, and so does `make demo` after an update that changes the demo's content: it then says "The demo data came from another build, so it was seeded again." Export a PDF of anything you want to keep. Manent makes no promise yet that data from one build opens in the next.
