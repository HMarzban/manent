# Working together

Several people can be in one script at once. Each change reaches the others as it is made, and changes made at the same time are merged, not overwritten.

## What works in this build

- **Live changes.** Every change is sent to the server and passed on to everyone else who has the script open.
- **Cursors.** Other people's cursors and selections are drawn on the page, each with a tab that shows the person's name. **Preferences → Writing → Show other people's cursors** turns them off.
- **Arrivals and departures.** With **Preferences → Writing → Announce while writing** set to "Element changes, page starts and people arriving or leaving", a screen reader hears "… arrived" and "… left".
- **Undo is yours.** Undo takes back your own changes and leaves other people's in place.
- **Merging after time apart.** Changes made without a connection are merged when they reach the server. See [Saving and syncing](saving-and-syncing.md#when-two-copies-changed).
- **One person, many tabs.** Two tabs of the same person share one connection to the server. If the tab holding it closes, another takes over.

## Try it in the demo

In this build a script opens only for the person who made it, so the demo shows live changes between two tabs of one person: step 5 of [What to try](getting-started.md#what-to-try) sets them up.

## Not in this build

- **Opening another person's script.** The Library does not yet share its list across people, and a script made by one person shows "You no longer have access" to another. Live editing between different people is covered by the end-to-end tests, which join a second writer to a script directly.
- **The people in the title bar.** The avatars of who is in the script are not drawn yet.
- **Comments.** The side panel has History, Details and Tour; comments are planned.
- **Roles in practice.** The demo people have roles (editor, reader and commenter, production permissions) and the server checks them, but no screen yet lets you share a script or change a role.
