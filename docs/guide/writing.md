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
- `*`, `+`, `-`, `{` or `#` starts a General line in Game Script, for choices, gathers, conditions and `#set` flags; choose **Play** in the title bar (or **Play from here** in the title menu) to test choices, flags and stage cues beside the script.
- On Enter, a line in capitals ending in `TO:` becomes a Transition, and `ACT ONE`, `TEASER`, `TAG` or `END OF ACT ONE` becomes the act break of that name.
- In **Manuscript (Book)**, typing `***` or `---` on a Body line and pressing Enter turns the line into a centred **Break** and starts a new Body paragraph below it.

Ink has none of these.

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

- Bold (Ctrl+B), Italic (Ctrl+I), Underline (Ctrl+U), Strikethrough, All-caps, Superscript and Subscript.
- Text colour and Highlight, each with a short list of colours.
- Align left, Align centre, Align right, and Space before.
- Dual dialogue (Ctrl+D) puts two speeches side by side. It needs two speeches in a row.
- Page break (Ctrl+Enter).

**Details → Selection → Layout** sets the alignment, indent, width and space before of the selected lines.

### Writing a book (Manuscript)

On a **Book (Manuscript)** document, a compact floating **Book Format Bar** sits top-centre over the page (toggleable from **View ▾ → Format bar**, and never shown on screenplays, stage plays, variety or Ink):

- **Element & inline craft:** Switch between **Chapter**, **Body**, **Quote** and **Break**; toggle **Bold**, **Italic**, **Underline**; pick **Text colour** and **Highlight** with live swatch indicators; or open **More text styles** (`T ▾`) for **Strikethrough**, **All-caps**, **Superscript**, **Subscript**, inline **Link** and **Clear style** — keeping your caret and text selection intact as you click.
- **Paragraph & opening styles:** Choose **Left / Centre / Right** alignment directly, toggle a 1-click **Drop cap** on the opening paragraph of a chapter, or open **Space & indent** (`¶ ▾`) for **Indent / Flush left / Drop cap / Raised cap** openings, **Space before** (`0–10` lines), **Indent** and **Width** steppers, the **Ruler**, and **Reset layout**.
- **Insert & Page layout:** Insert a **New chapter**, **Quote**, **Break**, **Page break** or **Figure** (`+ ▾`), or open **Page layout** for **US Letter / A4**, **Single / Double** line spacing, **Lines per page**, running header presets (whose Section slot resolves chapter headings automatically), **White page**, and direct jumps to **Title page**, **Book style** and **Header and footer**.
- **Book counts & chapters:** The status bar shows a live manuscript word count alongside the page number, **Details → Numbers** reports **Pages**, **Chapters**, **Words** and reading time, and the **Chapters** sidebar lets you add titled chapters directly.

## Paste

