// Book Title & Matter front sheet rendered above page 1 for Book (manuscript) documents:
// cover picker, Title / Subtitle / Author, and progressive-disclosure Copyright/ISBN, Dedication, Acknowledgements and About-the-author sections.
import type { PageProfile } from "@manent/pagination";
import type { BookMatterField, TitlePageField } from "@manent/schema";
import type { LayoutView } from "../page/config.ts";
import { screenPagePx } from "../page/profile-css.ts";
import type { TitlePageSource } from "../script-editor/ports.ts";
import type { FieldKeys } from "./fields.ts";

type MatterKey = "copyright" | "dedication" | "acknowledgments" | "aboutAuthor";
const MATTER_KEYS: readonly MatterKey[] = [
  "copyright",
  "dedication",
  "acknowledgments",
  "aboutAuthor",
];

export interface BookFrontSheetController {
  render(profile: PageProfile, editable: boolean, view: LayoutView): number;
  focusTitle(): void;
  destroy(): void;
}

function makeEditableField(
  doc: Document,
  label: string,
  className: string,
  keys: FieldKeys,
  onWrite: (text: string) => void,
): HTMLDivElement {
  const el = doc.createElement("div");
  el.className = `mn-book-field ${className}`;
  el.setAttribute("role", "textbox");
  el.setAttribute("aria-label", label);
  el.setAttribute("aria-multiline", "true");
  el.dataset["placeholder"] = label;
  el.addEventListener("input", () => {
    const text = el.textContent ?? "";
    if (text === "") el.replaceChildren();
    onWrite(text);
  });
  el.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    const mod = keys.platform === "mac" ? event.metaKey : event.ctrlKey;
    if (!mod || event.altKey) return;
    const k = event.key.toLowerCase();
    if (k === "z") {
      event.preventDefault();
      keys.history(event.shiftKey);
    } else if (k === "y" && keys.platform !== "mac" && !event.shiftKey) {
      event.preventDefault();
      keys.history(true);
    }
  });
  return el;
}

function setFieldEditable(
  el: HTMLElement,
  label: string,
  editable: boolean,
): void {
  if (editable) {
    el.contentEditable = "plaintext-only";
    el.dataset["placeholder"] = label;
    el.removeAttribute("aria-readonly");
  } else {
    el.removeAttribute("contenteditable");
    delete el.dataset["placeholder"];
    el.setAttribute("aria-readonly", "true");
  }
}

function syncFieldText(el: HTMLElement, value: string): void {
  if (el.ownerDocument.activeElement === el) return;
  if ((el.textContent ?? "") !== value) el.textContent = value;
}

