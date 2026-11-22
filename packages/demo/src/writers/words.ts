// The words a simulated person types when no lines are given: plain, lower-case and written for this file.
import type { Rng } from "../seed/rng.ts";

const TEXT = `
the a and of to in on at by with
from under over after before behind beside between through across
door window stair floor wall roof table chair lamp candle
kettle cup plate spoon knife bread butter salt pepper soup
coat hat scarf glove boot shoe button pocket collar sleeve
road lane path bridge river stream field hill valley meadow
wood forest tree branch leaf root stone rock sand mud
rain snow wind fog cloud storm thunder frost dew mist
morning noon evening night dawn dusk hour minute moment week
year season summer winter spring autumn yesterday today tomorrow tonight
man woman child boy girl friend stranger neighbour doctor nurse
farmer driver baker teacher porter clerk guard sailor miner painter
mother father sister brother uncle aunt cousin daughter son grandmother
house cottage barn shed garden yard gate fence hedge porch
kitchen hall room attic cellar corridor landing study parlour pantry
letter note page book map card ticket photograph envelope parcel
key lock box bag case basket bucket rope ladder hammer
car van bus train boat cart bicycle wheel engine horn
dog cat horse cow sheep goat hen fox owl crow
bird fish bee moth spider mouse rabbit deer badger heron
water milk tea coffee wine beer juice honey jam sugar
fire smoke ash coal spark flame heat glow shadow dark
red blue green yellow grey brown black white pale bright
old young new small large tall short wide narrow thin
quiet loud soft hard warm cold wet damp heavy faint
quick slow early late near far high low deep shallow
open empty full clean dirty broken whole sharp blunt crooked
walk run stand sit lean wait watch listen look turn
take give hold drop lift carry push pull pour fill
shut close knock ring call shout whisper laugh cry hide
read write draw sign fold tear burn wash dry mend
think know remember forget wonder hope wish fear doubt believe
come go leave return arrive stay follow lead meet pass
say tell ask answer speak sing hum nod shrug smile
eat drink cook bake boil fry slice spread taste smell
sleep wake dream rest yawn sigh breathe cough sneeze blink
slowly quickly softly gently suddenly almost nearly quite rather still
again always never often once twice sometimes soon here there
pencil ribbon thread needle blanket pillow curtain mirror clock bell
harbour pier jetty tide wave shore cliff cave island lighthouse
`;

/** 400 words, each once. */
const WORDS: readonly string[] = Object.freeze(TEXT.trim().split(/\s+/));

/** `length` characters of words and single spaces, opening with a space when `lead`. */
export function wordsOf(rng: Rng, length: number, lead: boolean): string {
  let text = lead ? " " : "";
  while (text.length < length)
    text += (text === "" || text.endsWith(" ") ? "" : " ") + rng.pick(WORDS);
  return text.slice(0, length);
}
