import { describe, expect, it } from 'vitest'
import { imageExtension, imageMarkdown, parseAltSize, setImageWidth } from './imageSize'
import { buildPreview } from './buildPreview'
import { imagesFolderName } from '../../../shared/host'

describe('Bildgröße im Alt-Text', () => {
  it('liest „|Breite“ am Ende des Alt-Texts', () => {
    expect(parseAltSize('Foto|300')).toEqual({ alt: 'Foto', width: 300 })
    expect(parseAltSize('|120')).toEqual({ alt: '', width: 120 })
    expect(parseAltSize('A|B')).toEqual({ alt: 'A|B' })
  })

  it('setzt, ändert und entfernt die Breite, Rest bleibt', () => {
    expect(setImageWidth('![Foto](<a b/c.png> "Titel")', 300)).toBe('![Foto|300](<a b/c.png> "Titel")')
    expect(setImageWidth('![Foto|300](c.png)', 420.4)).toBe('![Foto|420](c.png)')
    expect(setImageWidth('![Foto|300](c.png)', null)).toBe('![Foto](c.png)')
    expect(setImageWidth('![\\[x\\]](c.png)', 50)).toBe('![\\[x\\]|50](c.png)')
  })

  it('Bildverweis mit Leerzeichen im Pfad', () => {
    expect(imageMarkdown('test gedicht.md - Images/bild-1.png')).toBe('![](<test gedicht.md - Images/bild-1.png>)')
  })

  it('Bilderordner heißt wie die Datei samt Endung – im Finder direkt darunter', () => {
    expect(imagesFolderName('test gedicht.md')).toBe('test gedicht.md - Images')
  })

  it('Dateiendung aus Typ oder Name', () => {
    expect(imageExtension({ type: 'image/jpeg', name: '' })).toBe('jpg')
    expect(imageExtension({ type: '', name: 'Foto.HEIC' })).toBe('heic')
    expect(imageExtension({ type: 'text/plain', name: 'x' })).toBeNull()
  })
})

describe('Bilder in der Druckfahne', () => {
  it('liefert Quelltextbereich, Pfad ohne spitze Klammern und Breite', () => {
    const md = 'Text ![Foto|300](<x y/bild.png>) mehr'
    const img = findImage(buildPreview(md).root)
    expect(img).toMatchObject({ src: 'x y/bild.png', alt: 'Foto', width: 300 })
    expect(md.slice(img!.from, img!.to)).toBe('![Foto|300](<x y/bild.png>)')
  })
})

type Node = ReturnType<typeof buildPreview>['root']
function findImage(n: Node): Extract<Node, { kind: 'image' }> | null {
  if (n.kind === 'image') return n
  if (n.kind === 'el') for (const c of n.children) {
    const f = findImage(c)
    if (f) return f
  }
  return null
}

describe('Hervorhebung und Unterstrich in der Druckfahne', () => {
  const tags = (n: Node, out: string[] = []): string[] => {
    if (n.kind === 'el') {
      out.push(n.tag)
      n.children.forEach((c) => tags(c, out))
    }
    return out
  }
  it('==…== wird zu <mark>, <u>…</u> zu <u>, auch mit Fett darin', () => {
    const t = tags(buildPreview('Ein ==wichtiger== Satz, <u>unten</u> und ==**fett**==.').root)
    expect(t.filter((x) => x === 'mark')).toHaveLength(2)
    expect(t).toContain('u')
    expect(t).toContain('strong')
  })
  it('ungepaartes == bleibt sichtbar', () => {
    const { segments, root } = buildPreview('a == b')
    expect(tags(root)).not.toContain('mark')
    expect(segments.map((s) => s.text).join('')).toBe('a  b')
  })
})
