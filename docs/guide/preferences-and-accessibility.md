# Preferences and accessibility

Open **Preferences** with Ctrl+, (⌘, on a Mac) or from the person menu in the Library. A search at the top finds a preference by name. It also answers for things there is nothing to set for, such as "Auto-save" or "Font". Choose **Set by you** in the left rail to view only preferences you have changed; each changed row carries a quiet accent dot, its default and **Reset**.

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
- **Theme hidden gems:** shows or hides subtle collector emblems paired with each studio palette. On by default.
- **White page in dark theme:** keeps the page white when the rest is dark. Off by default.
- **Match each project's format:** optionally switches palettes automatically to suit the format of the script you open (with per-format defaults and per-project overrides). Off by default so your chosen palette stays steady unless you turn it on.

## Keyboard

Every command and its key. Click a key to change it: "Press the new shortcut. Esc cancels, Delete removes it." Manent warns when a key is taken by another command or by the browser. Some keys are fixed, such as the Enter and Tab flow. See [Keyboard shortcuts](keyboard-shortcuts.md).

## Account

Who you are in the demo, and **Switch person**.

## This browser

- **Interface size:** 100 %, 125 %, 150 % or 200 %. It sizes the text and controls around the page; the page has its own zoom in **View ▾**.
- **From your system:** the motion and contrast settings Manent reads from your system. They are shown, not set here.
- **Stored here:** **Ask the browser to keep it** asks the browser not to clear Manent's storage when space runs low; **Offline** shows whether offline tools are ready, preparing, paused on Data Saver or online only in this browser (on a first visit, a calm bottom-left **Offline status** card also tracks background preparation across screens and confirms **Ready offline** once complete, staying silent on repeat visits); **Space used** shows current browser storage usage when available; Safari tabs show a note about installing to avoid seven-day storage clearing; and **Back up everything in this browser** downloads one `.zip` archive of every cached project on this device.
- **Install:** shown on the web when Manent is not already running as an installed app, offering **Install Manent** on browsers that support install prompts or concise **Add to Dock** / **Add to Home Screen** steps in Safari.
- **About:** the version, **Check for updates** (and **Reload to update** once a newer build is waiting in the background), the layout engine, "Manent sends no usage data.", the AI pledge (Manent has no features that write for you, and your scripts are never used to train AI) and Hidden Gem icon credits.

**Reset** returns one preference to its default, and **Reset all preferences** returns them all.

## Accessibility

What is built in:

- **Keyboard first.** Every command is in the palette and can have a key. F6 and Shift+F6 move between the regions of the window (the demo bar, the title bar, the page, the panels, the status bar). Escape closes the palette or a menu and returns to the page.
- **Focus.** Each screen has one heading, which takes focus when the screen opens. Focus returns where it was when a menu or a dialog closes.
- **Screen readers.** The status of a script, messages and alerts are announced through live regions. Element changes, page starts and people arriving or leaving can be announced as you write (Preferences → Writing → Announce while writing), and **Where am I?** in the command palette reads the whole place on request: the element, the speaker, the scene, the page and the status.
- **Words, not colour alone.** Every state is also said in words.
- **Motion and contrast** follow your system. To reduce motion, turn on reduced motion in your system settings.
- **Size.** Interface size up to 200 %, and the page's own zoom from 50 % to 300 %.

Automated accessibility checks (axe) run in the end-to-end tests on several screens. No audit with assistive technology users has been done yet.
