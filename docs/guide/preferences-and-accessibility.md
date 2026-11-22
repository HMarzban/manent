# Preferences and accessibility

Open **Preferences** with Ctrl+, (⌘, on a Mac) or from the person menu in the Library. A search at the top finds a preference by name. It also answers for things there is nothing to set for, such as "Auto-save" or "Font".

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
- **White page in dark theme:** keeps the page white when the rest is dark. Off by default.

## Keyboard

Every command and its key. Click a key to change it: "Press the new shortcut. Esc cancels, Delete removes it." Manent warns when a key is taken by another command or by the browser. Some keys are fixed, such as the Enter and Tab flow. See [Keyboard shortcuts](keyboard-shortcuts.md).

## Account

Who you are in the demo, and **Switch person**.

## This browser

- **Interface size:** 100 %, 125 %, 150 % or 200 %. It sizes the text and controls around the page; the page has its own zoom in **View ▾**.
- **From your system:** the motion and contrast settings Manent reads from your system. They are shown, not set here.
- **Stored here:** **Ask the browser to keep it** asks the browser not to clear Manent's storage when space runs low.
- **About:** the version and the layout engine, "Manent sends no usage data.", and the AI pledge: Manent has no features that write for you, and your scripts are never used to train AI.

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
