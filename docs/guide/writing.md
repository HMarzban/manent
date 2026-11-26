# Writing a script

How to type a script in Manent: the formats, the elements, and the keys that move a line from one element to the next.

## Formats

A script has one format. Choose it in **Details → Script**, under Script settings → Format. The script settings are shared with everyone on the script.

| Format       | Elements                                                                             |
| ------------ | ------------------------------------------------------------------------------------ |
| Screenplay   | Scene Heading, Action, Character, Parenthetical, Dialogue, Transition, Shot, General |
| Multi-camera | The same as Screenplay                                                               |
| Animation    | The same as Screenplay                                                               |
| Variety      | Slug, Bracket, Character, Parenthetical, Dialogue, Transition, Shot, General         |
| Game Script  | The Screenplay elements, and Emote, Camera and Engine Direction                      |
| Ink          | Ink line                                                                             |
| Manuscript   | Chapter, Body, Quote, Break                                                          |
| Stage play   | Scene, Stage direction, Character, Parenthetical, Dialogue, General                  |

Every format also has Section, the act breaks (New Act, End of Act, Teaser, Tag scene) and Page break. A Section names a group of scenes and never prints. In a Podcast project, Variety's Slug is called Segment and its Bracket is called Cue.

Script settings also hold the paper (US Letter or A4), "(MORE) and (CONT'D) at page breaks", "Same-speaker (CONT'D)" and "Scene CONTINUED".

Every script is set in Courier Prime, on pages laid out as they print. The page count and the page you are on are in the status bar ("Page 3 of 12"). A character the script font cannot draw is marked on the page; it prints as a box.

## Tab and Enter

You rarely choose an element by hand. Enter and Tab pick the next one for you, as in other screenplay software. The table is for Screenplay; the other formats read it through their own elements (see below).

| On a line of…                | Enter, with text | Tab, at the end of text  | Tab, on an empty line | Enter, on an empty line |
| ---------------------------- | ---------------- | ------------------------ | --------------------- | ----------------------- |
| Scene Heading                | Action           | Next part of the heading | Action                | Opens the picker        |
| Action, General              | Action           | Character                | Character             | Opens the picker        |
| Character                    | Dialogue         | Parenthetical            | Transition            | Action                  |
| Parenthetical                | Dialogue         | Dialogue                 | Dialogue              | Dialogue                |
| Dialogue                     | Action ¹         | Parenthetical            | Character             | Action                  |
| Transition, Section, New Act | Scene Heading    | Scene Heading            | Scene Heading         | Opens the picker        |
| Shot                         | Action           | Action                   | Action                | Opens the picker        |
| End of Act                   | New Act          | New Act                  | New Act               | Opens the picker        |

¹ Or Character: set it in **Preferences → Writing → After Dialogue, Enter starts**.

- **Scene Heading.** Tab at the end of the text adds the next part: a space, then " - ", then, once a time of day follows, a new line.
- **Shift+Tab** on an empty line goes back the way Tab came.
- **Tab never leaves the page.** Use F6 to move to another part of the window.
- **Variety** reads Slug for Scene Heading and Bracket for Action.
- **Stage play** has no Transition or Shot: where the table names either, Stage play uses Stage direction.
- **Manuscript.** Enter after a Chapter or a Break starts Body. Tab at the end of Body starts a Quote. Enter after a Quote returns to Body.
- **Ink.** Every line is an Ink line, and Tab does nothing.

## Typing shortcuts

Some lines change element as you type them:

- `INT. `, `EXT. `, `EST. ` or `I/E. ` at the start of an Action line makes it a Scene Heading.
- `(` after a Character or Dialogue line makes a Parenthetical.
- `[` starts a Bracket in Variety.
- `*`, `+`, `-`, `{` or `#` starts a General line in Game Script, for choices and gathers.
- On Enter, a line in capitals ending in `TO:` becomes a Transition, and `ACT ONE`, `TEASER`, `TAG` or `END OF ACT ONE` becomes the act break of that name.

Ink and Manuscript have none of these.

## The element picker

Press **Alt+Enter** (⌥↵ on a Mac), or click the **Element** button in the status bar, to choose the element of the current line. In the picker, the arrow keys move, Enter chooses and Escape closes. Each element also has a number key while the picker is open:

| Key | Screenplay    | Notes                                                   |
| --- | ------------- | ------------------------------------------------------- |
| 1   | Scene Heading | Slug in Variety, Chapter in Manuscript                  |
| 2   | Action        | Bracket in Variety, Body in Manuscript, Ink line in Ink |
| 3   | Character     |                                                         |
| 4   | Parenthetical |                                                         |
| 5   | Dialogue      | Quote in Manuscript                                     |
| 6   | Transition    | Break in Manuscript; not in Stage play                  |
| 7   | Shot          | Not in Stage play                                       |
| 8   | Section       |                                                         |
| 9   | New Act       |                                                         |
| 0   | General       |                                                         |
| E   | End of Act    |                                                         |
| M   | Emote         | Game Script only. C is Camera and G is Engine Direction |

A format offers only its own elements: Manuscript has 1, 2, 5, 6, 8, 9 and E, and Ink has 2, 8, 9 and E.

The first nine elements also have a shortcut from anywhere on the page: Ctrl+1 to Ctrl+9 (⌘1 to ⌘9 on a Mac). See [Keyboard shortcuts](keyboard-shortcuts.md).

## Names and headings as you type

While you type a Character, a Scene Heading or a Transition, Manent offers the names, headings and transitions already in the script. The arrow keys move through them, Enter or Tab chooses one, and Escape closes the list.

## Styles and layout

Open the command palette with **Ctrl+K** (⌘K) and type the name of a style:

- Bold (Ctrl+B), Italic (Ctrl+I), Underline (Ctrl+U), Strikethrough, All-caps.
- Text colour and Highlight, each with a short list of colours.
- Align left, Align centre, Align right, and Space before.
- Dual dialogue (Ctrl+D) puts two speeches side by side. It needs two speeches in a row.
- Page break (Ctrl+Enter).

**Details → Selection → Layout** sets the alignment, indent, width and space before of the selected lines.

## Paste

Text pasted from another app comes in one paragraph to an element. Fountain or Final Draft text becomes the elements it describes, and Manent says "Pasted as 12 elements. Undo to paste as plain text." One Undo turns it back into plain text. To bring in a whole file, see [Import a script](export-and-print.md#import-a-script).

## Moving around

The **Scenes** tab of the left panel lists the script's acts, sections and scenes, each with its length in eighths of a page; click one to go there. As you scroll away from where you are typing, **Ghost Follow** marks the scene currently in view with a subtle dashed indicator in both List and Cards views, gently keeps it in sight as long as you are not browsing the panel yourself, and shows a compact `Viewing …` / `Back to …` strip beneath the toolbar so one click returns to your caret. **Find** (Ctrl+F) and **Go to** (Ctrl+G) are described in [Keyboard shortcuts](keyboard-shortcuts.md#find-and-go-to).

## Not in this build

- Comments.
