import { expect, test } from 'bun:test'
import { makeCorpus } from './corpus.ts'
import { measure, paginate, paginateFrom, PROFILE } from './engine.ts'
import type { ElementType, EngineBlock, PageStart } from './engine.ts'

const ORPHANS: readonly ElementType[] = ['scene_heading', 'character', 'parenthetical']

// Every rule the engine promises, checked from its own output: progress, page height, and no page ending on a block
// that must stay with the next one.
function violations(blocks: readonly EngineBlock[]): string[] {
  const pages = paginate(blocks)
  const found: string[] = []
  const end: PageStart = { startBlock: blocks.length, startLine: 0, contd: false }
  for (let p = 0; p < pages.length; p++) {
    const a = pages[p]!
    const b = pages[p + 1] ?? end
    if (b.startBlock < a.startBlock || (b.startBlock === a.startBlock && b.startLine <= a.startLine)) found.push(`page ${p} makes no progress`)
    let used = a.contd ? 1 : 0
    let top = true
    for (let i = a.startBlock; i <= b.startBlock && i < blocks.length; i++) {
      const block = blocks[i]!
      const from = i === a.startBlock ? a.startLine : 0
      const to = i === b.startBlock ? b.startLine : measure(block).lines
      if (to - from <= 0) continue
      used += (top ? 0 : PROFILE.elements[block.type].before) + (to - from)
      top = false
    }
    if (b.contd) used += 1
    if (used > PROFILE.linesPerPage) found.push(`page ${p} holds ${used} lines`)
    const last = blocks[b.startLine > 0 ? b.startBlock : b.startBlock - 1]
    if (p < pages.length - 1 && b.startLine === 0 && last && ORPHANS.includes(last.type)) found.push(`page ${p} ends on ${last.type}`)
  }
  return found
}

// Yields [block index, new text]: a few characters appended to or deleted from one block, never adding or removing one.
function* randomEdits(blocks: readonly EngineBlock[], count: number, seed: number): Generator<[number, string]> {
  let state = seed >>> 0
  const next = (): number => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296
  const texts = blocks.map((b) => b.text)
  const alphabet = 'abcdefghij .-'
  for (let e = 0; e < count; e++) {
    const i = Math.floor(next() * texts.length)
    const n = 1 + Math.floor(next() * 6)
    const old = texts[i]!
    let text = old.slice(0, Math.max(0, old.length - n))
    if (next() < 0.5) {
      text = old
      for (let k = 0; k < n; k++) text += alphabet[Math.floor(next() * alphabet.length)]
    }
    texts[i] = text
    yield [i, text]
  }
}

test('no page over 54 lines; none ends on a heading, cue or parenthetical', () => {
  expect(violations(makeCorpus(120))).toEqual([])
})
test('incremental equals full for 500 random one-block edits', () => {
  let blocks = makeCorpus(120), pages = paginate(blocks)
  for (const [i, text] of randomEdits(blocks, 500, 7)) {
    blocks = blocks.with(i, { ...blocks[i], text })
    pages = paginateFrom(blocks, pages, i)
    expect(pages).toEqual(paginate(blocks))
  }
})
test('makeCorpus hits its target and breaks pages inside blocks', () => {
  for (const n of [120, 1000, 2000]) {
    const pages = paginate(makeCorpus(n))
    expect(pages.length).toBe(n)
    const inside = pages.filter(p => p.startLine > 0)
    expect(inside.length / n).toBeGreaterThanOrEqual(0.05)      // simulated: about 0.10
    expect(inside.some(p => p.contd)).toBe(true)                // at least one split speech
  }
})
