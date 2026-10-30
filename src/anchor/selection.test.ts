import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { buildPreview } from '../render/buildPreview'
import { Preview } from '../render/Preview'
import { domRangeToSource, sourceToDomRange } from './selection'

function mount(md: string) {
  const model = buildPreview(md)
  const root = document.createElement('div')
  root.innerHTML = renderToStaticMarkup(createElement(Preview, { model }))
  document.body.replaceChildren(root)
  return { model, root: root.firstElementChild as HTMLElement }
}

/**
 * Simuliert eine Nutzerauswahl: sucht `needle` (ggf. das `nth`-te Vorkommen)
 * im sichtbaren Text und spannt eine Range über die betroffenen Textknoten.
 */
function select(root: HTMLElement, needle: string, nth = 0): Range {
  const nodes: Text[] = []
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) nodes.push(walker.currentNode as Text)
  const full = nodes.map((n) => n.data).join('')
  let at = -1
  for (let k = 0; k <= nth; k++) at = full.indexOf(needle, at + 1)
  if (at < 0) throw new Error(`»${needle}« nicht in »${full}«`)
  const locate = (pos: number, isEnd: boolean) => {
    let acc = 0
    for (const n of nodes) {
      const len = n.data.length
      if (isEnd ? pos <= acc + len : pos < acc + len) return { node: n, offset: pos - acc }
      acc += len
    }
    throw new Error('Position außerhalb')
  }
  const s = locate(at, false)
  const e = locate(at + needle.length, true)
  const range = root.ownerDocument.createRange()
  range.setStart(s.node, s.offset)
  range.setEnd(e.node, e.offset)
  return range
}

function sourceOf(md: string, needle: string, nth = 0): string {
  const { model, root } = mount(md)
  const src = domRangeToSource(select(root, needle, nth), root, model.segments)
  expect(src).not.toBeNull()
  return md.slice(src!.from, src!.to)
}

describe('Auswahl in der Preview → Markdown-Quelltext', () => {
  it('einzelnes Wort im Satz', () => {
    expect(sourceOf('Ein ganz normaler Satz mit einem Wort darin.', 'Wort')).toBe('Wort')
  })

  it('zweites Vorkommen desselben Worts', () => {
    const md = 'Wort hier, Wort dort.'
    const { model, root } = mount(md)
    const src = domRangeToSource(select(root, 'Wort', 1), root, model.segments)!
    expect(src).toEqual({ from: 11, to: 15 })
  })

  it('Teilwort innerhalb von Fett', () => {
    expect(sourceOf('Ein **fettes** Wort.', 'fett')).toBe('fett')
  })

  it('Phrase über Fett und Kursiv hinweg', () => {
    expect(sourceOf('Hier ist ein **fettes** Wort, *kursiv* auch.', 'ein fettes Wort, kursiv')).toBe('ein **fettes** Wort, *kursiv')
  })

  it('Phrase über einen Link hinweg', () => {
    expect(sourceOf('Siehe [den Link](https://example.com) und mehr.', 'Siehe den Link und')).toBe('Siehe [den Link](https://example.com) und')
  })

  it('Umlaute, Emojis und typografische Zeichen', () => {
    const md = 'Grüße an Jörg – „schön“ 😀👍🏽 🇩🇪 Ende.'
    expect(sourceOf(md, 'Jörg')).toBe('Jörg')
    expect(sourceOf(md, '„schön“')).toBe('„schön“')
    expect(sourceOf(md, '👍🏽')).toBe('👍🏽')
    expect(sourceOf(md, '🇩🇪 Ende')).toBe('🇩🇪 Ende')
  })

  it('Escapes und Entitäten', () => {
    const md = 'Das ist \\*kein\\* fett &amp; gut.'
    expect(sourceOf(md, '*kein*')).toBe('\\*kein\\*')
    expect(sourceOf(md, 'fett & gut')).toBe('fett &amp; gut')
  })

  it('über eine Zeile im Zitat hinweg', () => {
    expect(sourceOf('> Ein Zitat über\n> zwei Zeilen.', 'über\nzwei')).toBe('über\n> zwei')
  })

  it('über Absätze hinweg', () => {
    expect(sourceOf('Erster Absatz.\n\nZweiter Absatz.', 'Absatz.Zweiter')).toBe('Absatz.\n\nZweiter')
  })

  it('in einer Tabellenzelle', () => {
    expect(sourceOf('| A | B |\n| - | - |\n| Äpfel | **drei** |\n', 'drei')).toBe('drei')
  })

  it('in Inline-Code mit Backtick', () => {
    expect(sourceOf('Inline `` mit ` Tick `` hier.', 'mit ` Tick')).toBe('mit ` Tick')
  })

  it('in einem Codeblock mit Sprachangabe', () => {
    expect(sourceOf('```ts\ntype X = 1\n```\n', 'type')).toBe('type')
  })
})

describe('Quelltextbereich → Hervorhebung in der Preview', () => {
  it('Rundreise: Auswahl → Quelle → Range ergibt denselben Text', () => {
    const md = 'Hier ist ein **fettes** Wort, [ein Link](x) und 😀 &amp; mehr.'
    const { model, root } = mount(md)
    for (const needle of ['fettes Wort', 'ein fettes', 'Link und 😀', '& mehr', 'W']) {
      const src = domRangeToSource(select(root, needle), root, model.segments)!
      const back = sourceToDomRange(src, root, model.segments)!
      expect(back.toString()).toBe(needle)
    }
  })

  it('leerer Bereich ergibt keine Range', () => {
    const { model, root } = mount('Text')
    expect(sourceToDomRange({ from: 2, to: 2 }, root, model.segments)).toBeNull()
  })
})
