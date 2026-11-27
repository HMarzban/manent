# Working together

Several people can be in one script at once. Each change reaches the others as it is made, and changes made at the same time are merged, not overwritten.

## What works in this build

- **Live changes.** Every change is sent to the server and passed on to everyone else who has the script open.
- **Cursors and margin initials.** Other people's cursors and selections are drawn on the page, each with a tab that shows the person's name, alongside collaborator initials in the margin and presence dots on Scenes rows. **Preferences → Writing → Show other people's cursors** turns carets off.
- **Who is here and Following.** The title bar shows the people in the script: up to three avatars, then how many more. Choose **Follow** on someone in the people list to keep their caret in view until you type, click, scroll or choose **Stop**.
- **Sharing, groups and links.** Click **Share** on a script to grant roles (`Can edit`, `Can comment` or `Can view`) to workspace members or project groups, manage per-project **Can also** capabilities, or turn on an expiring, revocable share link (`/join/<token>`).
- **Comments, rounds and writers-only notes.** The **Comments** tab in the side panel holds shared comment threads anchored to text, scenes or the whole script, with `@mentions`, resolution outcomes and named review rounds. Type `[[` in a script to add a private writers-only note.
- **Writing as suggestions and private copies.** Switch the Writing position from **Title ▾ → Writing** (or the command palette) to **As suggestions** to propose edits with margin bars reviewed in **To review**, or open a private copy (**Privately**) that syncs across your devices and merges back in one step with **Hand in** (keeping an automatic "Before hand-in" version).
- **Sent drafts and watermarked readers.** Choose **Send draft** on the Send screen to distribute a full draft, changed pages, or a page or scene range to people, groups or a reader link (`/r/<token>`), with optional per-reader watermarks, live commented-line highlights with tap-to-reopen comment threads, **Read aloud** with live `StateBar` stop control (including for anonymous link readers) and open tracking in History.
- **Room window.** Open the distraction-free **Room window** (`/s/<doc>/present`) for the room's big screen, with a full-opacity HUD featuring **Previous scene** / **Next scene** steppers, **View ▾ → Take keys** to hand off driving, **View ▾ → Pitch…** for pitched alternate lines and a Mini-Map outline.
- **Arrivals and departures.** With **Preferences → Writing → Announce while writing** set to "Element changes, page starts and people arriving or leaving", a screen reader hears "… arrived" and "… left".
- **Undo is yours.** Undo takes back your own changes and leaves other people's in place.
- **Merging after time apart.** Changes made without a connection are merged when they reach the server. See [Saving and syncing](saving-and-syncing.md#when-two-copies-changed).
- **One person, many tabs.** Two tabs of the same person share one connection to the server. If the tab holding it closes, another takes over.
- **Versions.** Who changed what, and restoring an earlier version, live on the dedicated read-only **Version history** page opened from the top-bar **History** button beside **Share**; see [Versions](saving-and-syncing.md#versions).

## Try it in the demo

Dana, Sam, Priya, Leo and Ana share the Writers' room, and a script one of them makes there opens for the others with the role the workspace gives them. Choose Dana in one tab, click **New script** in the Writers' room and type a line. In a second tab, choose Priya: Dana's new project is in her Library too, and opens on a click. Type in either tab. Two tabs of one person work as well: step 5 of [What to try](getting-started.md#what-to-try) sets them up.

## Production revisions

When a script goes into production, its page and scene numbers are locked, so that a page handed out keeps its number, and changes are marked as revisions in a sequence of colours. Locking takes someone with production permissions, such as the script's owner or someone granted **Lock page numbers** in **Can also**, and a connection to the server.

1. Choose **Lock for production…** from **Title ▾** or the command palette. The dialog says what locking means ("Page numbers and scene numbers stop moving for everyone on …") and which colour comes first. Choose **Try it on a copy first** to preview locked page breaks and revision colours beside the original without touching it.
2. Keep writing. Changed lines are marked as revised, and the state bar above the page names the active revision: "BLUE revision · started 22 Nov 2026 · 1 page revised".
3. **Issue Blue…**, named for the active revision, sends it out from the Send screen; see [Issue a revision](export-and-print.md#issue-a-revision).

While a script is locked:

- The **Pages** tab of the left panel lists every page with its lock and revision. Choose pages there to lock or unlock their numbers, lock A-pages or renumber.
- **Mark revised** and **Clear revised** mark or clear the selected text by hand, and **Omit scene** and **Bring back scene** take a scene out or put it back while keeping its number.
- **View ▾ → Revision marks** chooses which revisions the page shows, and **Colour revised pages** tints them.
- **Export → Sides** (or **Include in sides…** on a scene's row menu) prints whole locked pages for chosen scenes with other scenes' lines struck through.
- The rows of Script settings that would move pages are frozen. **Change layout…** changes them anyway, after saying how many pages gain A-pages or end early.
- **Unlock…** and **End production…** each open a dialog that states the consequence first.

These commands appear in the command palette, and on the desktop in the Production menu, only once page numbers are locked.

## Rundowns and Rundown History

Show and News rundowns update live for everyone with access:

- **Adding and importing rows.** Beneath any non-empty editable rundown, a quiet footer bar surfaces **Add row**, **Add header row** and **Import rows from script** without cluttering read-only grids.
- **Live `Can view` access.** People with `Can view` or `Can comment` roles open the rundown in a live-updating read-only grid, including read-only **Details** and per-cell **Previous value** inspection.
- **Rundown History.** Click the top-bar **History** button beside **Share** on any rundown to open the dedicated read-only Version history page and compare against an earlier version **In the grid**, **Side by side** or **As it was**. Non-colour badges mark every change (`Added`, `Removed`, moved arrows `↑ from …` / `↓ from …` and prior cell values), the floating right-edge Minimap highlights changed rows for one-click jumps, and the change stepper announces each edit to screen readers.
- **Whole and single-row restore.** Editors with rundown permission can restore the whole rundown or a single changed, moved or removed row from any version. Every restore saves the current rundown first as **'Before restore'**, and when the show is inside its air window the confirmation notes that prompter text stays unchanged until you send it.

## Live prompter and external MOS

- **Sending to prompter.** Open the live Prompter window directly from the top-bar **Prompter** button beside **History** and **Share** on any rundown (its status dot shows whether the feed is live, changed or being controlled). Outside the air window, edits to linked stories reach the prompter automatically after 2 seconds of quiet; inside the air window, changes hold until someone with **Send to prompter** permission sends them, and **Send previous** rolls back the prompter feed without altering the script. The Prompter window checks the feed every second and marks **Feed lost** after 3 seconds.
- **Remote-scrolled Prompter.** From the rundown, click **Take control** (or **Take over** when another operator holds the lease, and **Stop controlling** when finished) to drive every open Prompter window with a docked transport bar: **Play** / **Pause**, **Slow** / **Normal** / **Fast** scroll rate, single-line **Back a line** / **Forward a line** nudges, and **Jump prompter here** on any row that is on the prompter. Each Prompter window displays the live remote playback state (`Playing · X l/s` or `Paused`) to viewers, mirrors its eye-line chevron to the right edge when mirrored, can stay in **Follow** or switch to **Free scroll** locally, and pauses scrolling cleanly if the feed is lost or the device goes offline.
- **External MOS 2.8.5 and Autoscript WinPlus-IP.** Workspace owners configure an external prompter under **Workspace settings → Broadcast** by choosing **Autoscript WinPlus-IP** or **MOS 2.8.5**, entering its private studio network address, verifying connectivity with **Check prompter**, and optionally adjusting **Advanced studio details** (ports 10540 and 10541, NCS and MOS IDs, and allowed studio networks). On each Show or News rundown, switch on **Details → Rundown → Send this rundown over MOS**; outbound MOS follows the same air-window holds as the browser Prompter window. When Manent's server cannot reach the studio network directly, the desktop app can relay MOS over the local LAN. External MOS has been verified against Manent's mock MOS prompter and has not yet been tested against physical studio hardware.
