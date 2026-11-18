// Seeded synthetic screenplay text, and a matrix of awkward strings for the line wrapper.
import { paginate, paginateFrom, PROFILE } from './engine.ts'
import type { ElementType, EngineBlock } from './engine.ts'

const WORDS = 'the of and to in is that it was for on are as with his they at be this from have or one had by word but not what all were we when your can said there use an each which she do how their if will up other about out many then them these so some her would make like him into time has look two more write go see number no way could people my than first water been call who oil its now find long down day did get come made may part'.split(' ')

// A fresh generator per corpus, so the same target always yields the same blocks, in Bun and in the browser alike.
function createGenerator(): () => EngineBlock {
  let seed = 0x9e3779b9
  const rnd = (): number => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) / 4294967296) }
  const ri = (a: number, b: number): number => a + Math.floor(rnd() * (b - a + 1))
  const words = (n: number): string => { let s = ''; for (let i = 0; i < n; i++) s += (i ? ' ' : '') + WORDS[ri(0, WORDS.length - 1)]; return s }
  const prose = (n: number): string => {                 // a sentence end every 4–9 words, and at the end
    let s = '', left = ri(4, 9)
    for (let i = 0; i < n; i++) {
      s += (i ? ' ' : '') + WORDS[ri(0, WORDS.length - 1)]
      if (--left === 0 && i < n - 1) { s += '.'; left = ri(4, 9) }
    }
    return s + '.'
  }
  const len = (a: number, b: number): number => rnd() < 0.10 ? ri(60, 140) : ri(a, b)   // one block in ten is long
  return (): EngineBlock => {
    const r = rnd()
    if (r < 0.04) return { type: 'scene_heading', text: 'INT. ' + words(3).toUpperCase() + ' - DAY' }
    if (r < 0.34) return { type: 'action', text: prose(len(12, 40)) }
    if (r < 0.62) return { type: 'character', text: words(1).toUpperCase() }
    if (r < 0.92) return { type: 'dialogue', text: prose(len(4, 28)) }
    if (r < 0.97) return { type: 'parenthetical', text: '(' + words(2) + ')' }
    return { type: 'transition', text: 'CUT TO:' }
  }
}

/** Generated blocks, appended one at a time until the engine lays them out on exactly `targetPages` pages. */
export function makeCorpus(targetPages: number): EngineBlock[] {
  const next = createGenerator()
  const blocks: EngineBlock[] = []
  let pages = paginate(blocks)
  while (pages.length < targetPages) {
    blocks.push(next())
    pages = paginateFrom(blocks, pages, blocks.length - 1)
  }
  return blocks
}

const EDGE_TEXTS: readonly string[] = [
  'two  spaces  after  every  word  so  that  doubled  spaces  land  on  the  edge  of  the  column  again  and  again  until  the  block  ends',
  'a full stop.  Then two spaces.  Then another sentence that runs on past the edge.  And one more for luck.  The end.',
  'a well-known half-built two-storey drive-in with a self-locking gate-house and a long-forgotten one-way back-door at the far end',
  'hyphens before digits: 1-2-3-4-5-6-7-8-9-10-11-12-13-14-15-16-17-18-19-20-21-22-23-24-25-26-27-28-29-30 and after: a-1 b-2 c-3',
  'either/or and/or input/output yes/no on/off up/down left/right in/out here/there now/then this/that before/after',
  'a path: https://example.com/a/very/long/path/with/many/parts/that/keeps/going/and/going/until/the/line/breaks',
  'she stops -- then goes on --- and on — and on – and on —and on— and on—without a space—until the line has to break somewhere',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'short words then an unbroken run: abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz and more words',
  'trailing spaces at the end of this line                                                                      then more text',
  ' a leading space, a  double space, a   triple space and a    quadruple space spread over the length of the block',
  '夜の駅で彼女は静かに切符を買った。雨はまだ止まず、ホームには誰もいなかった。電車が来るまで、彼女は時計を見ていた。',
  '한밤중의 역에서 그녀는 조용히 표를 샀다 비는 아직 그치지 않았고 승강장에는 아무도 없었다',
  'mixed 東京 and 서울 words in one line, with ＦＵＬＬＷＩＤＴＨ letters and half-width ones side by side to see the cells',
  'emoji 🙂 between 🎬 words 🌧️ and a family 👩‍👩‍👧 and a flag 🇳🇿 and skin tones 👋🏽 until the line breaks somewhere 🙂🙂🙂',
  'باران هنوز می‌بارید و ایستگاه خالی بود. او بلیت را خرید و کنار پنجره نشست تا قطار بیاید.',
  'הגשם עדיין ירד והתחנה הייתה ריקה. היא קנתה כרטיס וישבה ליד החלון עד שהרכבת הגיעה.',
  'left to right text with مقداری متن فارسی in the middle and then more left to right text until the end of the line',
]

/** Each awkward string at the width of every element. */
export function edgeMatrix(): EngineBlock[] {
  const types = Object.keys(PROFILE.elements) as ElementType[]
  return types.flatMap((type) => EDGE_TEXTS.map((text) => ({ type, text })))
}
