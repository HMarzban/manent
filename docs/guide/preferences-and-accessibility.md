# Preferences and accessibility

Open **Preferences** with Ctrl+, (⌘, on a Mac), from your avatar at the top right of any screen, or by jumping straight to **Preferences: Writing**, **Preferences: Appearance**, **Preferences: Account** or **Preferences: This browser** (**This device** on desktop) in the command palette (Ctrl+K / ⌘K). A search at the top finds a preference by name (framing results in grouped cards) and also answers for things there is nothing to set for, such as "Auto-save" or "Font". Choose **Set by you** in the left rail to view only preferences you have changed; panes with customisations show a quiet dot in the rail, each changed row shows its default and **Reset**, and a header **Undo** button reverses recent preference changes made during the visit.

Preferences, **Project settings** (`Format and style`, `Names and facts`, `People`, `Drafts`, plus `Templates` for Show and News) and **Workspace settings** (`People`, `Notifications`, `API keys`, `Broadcast`) share one left-rail layout that switches cleanly to a section menu on narrow windows and at 150–200 % interface sizes without sideways scrolling. In Project settings → **Format and style**, **Element style** lists each screenplay element on one collapsed line showing its real format defaults (capitals, spacing, indent and width); click any element to expand and edit it, reset one element, or **Reset all** with Undo.

Preferences are yours: they follow you to every device you sign in from and change nothing for anyone else. The settings under **This browser** stay in the browser they were set in. Script settings (format, paper, (MORE) and (CONT'D)) belong to the script and are shared; they are in **Details → Script**, under Script settings.

## Writing

| Preference                   | Choices                                                                                                       | Default                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| After Dialogue, Enter starts | Action, Character                                                                                             | Action                          |
| Typewriter scrolling         | On, off: keeps the line you are writing at the same height                                                    | Off                             |
| Check spelling as I type     | On, off: uses the browser's spelling check                                                                    | On                              |
| Show other people's cursors  | On, off                                                                                                       | On                              |
| Announce while writing       | Element changes; element changes and page starts; element changes, page starts and people arriving or leaving | Element changes and page starts |

## Appearance

- **Theme:** System, Light or Dark. The default is System.
- **App theme:** choose from 24 calibrated Light and Dark studio palettes designed for long writing sessions. Palette choices stay personal and never alter pagination, print paper or what collaborators see.
- **Theme hidden gems:** shows or hides the subtle collector emblem paired with each studio palette — shown in the Appearance gallery, the Studio Desk chooser folio and the trailing edge of the Library, Script, Rundown, Board and Settings status bars (hidden in forced colours and print). Click any active gem (or the emblem medallion in the Appearance banner) to open its Collector Vitrine with a bespoke interactive animation for that theme (3D tilt, click-to-burst micro-reactions including a live `d20` roll on _Gilded die_, hold-to-charge replay, optional muted-by-default sound foley, `‹` / `›` browsing across all 24 themes with one-click **Apply theme** or **Change theme**, edition number `01 / 24`–`24 / 24`, private `N of 24 kept` tally and poetic whisper); reduced motion shows a calm still frame. On by default.
- **White page in dark theme:** keeps the page white when the rest is dark. Off by default.
- **Match each project's format:** optionally switches palettes automatically to suit the format of the script you open (with per-format defaults and per-project overrides). Off by default so your chosen palette stays steady unless you turn it on.

## Keyboard

Every command and its key, with an inline search filter, a **Custom only** toggle and **Reset shortcuts**. Click a key to change it: "Press the new shortcut. Esc cancels, Delete removes it." Manent warns when a key is taken by another command or by the browser. Some keys are fixed, such as the Enter and Tab flow. See [Keyboard shortcuts](keyboard-shortcuts.md).

## Account

Who you are in the demo (with person avatars and an offline notice on desktop when disconnected), **Switch person**, **Your workspaces** (linking straight into each workspace's settings) and sign-out controls. While Clean workspace mode is active, a quiet **Demo and Tour** section lets you **Turn Demo and Tour back on** without touching your own scripts.

## This browser / This device

- **Interface size:** 100 %, 125 %, 150 % or 200 %. It sizes the text and controls around the page; the page has its own zoom in **View ▾**.
- **From your system:** the motion and contrast settings Manent reads from your system. They are shown, not set here.
- **Connection (desktop app):** shows live online/offline reachability with an on-demand **Check connection** probe, alongside **Show folder** and **Copy path** for local SQLite storage, registered **File types** (`.fdx`, `.fountain`, `.ink`, `.docx`) and **Restart to update** when a desktop update is staged.
- **Stored here (browser):** **Ask the browser to keep it** asks the browser not to clear Manent's storage when space runs low; **Offline** shows whether offline tools are ready, preparing, paused on Data Saver or online only in this browser (on a first visit, a calm bottom-left **Offline status** card also tracks background preparation across screens and confirms **Ready offline** once complete, staying silent on repeat visits); **Space used** shows current browser storage usage when available; Safari tabs show a note about installing to avoid seven-day storage clearing; and **Back up everything in this browser** downloads one `.zip` archive of every cached project on this device.
- **Install (browser):** shown on the web when Manent is not already running as an installed app, offering **Install Manent** on browsers that support install prompts or concise **Add to Dock** / **Add to Home Screen** steps in Safari.
- **Demo and Tour:** shown only while Clean workspace mode is active, offering **Turn Demo and Tour back on** to restore the Demo bar, sample workspaces and Tour while keeping all of your own scripts intact.
- **About:** the version, **Check for updates** (with **Reload to update** on the web or **Restart to update** on desktop), the layout engine, "Manent sends no usage data.", the AI pledge (Manent has no features that write for you, and your scripts are never used to train AI) and Hidden Gem icon credits. In the desktop app, **Manent → About Manent** also opens this information in a dedicated theme-matched About window with **Copy details**.

**Reset** returns one preference to its default, and **Reset all preferences** returns them all.

## Accessibility

What is built in:

- **Keyboard first.** Every command is in the palette and can have a key. F6 and Shift+F6 move between the regions of the window (the demo bar, the title bar, the page, the panels, the status bar). In Library Search, ArrowDown and ArrowUp move straight through results; Beside splitters resize with the arrow keys (`Home`/`End` to bounds); on narrow screens (`< 768 px`), the Library navigation rail opens as a slide-in drawer that closes with Escape and returns focus to its toggle button. Escape closes the palette, a menu or an overlay panel and returns focus to the page or trigger.
- **Focus.** Each screen has one heading, which takes focus when the screen opens. Focus returns where it was when a menu or a dialog closes.
- **Screen readers.** The status of a script, messages and alerts are announced through live regions. Element changes, page starts and people arriving or leaving can be announced as you write (Preferences → Writing → Announce while writing), and **Where am I?** in the command palette reads the whole place on request: the element, the speaker, the scene, the page and the status.
- **Words, not colour alone.** Every state is also said in words.
- **Motion and contrast** follow your system. To reduce motion, turn on reduced motion in your system settings.
- **Size.** Interface size up to 200 %, and the page's own zoom from 50 % to 300 %.

Automated accessibility checks (axe) run in the end-to-end tests on several screens. No audit with assistive technology users has been done yet.
