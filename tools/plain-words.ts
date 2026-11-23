// The words of the interface that are not terms, as data.
// It holds words only; what a word means is not written here.
import { listOf } from "./glossary/index.ts";

/** Words that name no part, state or action of Manent: verbs, adjectives, function words and ordinary nouns. A word joins only in a reviewed change that says why it is not a term. */
export const PLAIN_WORDS: readonly string[] = listOf(`
  about, accepts, added, affect, affected, after, again, ago, agreed, all, already, always, am, an, another, any,
  anyone, anyway, anywhere, apart, apostrophes, app, appear, applied, applies, apr, around, arrived, arriving, ask,
  at, aug, automatically, available, away, be, beat, because, been, being, between, boneyard, both, box, breakdown,
  bring, build, came, can't, cancel, cancels, cannot, capitals, changing, checking, clean, cleared, close, closing,
  comfortably, computer, connect, contact, controls, copies, copy, corrected, correctly, could, couldn't, count,
  created, creates, credit, data, date, day, dec, decline, deleted, differ, different, dismiss, display, do, doesn't,
  down, each, earlier, early, editable, edited, eighth, else, empty, ending, english, every, everything, example,
  exceptions, existed, ext, extra, features, feb, fifth, first, flow, folder, footer, fourth, fragments, fri, gain,
  gains, generates, get, getting, handles, happens, has, have, header, height, hidden, hide, highlighting, hold,
  holds, how, hr, identity, images, imported, industry, installs, instruction, int, intact, is, isn't, issued,
  issuing, itself, jan, jul, jun, just, kb, kept, key, keystroke, laid, language, larger, last, later, leave, leaving,
  length, letters, linux, list, load, locking, long, longer, look, macros, made, make, mar, marked, markup, match,
  matches, may, mb, measured, mentions, min, missed, misspellings, mon, more, move, moving, ms, music, name, named,
  near, nearest, nearly, need, needs, never, newer, newscast, next, ninth, no, none, nothing, nov, now, number, oct,
  off, offered, older, omit, once, one, opening, or, other, others, out, outside, overflows, own, paste, pasted,
  pause, pick, placed, plain, pp, prepare, preparing, press, pressing, previously, profiles, put, quit, re-applied,
  reach, reached, reacts, read-aloud, reading, ready, recalled, recalling, recorded, reduced, region, reload,
  reloading, removes, reorganised, replace, request, resize, rest, restored, right, running, runs, said, same, sat,
  save, say, says, sc, scripts, search, second, see, seeded, sees, selected, sep, seventh, showing, shown, sign,
  signed, sixth, slow, smarttype, so, some, someone, sound, source, speeches, standard, started, starting, stay,
  still, stopped, stored, style, summaries, summary, sun, switch, tenth, terminal, than, that, their, them, then,
  there, these, third, thu, today, train, try, tue, turn, two, typing, unaffected, unchanged, underlines, unlocking,
  untitled, usage, used, using, voiceover, voices, was, web, wed, were, whatever, when, where, which, while, whole,
  with, without, work, works, would, write, written, wrote, yesterday, yet, your,
  arrow, drop, dropped, moved, picked, position,
  join, listed, private, until
`);
