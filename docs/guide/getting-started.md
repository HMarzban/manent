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

## Choose who you are

![The "Choose who you are" screen, listing the six demo people and their roles](../images/choose-who-you-are.png)

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

Each browser tab is its own person, so two tabs can be two people. A new tab asks who you are before it shows anything, even when it opens on a script's address, and then goes on to that address. Switch person from the bar at the top ("Person: …") or from the person menu in the Library.

## The demo bar

A purple bar labelled **Demo** sits at the top of every screen. It shows who you are (click to switch) and whether the server is running, and has these controls:

- **Connection: Online, Offline, Slow.** Cuts this tab's connection, or slows it, so you can see Manent work without one. See [Saving and syncing](saving-and-syncing.md#working-without-a-connection).
- **Stop the server** and **Start the server**, for every tab at once.
- **Tour**, once you have chosen a person, opens the Tour panel.

## The Library

The Library lists the projects of one workspace. Choose the workspace from the menu at the top left. Each demo person belongs to one or more workspaces, such as a personal desk, a writers' room or a studio.

- **New script** makes a film project with one empty script and opens it.
- **Import…** makes a script from a Final Draft or Fountain file; see [Import a script](export-and-print.md#import-a-script).
- **New project** offers Film, Series, Show, News, Podcast, Book, Game and Stage play. In this build every kind starts with one Screenplay script; change its format in **Details → Script**, under Script settings.

The Library is kept like a script, on the device and on the server, so it is still there after a reload and in another browser you sign in from. A script that is not on this device yet says "Not on this device".

## The Tour

**Tour** in the demo bar opens the Tour panel. It is meant to be a guided walk through the demo; in this build it shows no scenarios yet.

## What to try

1. Choose any person except **You** and click **New script**.
2. Click the page, type `INT. LIGHTHOUSE - NIGHT`, press Escape to close the list of headings, then Enter. Type a line of action, press Tab, type a name, press Enter and type what they say. See [Writing a script](writing.md).
3. Watch the status beside the title: **Saved** as you type, then **Synced**.
4. Click **Stop the server** in the demo bar and keep typing. The status says "Can't reach Manent, 1 waiting". Click **Start the server**; after a few seconds it says **Synced** again.
5. Copy the script's id: the part of the address after `/s/`. In a new tab, open `http://localhost:4747/choose?next=/s/<id>` with that id in place of `<id>`, and choose the same person. The script opens there too, with the other tab's cursor drawn by name, and a change in either tab appears in both. See [Working together](working-together.md).
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
