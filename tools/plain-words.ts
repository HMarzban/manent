// The words of the interface that are not terms, as data.
// It holds words only; what a word means is not written here.
import { listOf } from "./glossary.ts";

/** Words that name no part, state or action of Manent: verbs, adjectives, function words and ordinary nouns. A word joins only in a reviewed change that says why it is not a term. */
export const PLAIN_WORDS: readonly string[] = listOf(`
  about, accepts, added, affect, affected, after, again, ago, agreed, all, already, always, am, an, another, any,
  anyone, anyway, anywhere, apart, apostrophes, app, appear, applied, applies, apr, around, arrived, arriving, ask,
  at, aug, automatically, available, away, be, because, been, being, between, both, box, bring, build, came, can't,
  cancel, cancels, cannot, capitals, changing, checking, clean, cleared, close, closing, comfortably, computer,
  controls, copy, corrected, correctly, could, couldn't, created, creates, data, date, day, dec, decline, deleted,
  differ, different, dismiss, do, down, each, early, editable, edited, eighth, else, empty, ending, english, every,
  everything, example, existed, ext, extra, features, feb, fifth, first, flow, folder, fourth, fragments, fri, gain,
  gains, generates, get, getting, handles, happens, has, have, height, hidden, hide, holds, how, hr, identity,
  industry, installs, instruction, int, intact, is, isn't, issued, issuing, itself, jan, jul, jun, just, kept, key,
  keystroke, laid, language, larger, last, later, leave, leaving, letters, linux, list, load, locking, long, longer,
  look, made, make, mar, marked, match, matches, may, mb, mentions, min, missed, misspellings, mon, more, move,
  moving, music, name, named, near, nearly, need, needs, never, newer, newscast, next, ninth, no, none, nothing,
  nov, now, number, oct, off, offered, older, omit, once, one, opening, or, other, others, out, outside, overflows, own,
  paste, pause, pick, placed, pp, prepare, preparing, press, pressing, previously, put, quit, re-applied, reach,
  reached, reacts, reading, ready, recalled, recalling, recorded, reduced, region, reload, reloading, removes,
  reorganised, request, resize, rest, restored, right, running, runs, said, same, sat, save, say, says, sc, scripts,
  search, second, see, sees, selected, sep, seventh, showing, shown, sign, signed, sixth, slow, so, some, someone, sound,
  speeches, standard, started, starting, stay, still, stopped, stored, style, summaries, sun, switch, tenth,
  terminal, than, that, their, them, then, there, these, third, thu, today, train, try, tue, turn, two, typing,
  unaffected, unchanged, underlines, unlocking, untitled, usage, used, voiceover, was, web, wed, were, whatever,
  when, where, which, while, whole, with, without, work, works, would, write, written, wrote, yesterday, yet, your
`);
