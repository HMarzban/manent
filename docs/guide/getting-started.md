# Getting started

How to run Manent on your own machine and find your way around the demo.

## What you need

- [Bun](https://bun.com) 1.4.4, the version CI uses; `make demo` accepts later ones. It checks the version first and tells you how to install Bun if it is missing.
- Git, to get the code.
- macOS, Linux or Windows. CI is set up to test all three; it does not pass on every one yet, and Windows has not been tried by hand.
- Chrome 123, Safari 17.5 or Firefox 120, or a later version. The end-to-end tests run in Chromium, Firefox and WebKit.
- `make` is optional. Every `make` target runs a `bun run` script of the same name, so `bun run demo` does the same as `make demo`.

## Start the demo

```sh
git clone https://github.com/HMarzban/manent.git
cd manent
make demo
```

`make demo`:

1. checks your Bun version and that ports 4747 and 4748 are free;
2. installs the dependencies from the lockfile;
3. builds the web app;
4. creates the demo data in `.manent-demo/` (the demo people and their workspaces);
5. starts the server under a small supervisor, which restarts it if it stops on its own;
6. opens `http://localhost:4747` in your browser.

To stop it, press Ctrl+C in the terminal, or run `make stop` from another one. `make reset` deletes the demo data and creates it again; see [The demo's data](saving-and-syncing.md#the-demos-data).

To try the Electrobun desktop app against the running demo, open a second terminal and run `make desktop` (or `bun run desktop`); see [Desktop app](../development/desktop.md).

## Choose who you are

![The "Choose who you are" Studio Desk screen, showing the six demo people, the live script desk preview, and the Light and Dark theme switch](../images/choose-who-you-are.png)

The demo has no passwords. You choose a person with one click:

| Person     | As the chooser shows it                                | Workspaces                          |
| ---------- | ------------------------------------------------------ | ----------------------------------- |
| Dana Reyes | Showrunner, workspace owner                            | Writers' room, Lanternfield Studios |
| Sam Okafor | Staff writer, editor                                   | Sam's desk, Writers' room           |
| Priya Nair | Script coordinator, editor with production permissions | Writers' room, Lanternfield Studios |
| Leo Marsh  | Executive, reader and commenter                        | Writers' room                       |
| Ana Costa  | News producer, editor of rundowns                      | Writers' room                       |
| You        | A new person with an empty workspace                   | Your desk                           |

**You** is not signed in, so nothing You writes is sent to the server; choose anyone else to see syncing.

If you want to skip the demo altogether and use Manent as a quiet personal writing studio, click **Start in a clean workspace** directly beneath the cards. It removes the Demo bar, the Tour and demo commands, opens an empty local **Your desk** Library without creating a placeholder script, remembers your choice across reloads, new tabs and desktop restarts, and shields your local scripts from demo resets. Your existing scripts in **You** are kept untouched, and you can turn Demo and Tour back on at any time from **Preferences → This browser** (**This device** in the desktop app) or **Preferences → Account**.

Hovering or moving keyboard focus across the cards updates the live desk view beside them with each person's workspace, format and capabilities. You can switch between **Light** and **Dark** themes from the top right before signing in, or use the footer cards to get the desktop app, install Manent as an offline web app, or open the public repository on GitHub.

On a first visit in a browser on a secure address (`localhost` or HTTPS), a quiet **Offline status** card appears at the bottom left while Manent prepares offline tools in the background, confirms **Ready offline** once complete, and stays silent on later visits.

Online, each browser tab is its own person, so two tabs can be two people: a new online tab asks who you are before it shows anything, even when it opens on a script's address, and then goes on to that address. When you relaunch offline or open Manent as an installed standalone web app, it restores your last active person automatically so you can go straight back to your cached Library and scripts. Switch person or open **Preferences** at any time from your avatar at the top right of any screen, or from the demo bar ("Person: …").

## The demo bar

An archival stone bar labelled **Demo** with a brass top proof edge sits at the top of every screen, adapting automatically across Light, Dark and all 24 studio themes. Its controls are organised by what they affect:

- **Person switcher (`Person: …`).** Switches who this tab is in place, or opens a second companion window as another writer in one click so you can see live cursors and changes merge side by side.
- **Mission pill and quick actions.** Suggests a context-aware tour step for the screen you are on, surfaces one-click contextual actions (such as **Second window**, **5 writers**, **Offline**, **Prompter**, **Play Ink** or **Issue pages**), and confirms completed offline, server-stop and live-writer checks automatically.
- **Live / Timings (`Connection` and `Live timings`).** Shows live keystroke latency on the bar and opens this window's **Online / Offline / Slow** switch alongside live keystroke, pagination, sync and script-size measurements (which stay active offline). Going offline or slow surfaces a one-click **Go online** / **Normal** pill on the bar. See [Saving and syncing](saving-and-syncing.md#working-without-a-connection).
- **Demo controls and Tour sheet.** One unified two-tab sheet holding **Demo controls** grouped into three full-width scopes — **01 · This window** (connection and companion window), **02 · This script** (inline 3-step `1 · 5 · 20` **Add writers** slider, or a one-click **Open a script** shortcut on Library) and **03 · Every window** (**Stop the server** and **Reset**, clearly marked as affecting every open tab and desktop window) — alongside **Tour** story tracks (**Highlights**, **Writing and export**, **Showrunner and room**, **Production and locks**, **Broadcast and news**, **Game and Ink**, and **Offline and long scripts**), Writers' room **Jump to a format** shortcuts, live verification counts and a link to all Tour parts. Whenever the server is stopped, a one-click **Start the server** recovery pill stays pinned directly on the bar.
- **Tour** and **Hide demo bar.** **Tour** shows a circular progress ring and opens the Tour panel; **Hide demo bar** collapses the bar into a quiet top-centre restore tab until you expand it (expanding automatically for `F6`, Tour highlights or offline/stopped states).

## The Library

The Library lists the projects of one workspace. Choose the workspace from the menu at the top left. Each demo person belongs to one or more workspaces, such as a personal desk, a writers' room or a studio.

- **New script** makes a film project with one empty script and opens it.
- **Import…** makes a script from a Final Draft, Fountain, text-based PDF, Word (`.docx`), Markdown (`.md`) or plain-text file; see [Import a script](export-and-print.md#import-a-script).
- **New project** offers Film, Series, Show, News, Podcast, Book, Game and Stage play. Each kind starts with one script in its own format: Film and Series as a screenplay, Show, News and Podcast as Variety, Book as a manuscript, Game as Game Script and Stage play as a stage play. Change the format in **Details → Script**, under Script settings.
- **Search, folders, Favourites, Private and Trash.** Search every script in the workspace from the top bar (with `type:`, `folder:`, `after:`, `before:` and quoted phrases, plus offline full-text search in the desktop app), organise projects into nested folders by dragging them onto folders in the sidebar or choosing **Move to folder** (with **Undo**), mark personal **Favourites**, keep personal drafts in **Private**, and restore deleted scripts from **Trash** within 30 days.

The Library is kept like a script, on the device and on the server, so it is still there after a reload and in another browser you sign in from. While you are online, the Library fetches each script that is not on this device yet, and the row opens on a click. Offline, such a row says "Not on this device" and does not open until the connection is back.

Every workspace but Your desk starts with seeded projects, nested folders (`Scripted` › `Features`, `Series`, `Books & Stage` and `Broadcast` › `Daily & Live`, `Audio` in Writers' room, plus studio subfolders in Lanternfield Studios), role-specific **Favourites**, personal **Private** drafts across all five registered people and recoverable **Trash**. Writers' room showcases all eight project kinds and all eight formats on first load — including _The Salt Almanac_ (Book showcasing cover & front/back matter, epigraph, subheading, drop cap, chapter target, footnote and an inline tide plate), _Pier Four at Low Water_ (Stage play), _Platform Two_ (Multi-camera series with Board and Trash), _Tin Boat_ (Animation with a `Record draft` ready for Pickup lines CSV and an inline storyboard frame), _The Harbour Tape_ (Podcast timing), live broadcast chyrons and reusable Show and News templates. Lanternfield Studios holds forty-one projects across all eight kinds, written after the demo opens; until they are all there, the workspace menu says how many are ready.

## The Tour

**Tour** in the demo bar opens the Tour panel, covering all 93 active scenarios across seven curated story tracks (plus desktop-specific scenarios when running the desktop app). Each scenario lists what to set up and what to check, and a scenario is shown only once its behaviour works in this build. To hide the Demo bar and Tour altogether and work in a quiet empty Library, use **Start in a clean workspace** on the opening screen.

## What to try

1. Choose any person except **You** and click **New script**.
2. Click the page, type `INT. LIGHTHOUSE - NIGHT`, press Escape to close the list of headings, then Enter. Type a line of action, press Tab, type a name, press Enter and type what they say. See [Writing a script](writing.md).
3. Watch the status beside the title: **Saved** as you type, then **Synced**.
4. Open **Demo controls** in the demo bar, click **Stop the server** and keep typing. The status says "Can't reach Manent, 1 waiting". Click the pinned **Start the server** button on the bar; after a few seconds it says **Synced** again.
5. Open your person menu at the left of the demo bar and click **Open a second window as …** (or click **Second window** on the bar). The same script opens in a companion window as another writer with live cursors drawn by name, and changes in either window merge immediately. See [Working together](working-together.md).
6. Open the command palette with Ctrl+K (⌘K on a Mac), type "Export" and press Enter. The Export screen opens; click **Export 1 file** to save the script as a PDF. See [Export and print](export-and-print.md).

## Let a second machine join

```sh
make demo LAN=1
```

The server then also listens on one private address of your machine (in 10.0.0.0/8, 172.16.0.0/12 or 192.168.0.0/16) and prints it as "On your network: …". It refuses a public address, because the demo has no passwords. Use it only on a network you trust.

A browser keeps Manent's offline copy of the app only on a secure address. `localhost` is one; a private address over plain HTTP is not, so the second machine needs the server to stay reachable.

## Change the ports or the data folder

`make demo` takes no options, but the script behind it does:

```sh
bun tools/demo/cli.ts demo --port 4800 --control-port 4801 --data-dir .manent-demo/second --no-open
```

| Option                | Default         | What it sets                                               |
| --------------------- | --------------- | ---------------------------------------------------------- |
| `--port`              | 4747            | The address of the app                                     |
| `--control-port`      | 4748            | The supervisor that the demo bar's buttons talk to         |
| `--data-dir`          | `.manent-demo/` | Where the demo data, the session key and the run file live |
| `--no-open`           | opens a browser | Leaves the browser closed                                  |
| `--lan`, `--lan-host` | off             | The same as `LAN=1`; `--lan-host` names the address        |

Stop it with `bun tools/demo/cli.ts stop --data-dir <the same folder>`.

## If something goes wrong

- **"Manent needs Bun 1.4.4 or later (found …)."** Install or update Bun with the command it prints, then run `make demo` again.
- **"Port 4747 is in use."** Another demo may still be running. Run `make stop`, or stop whatever holds the port.
- **"Manent is already running at …"** `make demo` found a demo that is still running and opened it, without building the web app again. After a change to the code, run `make stop` and then `make demo`.
- **"The packages could not be installed."** The lines above it say why; most often there is no network. Run `make demo` again once it is back.
- **"The web app could not be built."** The lines above it say why. On a fresh clone this is a bug: please [open an issue](https://github.com/HMarzban/manent/issues).
- **"No private network address was found on this machine."** `LAN=1` needs a private network address. Connect to the network, or name the address with `--lan-host`.
- **"Can't reach Manent. Start the server, then choose again."** The server is stopped. Click **Start the server** in the demo bar, or run `make demo` again.
- **"The demo is not running. Run make demo again."** The supervisor has gone. Run `make demo`.
- **"Couldn't load this screen. Your work is unaffected."** Click **Reload**. If the same screen comes back, open `http://localhost:4747/choose` and choose your person again.
- **The browser did not open.** Open `http://localhost:4747` yourself.
