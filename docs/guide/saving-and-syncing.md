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
| Synced, 2 to review                  | Every change is on the server, and two passages wait for you in **To review**.                        |
| Syncing…                             | Changes are on their way.                                                                             |
| Can't reach Manent, 3 waiting        | The server does not answer. Three changes wait on this device and are sent when it answers.           |
| Offline, 3 waiting                   | The browser has no network. After a day it says since when, for example "Offline since Mon 14:10".    |
| Sign in to sync                      | You are not signed in, so nothing is sent.                                                            |
| Only in this browser — not backed up | This script has never reached the server. It cannot be opened anywhere else.                          |
| On this device only                  | The same, in the desktop app.                                                                         |
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

In the demo, the demo bar's **Connection** is the quickest way to try this. **Offline** cuts this tab's connection, and the status says "Offline, 1 waiting" as you type; **Slow** holds back everything the tab sends and receives by a second and a half; **Online** connects again, and a short message says what was synced ("1 change synced").

**Stop the server** in the demo bar stops it for every tab; [What to try](getting-started.md#what-to-try) walks through it. While the server is stopped the bar says "Server stopped. Start it before reloading this tab.", so start it again before you reload.

## When two copies changed

Changes made in two places, by two tabs, two devices or two people, are merged; neither copy overwrites the other. After a reconnection a short message says what happened, for example "4 changes synced · 1 passage overlaps — review". If the server refuses changes outright, Manent reloads the script and merges your waiting changes back in block by block. Text that cannot be placed anywhere is not dropped: it is kept in "Recovered text".

Each passage that two wordings compete for is listed under **To review** at the top of the History tab ("Sc. 12 · you and Dana Reyes both changed this"), and a bar in the margin marks it on the page. Choose **Keep as merged**, **Use mine** or the other person's wording; Undo takes the choice back. When a passage reached the server twice, as two copies, it is listed the same way: choosing a wording keeps one copy, with that wording, where the earlier copy stood, and **Keep as merged** keeps both. Recovered text is listed there too, and can be put back into the script.

## Versions

Manent keeps versions of a script as you work, on the device and on the server. **Mark a version** (Ctrl+S, ⌘S on a Mac) keeps one now and says "Saved by you."; **Name this draft…** (Ctrl+Shift+S) keeps one under a name, such as "Second draft".

An export or a print also keeps a version. The **History** tab of the side panel (Ctrl+Shift+H) lists them, newest first, under the script as it is now (**Working**), with the ones kept only on this device marked "On this device"; **Drafts only** shows just the named ones. It also lists each change to a script setting, with who made it, when and the value it replaced. Choose a version to see it:

- **Changes since** shows what changed since that version, **On the page**, **Side by side**, as **Asterisks only** or **As it was**, without touching the script. **Next change** and **Previous change** step through it, and the filter narrows it to one scene or one person.
- **Restore** puts the whole script back as that version held it, and **Restore this scene** only the scene you are in. The script as it was is kept first as the version "Before restore", so a restore can itself be undone. When someone else restores a version, Manent says so.
- **Who wrote this?** says who wrote the selected text, and when.

## Where your work is kept

- **In the browser:** one local database per person, in the browser's storage for the site. Each browser tab is its own person, and two tabs of the same person share one connection to the server.
- **Your Library and preferences** are kept like a script: on the device first, then on the server, so they follow you to another browser. **Preferences → This browser** holds what stays in this browser alone.
- **On the server:** SQLite files in the demo's data folder (`.manent-demo/data/`); see [The demo's data](#the-demos-data).
- **The app itself:** after the first visit the browser keeps a copy of the app and warms offline export, PDF and Ink tools in the background (pausing on Data Saver), so a fresh tab or installed window opens straight into your cached workspaces and scripts without a connection. Browsers do this only on a secure address such as `http://localhost` or an HTTPS server; see [Getting started](getting-started.md#let-a-second-machine-join).
- **Installing and updating in the browser:** open **Preferences → This browser** to install Manent as a standalone web app (or add it to the Dock / Home Screen in Safari to avoid seven-day storage clearing), see offline readiness and space used, download a one-click `.zip` backup of everything cached in this browser, or check for updates. When a newer build is ready, Manent never interrupts typing; choose **Reload to update** in the status bar or Preferences when ready, or close every Manent tab.

Preferences → This browser also has **Ask the browser to keep it**, which asks the browser not to clear Manent's storage when space runs low.

## The demo's data

The demo's data is for trying Manent, not for keeping work. `make reset` deletes every script on the server, and so does `make demo` after an update that changes the demo's content: it then says "The demo data came from another build, so it was seeded again." Export anything you want to keep. Manent makes no promise yet that data from one build opens in the next.
