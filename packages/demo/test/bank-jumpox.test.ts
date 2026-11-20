import { expect, test } from "bun:test";
import { JUMPOX_GUIDE } from "../src/generate/index.ts";
import { checkBank, othersThan } from "./support/bank-rules.ts";

const OTHERS = othersThan(JUMPOX_GUIDE);

// A word as the bank rules count one: letters, digits, apostrophes, hyphens and full stops, holding a letter or digit.
const WORD = new RegExp(
  "[\\p{L}\\p{N}'’.-]*[\\p{L}\\p{N}][\\p{L}\\p{N}'’.-]*",
  "gu",
);

const wordCount = (text: string): number => text.match(WORD)?.length ?? 0;

test("the book's bank holds its names, its sentences and its 24 chapters", () => {
  expect(JUMPOX_GUIDE.project).toBe("jumpox");
  expect(JUMPOX_GUIDE.names.length).toBe(41);
  expect(JUMPOX_GUIDE.sentences.length).toBe(600);
  expect(JUMPOX_GUIDE.chapters.length).toBe(24);
});

test("the book's voice allows forty words a sentence and nothing a ten-year-old in its town would not touch", () => {
  expect(JUMPOX_GUIDE.style).toEqual({
    actionWords: 0,
    dialogueWords: 0,
    sentenceWords: 40,
    banned: [
      /\b(screen|app|internet|online|email|website)\b/i,
      /\bphone\b[^.]*\b(fix|fixes|find|finds|call|calls)\b/i,
      /\b(stupid|idiot|shut up)\b/i,
    ],
  });
});

test("the chapters are numbered one to 24 and carry the book's titles in order", () => {
  expect(JUMPOX_GUIDE.chapters.map((c) => c.number)).toEqual(
    Array.from({ length: 24 }, (_, index) => index + 1),
  );
  expect(JUMPOX_GUIDE.chapters.map((c) => c.title)).toEqual([
    "The Box Nobody Wanted",
    "Down the Back of Everything",
    "The Missing B",
    "A Very Short Jump",
    "The Book of Missing",
    "Mrs. Lomax's Spectacles",
    "Mr. Dustin Pann, Chief Tidier",
    "The Great Sweep",
    "Six Letters",
    "The Lighthouse Key",
    "The Parliament of Socks",
    "Gran Remembers Something",
    "A Glint on a Waistcoat",
    "Jumpox Runs Away",
    "Rain in the Downtheback",
    "Everything Brought Back at Once",
    "The Tidier's Office",
    "What Nobody Looked For",
    "Looki Gets Lost",
    "Sideways",
    "The Night Before",
    "The Big Look",
    "Found",
    "Posted",
  ]);
});

test("each chapter has eight to twelve beats", () => {
  const counts = JUMPOX_GUIDE.chapters.map((c) => c.beats.length);
  expect(counts).toEqual([
    8, 9, 9, 10, 8, 10, 9, 10, 9, 10, 9, 9, 9, 10, 9, 11, 9, 10, 10, 10, 9, 10,
    12, 10,
  ]);
  expect(counts.filter((n) => n < 8 || n > 12)).toEqual([]);
});

test("each chapter crosses out one thing in the ledger, and names who lost it", () => {
  const ledgerEntry = new RegExp(
    "^[^.]+\\. Lost by: [^.]+(\\.[^.]+)*\\. Found\\.$",
  );
  expect(
    JUMPOX_GUIDE.chapters
      .filter((c) => !ledgerEntry.test(c.ledger))
      .map((c) => c.number),
  ).toEqual([]);
  expect(JUMPOX_GUIDE.chapters[5]?.ledger).toBe(
    "Spectacles, reading, one pair. Lost by: Mrs. Irene Lomax. Found.",
  );
  expect(JUMPOX_GUIDE.chapters[22]?.ledger).toBe(
    "B, brass, one. Lost by: Jumpox. Found.",
  );
});

test("every sentence is tagged, and only with the book's people, places and threads", () => {
  expect(
    JUMPOX_GUIDE.sentences
      .filter((s) => s.tags.length === 0)
      .map((s) => s.text),
  ).toEqual([]);
  const tags = new Set([
    ...JUMPOX_GUIDE.sentences.flatMap((s) => s.tags),
    ...JUMPOX_GUIDE.chapters.flatMap((c) => c.tags),
  ]);
  expect([...tags].toSorted()).toEqual([
    "Amari Mends",
    "Gran",
    "Gran's secret",
    "Jumpox",
    "Looki",
    "Mallow Street",
    "Marramby Head lighthouse",
    "Marramby noticing",
    "Marramby pier",
    "Mr. Dustin Pann",
    "Mr. Dustin Pann's office",
    "Mum",
    "Spark",
    "The Book of Missing",
    "the Button River",
    "the Downtheback",
    "the Great Sweep",
    "the Hall of Spectacles",
    "the Hills of Odd Socks",
    "the Lost Bandstand",
    "the Nothing-Much",
    "the Umbrella Forest",
    "the bus depot",
    "the missing B",
    "the narrator",
    "the six letters",
  ]);
});

test("at most one sentence in fifty runs to twenty words or more", () => {
  const long = JUMPOX_GUIDE.sentences.filter((s) => wordCount(s.text) >= 20);
  expect(long.length).toBeLessThanOrEqual(
    Math.floor(JUMPOX_GUIDE.sentences.length / 50),
  );
});

test("the book's bank holds no undeclared name, repeat or line off its voice", () => {
  expect(checkBank(JUMPOX_GUIDE, OTHERS)).toEqual([]);
});
