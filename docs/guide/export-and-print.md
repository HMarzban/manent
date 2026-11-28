# Export, print and import

A script leaves Manent as a PDF, Word (`.docx`, for Books), Sides PDF, Final Draft (FDX), Fountain, Game Script line data (JSON or XML), Ink (`.ink` or compiled JSON), CSV or PDF report, rundown export, Project archive zip or on paper, and comes in from FDX, Fountain, text-based PDF, Word (`.docx`) or plain text. The PDF and the print are drawn from the same page layout you see while you write, so the pages break in the same places.

## Export a file

1. Open the script (or choose **Export…** on a project's row menu in the Library for a **Project archive** zip).
2. Choose **Export…** from **Title ▾** (click the script's title), or open the command palette with Ctrl+K (⌘K on a Mac) and type "Export".
3. The Export screen shows what will go and the pages as they will look. Under **As**, choose the format for that kind of document:
   - **Scripts:** **Clean PDF**, **Sides PDF** (locked scripts, choosing scenes so other scenes' lines are struck through), **FDX**, **Fountain**, CSV or PDF **Character / Scene / Location reports**, **Game Script JSON** or **XML** line data, and **Animation Pickup lines CSV**. Inline images and broadcast chyrons render at their chosen line height in PDF and print, round-trip in Project archives, and write cleanly to FDX and Fountain with their cue tags and captions.
   - **Books (Manuscripts):** **Clean PDF** and **Word (`.docx`)** (pure offline OOXML preserving chapters, quotes, scene breaks, page breaks, inline styles, text colours, highlights, superscripts, subscripts, links, drop caps, raised caps, flush openings, paper geometry and single/double line spacing).
   - **Ink:** whole-project **`.ink`** source (in Library order) or **compiled Ink JSON**.
   - **Rundowns:** **Rundown PDF** (with selectable columns), **All scripts as one PDF**, **Two-column PDF**, **Prompter text**, **Brackets list** or **Rundown JSON**.
   - **Projects:** **Project archive (`.zip`)** holding every script's FDX, Fountain, named-draft JSON files, cached project images and a manifest.
4. Click **Export 1 file**. Manent saves the file offline on your device and confirms what was exported.

In the desktop app, **Export everything on this device…** backs up every local script on your disk in one archive, and desktop **Prompter files** folder output writes `run-order.txt` and `NN-<slug>.txt` in UTF-8 or Windows-1252 (verified against Manent's own reader only).

If the script holds a character that the script font cannot draw, the **Checks** row of a PDF names it and says that it prints as a box. The page also marks such text while you write. For FDX and Fountain, the **Checks** row names anything the format cannot hold and leaves out of the file.

## Print

Choose **Print…** from **Title ▾** or press Ctrl+P (⌘P). The Print screen says how many pages will print. Manent prepares the pages ("Preparing 12 pages…") and then opens the browser's print dialog.

On the **Series Board**, click **Print board**, choose **Print board** from the command palette, or press Ctrl+P (⌘P) to print a landscape archival wall-board sheet with the season masthead and unclipped beat cards.

## Import a script

Choose **Import…** in the Library or from the command palette, or drop a file anywhere on the window. Manent opens `.fdx`, `.fountain`, text-based `.pdf`, Word (`.docx`) and plain-text files of up to 32 MB offline, each as a new script in the workspace you are in, and says what came in: "Imported '<title>': 12 pages, 30 scenes, 4 notes."

- **From Final Draft**, the script keeps its elements, dual dialogue and notes, and its revision marks come in as marked by hand. A file whose page numbers were locked in Final Draft is locked the same way, with its pages starting where Final Draft started them, once the script has synced. The page count can still differ from Final Draft's. What Manent does not show, such as the title page or Final Draft's own settings, is kept with the script and written back when it is exported as FDX.
- **From Fountain**, the elements, dual dialogue, notes and sections come in. What Manent does not show, such as the title page, is kept with the script and written back when it is exported as Fountain.
- **From PDF, Word (`.docx`) or plain text**, Manent reads text-based scripts directly in the browser or desktop app and reports anything it could not place in the summary line.
- **Details → Import** says which file the script came from, when, and what came in but is not shown.
- **The same file again** opens the script it made before ("Opened '<title>', imported on …"), with **Import again as a new script** beside it.

In the desktop app, **Open…** (Ctrl+O, ⌘O on a Mac) and a file opened from the system import the same way.

Fountain or Final Draft text pasted into a script also becomes elements; see [Writing a script](writing.md#paste).

## Issue a revision

Once a script's page numbers are locked for production (see [Working together](working-together.md#production-revisions)), its revisions go out from the Send screen. **Issue Blue…** (named for the active revision's colour) in the state bar or the command palette opens a form with:

- **Checks**, such as "Scene numbers unchanged" and "Locked page numbers intact";
- **What**: the changed pages, or the full draft in that colour;
- **As**: a PDF with asterisks beside changed lines, or a clean PDF, with revised pages tinted if you choose;
- **To**: who receives it;
- **Colour** and **Memo**, and the pages as they will go out, with their revision headers.

Issuing starts the next colour: edits made afterwards are marked in it. **Recall…** withdraws the last revision within a day of its issue and sends a correction with only the pages you choose.

## Limits in this build

- Print is not available for Ink scripts; export whole-project `.ink` source or compiled Ink JSON instead.
- Final Draft's older `.fdr` files are not read. Manent says to open one in Final Draft 8 or later, save it as an `.fdx` file and import that.
