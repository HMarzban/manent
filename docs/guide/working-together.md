# Working together

Several people can be in one script at once. Each change reaches the others as it is made, and changes made at the same time are merged, not overwritten.

## What works in this build

- **Live changes.** Every change is sent to the server and passed on to everyone else who has the script open.
- **Cursors.** Other people's cursors and selections are drawn on the page, each with a tab that shows the person's name. **Preferences → Writing → Show other people's cursors** turns them off.
- **Who is here.** The title bar shows the people in the script: up to three avatars, then how many more.
- **Arrivals and departures.** With **Preferences → Writing → Announce while writing** set to "Element changes, page starts and people arriving or leaving", a screen reader hears "… arrived" and "… left".
- **Undo is yours.** Undo takes back your own changes and leaves other people's in place.
- **Merging after time apart.** Changes made without a connection are merged when they reach the server. See [Saving and syncing](saving-and-syncing.md#when-two-copies-changed).
- **One person, many tabs.** Two tabs of the same person share one connection to the server. If the tab holding it closes, another takes over.
- **Versions.** Who changed what, and restoring an earlier version, are in the History tab; see [Versions](saving-and-syncing.md#versions).

## Try it in the demo

Dana, Sam, Priya, Leo and Ana share the Writers' room, and a script one of them makes there opens for the others with the role the workspace gives them. Choose Dana in one tab, click **New script** in the Writers' room and type a line. In a second tab, choose Priya: Dana's new project is in her Library too, and opens on a click. Type in either tab. Two tabs of one person work as well: step 5 of [What to try](getting-started.md#what-to-try) sets them up.

## Production revisions

When a script goes into production, its page and scene numbers are locked, so that a page handed out keeps its number, and changes are marked as revisions in a sequence of colours. Locking takes someone with production permissions, such as the script's owner, and a connection to the server.

1. Choose **Lock for production…** from **Title ▾** or the command palette. The dialog says what locking means ("Page numbers and scene numbers stop moving for everyone on …") and which colour comes first.
2. Keep writing. Changed lines are marked as revised, and the state bar above the page names the active revision: "BLUE revision · started 22 Nov 2026 · 1 page revised".
3. **Issue Blue…**, named for the active revision, sends it out from the Send screen; see [Issue a revision](export-and-print.md#issue-a-revision).

While a script is locked:

- The **Pages** tab of the left panel lists every page with its lock and revision. Choose pages there to lock or unlock their numbers, lock A-pages or renumber.
- **Mark revised** and **Clear revised** mark or clear the selected text by hand, and **Omit scene** and **Bring back scene** take a scene out or put it back while keeping its number.
- **View ▾ → Revision marks** chooses which revisions the page shows, and **Colour revised pages** tints them.
- The rows of Script settings that would move pages are frozen. **Change layout…** changes them anyway, after saying how many pages gain A-pages or end early.
- **Unlock…** and **End production…** each open a dialog that states the consequence first.

These commands appear in the command palette, and on the desktop in the Production menu, only once page numbers are locked.

## Not in this build

- **Comments.** The side panel has History, Details and Tour; comments are planned.
- **Roles in practice.** The demo people have roles (editor, reader and commenter, production permissions) and the server checks them, but no screen yet lets you share a script or change a role.