Text pasted from another app comes in one paragraph to an element. Fountain or Final Draft text becomes the elements it describes, and Manent says "Pasted as 12 elements. Undo to paste as plain text." One Undo turns it back into plain text. To bring in a whole file, see [Import a script](export-and-print.md#import-a-script).

## Moving around

The **Scenes** tab of the left panel lists the script's acts, sections and scenes in List or Cards view, each with its length in eighths of a page, writer assignment and progress; click one to go there or reorder scenes by drag, keyboard or row menu. As you scroll away from where you are typing, **Ghost Follow** marks the scene currently in view with a subtle dashed indicator in both List and Cards views, gently keeps it in sight as long as you are not browsing the panel yourself, and shows a compact `Viewing …` / `Back to …` strip beneath the toolbar so one click returns to your caret. From anywhere, **Ctrl+K** (⌘K) also jumps straight to **Scenes** (**Chapters** / **Knots**), **Cuts**, **Details**, **Comments**, **Checks**, **Board** (on a series episode) or inline **Lines per page**, **Read rate** and **Target length** prompts. **Find** (Ctrl+F) and **Go to** (Ctrl+G) are described in [Keyboard shortcuts](keyboard-shortcuts.md#find-and-go-to).

## Inline images and broadcast chyrons

Insert an inline graphic block anywhere on the page using **Insert image**, **Insert lower third**, **Insert over the shoulder** or **Insert full screen** from the command palette (Ctrl+K / ⌘K) or the element menu:

- **Kinds and captions.** Choose between **Image**, **Lower third**, **Over the shoulder** and **Full screen**, and edit the graphic's caption directly on the page.
- **Picking an image.** **Insert image** (or **Choose image…** on an empty graphic block) opens the system file picker straight away for PNG, JPEG or WebP files (up to 5 MB per file, 4,096 px wide or tall, and 200 MB per project).
- **Details → Selection.** Adjust the block's **Height** in lines (so screen, print and PDF keep identical page breaks), add an optional **Cue tag** (for example `Cue 1`), write a **Description** for readers and screen readers, or **Replace image…** and **Remove image**.
- **Offline caching and export.** Images are stored in the project's offline asset cache and sync when connected; an image not yet fetched on the current device shows **Not on this device yet** with **Try again**. Graphics render at their chosen height in PDF and print, round-trip in Project archives, and write cleanly to FDX, Fountain and prompter exports; see [Export and print](export-and-print.md).

## Show and News templates

Show and News projects support reusable templates for recurring rundowns and scripts:

- **Save template…** (from **Title ▾** or the command palette) saves the open rundown or script as **This project's default** or **Shared in** your workspace. Saving a rundown template keeps rows, headers and columns while clearing dates, timings and previous values; saving a script template keeps structure and headings while clearing comments and revision marks. Each new document created from a template receives fresh block and row identifiers.
- **Project settings → Templates** manages **Default rundown** and **Default script** (with **Clear** to start blank again), promotes any shared workspace template via **Use as this project's default**, or removes templates you no longer need.
- **New rundown split menu.** Once a project default or shared workspace template exists, **New rundown** in the Library shows a split menu beside it offering the default template, each shared template and **Blank rundown**.

## Tools while writing

- **Alternate lines and Cuts.** Keep alternate readings on a speech behind a `1/n` marker (swap in one undo step, or open **Alternates** under **Title ▾ → Tools**), or move trimmed passages to **Cuts** and restore them later.
- **Writing tools and reports.** Open **Title ▾ → Tools** (or the command palette) for **Rename character…** (one undo across cues, dialogue and action), **Read aloud**, **Reports…** and **Alternates**; use the command palette for **Focus mode**, daily writing goals and timed sprints, or check **Details → Numbers** for scene counts, runtime, dialogue totals and a direct **Reports…** button.
- **Contextual mode controls.** Standard screenplays keep a quiet title bar and status bar. Specialised modes surface one contextual trigger where you need it: Ink and Game Scripts add a **Play** button in the title bar beside **History** (opening the live Ink player Beside with status-bar compile-problem counts on Ink, or the live Game Script player Beside with scene switching, editable Flags and toggleable Emote/Camera/Engine cues on Game Script), series episodes add a **Board** button to jump to the season board, and non-screenplay formats show a quiet format cue in the status bar that opens **Details → Script**.
- **Series Overview & Series Board.** Series projects open on a showrunner **Series Overview** with a season masthead, summary strip, inline stage/due/writer management, collapsible empty seasons and a filter bar for six or more episodes. The **Series Board** lays storylines across episodes in a sticky 2D matrix defaulting to **Fit** density (with **Standard** and **Smaller** options, episode-snapping horizontal scroll, storyline lane colours, on-demand scene preview peek on hover or `I`, room flags, card duplication, `⌘/Ctrl+Enter` rapid multi-card entry, archival landscape printing and single-key room shortcuts `/`, `[`, `]`, `N`, `L`, `U`, `D`, `F`, `I`).
- **Comments and notes.** Add private writers-only notes with `[[`, or share Comments and review rounds in the side panel; see [Working together](working-together.md).