/** Creates the live Book front-matter sheet mounted inside `host` (`scaffold.front`). */
export function createBookFrontSheet(options: {
  readonly host: HTMLElement;
  readonly titlePage: TitlePageSource;
  readonly keys: FieldKeys;
  readonly onChange: () => void;
}): BookFrontSheetController {
  const { host, titlePage, keys, onChange } = options;
  const matter = titlePage.bookMatter!;
  const doc = host.ownerDocument;
  const sheet = doc.createElement("div");
  sheet.className = "mn-front-sheet mn-book-front";
  sheet.dataset["bookFront"] = "1";

  // Cover band
  const coverBand = doc.createElement("div");
  coverBand.className = "mn-book-cover";
  const coverImg = doc.createElement("img");
  coverImg.className = "mn-book-cover-img";
  coverImg.alt = "";
  const coverActions = doc.createElement("div");
  coverActions.className = "mn-book-cover-actions";

  const pickBtn = doc.createElement("button");
  pickBtn.type = "button";
  pickBtn.className = "mn-book-chip";
  pickBtn.addEventListener("click", () => {
    const picker = matter.port.pickCover;
    if (picker === undefined) return;
    void picker().then((assetId) => {
      if (assetId !== null && assetId !== "") {
        matter.port.set("coverAssetId", assetId);
        onChange();
      }
    });
  });

  const removeCoverBtn = doc.createElement("button");
  removeCoverBtn.type = "button";
  removeCoverBtn.className = "mn-book-chip mn-book-chip-muted";
  removeCoverBtn.textContent = matter.words.removeCover;
  removeCoverBtn.addEventListener("click", () => {
    matter.port.set("coverAssetId", "");
    onChange();
  });

  coverActions.append(pickBtn, removeCoverBtn);
  coverBand.append(coverImg, coverActions);

  // Core title-page fields: Title, Subtitle, Author
  const core = doc.createElement("div");
  core.className = "mn-book-core";
  const writeTitleField = (field: TitlePageField) => (text: string) =>
    titlePage.port.set(field, text);
  const writeMatterField = (field: BookMatterField) => (text: string) =>
    matter.port.set(field, text);

  const titleEl = makeEditableField(
    doc,
    titlePage.words.title,
    "mn-book-title",
    keys,
    writeTitleField("title"),
  );
  const subtitleEl = makeEditableField(
    doc,
    matter.words.subtitle,
    "mn-book-subtitle",
    keys,
    writeMatterField("subtitle"),
  );
  const authorEl = makeEditableField(
    doc,
    titlePage.words.authors,
    "mn-book-author",
    keys,
    writeTitleField("authors"),
  );
  core.append(titleEl, subtitleEl, authorEl);

  // Progressive-disclosure matter sections + chip bar
  const openKeys = new Set<MatterKey>();
  const sectionsWrap = doc.createElement("div");
  sectionsWrap.className = "mn-book-sections";
  const sectionEls = new Map<
    MatterKey,
    { wrap: HTMLDivElement; input: HTMLDivElement; isbnInput?: HTMLDivElement }
  >();

  for (const key of MATTER_KEYS) {
    const wrap = doc.createElement("div");
    wrap.className = "mn-book-matter-group";
    wrap.dataset["matter"] = key;
    const heading = doc.createElement("div");
    heading.className = "mn-book-matter-label";
    heading.textContent = matter.words[key];
    const input = makeEditableField(
      doc,
      matter.words[key],
      key === "dedication" ? "mn-book-dedication" : "mn-book-matter-body",
      keys,
      writeMatterField(key),
    );
    wrap.append(heading, input);
    let isbnInput: HTMLDivElement | undefined;
    if (key === "copyright") {
      const isbnLabel = doc.createElement("div");
      isbnLabel.className = "mn-book-matter-label mn-book-isbn-label";
      isbnLabel.textContent = matter.words.isbn;
      isbnInput = makeEditableField(
        doc,
        matter.words.isbn,
        "mn-book-isbn",
        keys,
        writeMatterField("isbn"),
      );
      wrap.append(isbnLabel, isbnInput);
    }
    sectionsWrap.append(wrap);
    sectionEls.set(key, { wrap, input, isbnInput });
  }

  const chipBar = doc.createElement("div");
  chipBar.className = "mn-book-chips";
  const chipBtns = new Map<MatterKey, HTMLButtonElement>();
  for (const key of MATTER_KEYS) {
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.className = "mn-book-chip";
    btn.textContent = matter.words.addMatter(matter.words[key]);
    btn.addEventListener("click", () => {
      openKeys.add(key);
      onChange();
      sectionEls.get(key)?.input.focus();
    });
    chipBar.append(btn);
    chipBtns.set(key, btn);
  }

  sheet.append(coverBand, core, sectionsWrap, chipBar);
  host.append(sheet);

  let resolvedCoverId = "";
  let coverUrl = "";
  let destroyed = false;

  const unsubscribeMatter = matter.port.subscribe(onChange);

  return {
    render(profile, editable, view) {
      const tp = titlePage.port.get();
      const bm = matter.port.get();
      sheet.dataset["bookSerif"] =
        profile.typography?.kind === "book_serif" ? "1" : "0";
      sheet.style.top = "0px";

      // Cover resolution
      const coverId = bm.coverAssetId.trim();
      if (coverId !== resolvedCoverId) {
        resolvedCoverId = coverId;
        coverUrl = "";
        coverImg.style.display = "none";
        if (coverId !== "" && matter.port.resolveCoverUrl !== undefined) {
          void matter.port.resolveCoverUrl(coverId).then((url) => {
            if (destroyed || resolvedCoverId !== coverId || url === null)
              return;
            coverUrl = url;
            coverImg.src = url;
            coverImg.style.display = "block";
            onChange();
          });
        }
      }
      const hasCover = coverId !== "";
      coverImg.style.display = hasCover && coverUrl !== "" ? "block" : "none";
      pickBtn.textContent = hasCover
        ? matter.words.replaceCover
        : matter.words.addCover;
      pickBtn.style.display =
        editable && matter.port.pickCover !== undefined ? "" : "none";
      removeCoverBtn.style.display = editable && hasCover ? "" : "none";
      coverBand.style.display =
        hasCover || (editable && matter.port.pickCover !== undefined)
          ? ""
          : "none";

      // Core fields
      setFieldEditable(titleEl, titlePage.words.title, editable);
      setFieldEditable(subtitleEl, matter.words.subtitle, editable);
      setFieldEditable(authorEl, titlePage.words.authors, editable);
      syncFieldText(titleEl, tp.title);
      syncFieldText(subtitleEl, bm.subtitle);
      syncFieldText(authorEl, tp.authors);

      // Progressive-disclosure matter groups
      let anyChipVisible = false;
      for (const key of MATTER_KEYS) {
        const entry = sectionEls.get(key)!;
        const value = bm[key];
        const hasValue =
          value.trim() !== "" || (key === "copyright" && bm.isbn.trim() !== "");
        const visible = hasValue || openKeys.has(key);
        entry.wrap.style.display = visible ? "" : "none";
        setFieldEditable(entry.input, matter.words[key], editable);
        syncFieldText(entry.input, value);
        if (entry.isbnInput !== undefined) {
          setFieldEditable(entry.isbnInput, matter.words.isbn, editable);
          syncFieldText(entry.isbnInput, bm.isbn);
        }
        const chip = chipBtns.get(key)!;
        const showChip = editable && !visible;
        chip.style.display = showChip ? "" : "none";
        if (showChip) anyChipVisible = true;
      }
      chipBar.style.display = anyChipVisible ? "" : "none";

      if (view === "reflow") {
        sheet.style.height = "";
        return 0;
      }
      const minHeight = screenPagePx(profile).height;
      sheet.style.height = "auto";
      const natural = Math.ceil(sheet.scrollHeight);
      const height = Math.max(minHeight, natural);
      sheet.style.height = `${height}px`;
      return height;
    },
    focusTitle() {
      sheet.scrollIntoView({ block: "start" });
      titleEl.focus();
    },
    destroy() {
      destroyed = true;
      unsubscribeMatter();
      sheet.remove();
    },
  };
}
