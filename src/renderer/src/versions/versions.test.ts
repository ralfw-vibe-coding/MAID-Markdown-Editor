import { describe, expect, it } from 'vitest'
import { applyChanges, createVersion, diffParagraphs, lineChanges, parseVersions, serializeVersions, wordStats } from './versions'

const v1 = '# Titel\n\nErster Absatz bleibt.\n\nZweiter Absatz, alt.\n\nDritter Absatz bleibt auch.\n'
const v2 = '# Titel\n\nErster Absatz bleibt.\n\nZweiter Absatz, ganz neu formuliert.\n\nDritter Absatz bleibt auch.\n\nVierter kommt dazu.\n'

describe('Absatzweiser Vergleich', () => {
  it('erkennt gleiche, geänderte und neue Absätze', () => {
    expect(diffParagraphs(v1, v2).map((d) => d.type)).toEqual(['same', 'same', 'changed', 'same', 'added'])
  })

  it('zählt geänderte Wörter', () => {
    expect(wordStats(v1, v2)).toEqual({ added: 6, removed: 1 })
    expect(wordStats('', 'Drei kleine Wörter')).toEqual({ added: 3, removed: 0 })
  })
})

describe('Zurückgehen mit minimalen Änderungen', () => {
  it('überführt den aktuellen Stand exakt in die Version', () => {
    for (const [a, b] of [
      [v2, v1],
      [v1, v2],
      ['ohne Zeilenumbruch am Ende', 'ganz anders\nzwei Zeilen'],
      ['a\nb\nc\n', 'a\nc\n'],
      ['', 'neu\n'],
      ['weg\n', ''],
    ]) {
      expect(applyChanges(a, lineChanges(a, b))).toBe(b)
    }
  })

  it('lässt unveränderte Zeilen unberührt', () => {
    const changes = lineChanges(v2, v1)
    const untouched = v2.indexOf('Erster Absatz')
    expect(changes.every((c) => c.to <= untouched || c.from > untouched + 20)).toBe(true)
    expect(lineChanges(v1, v1)).toEqual([])
  })
})

describe('Versionsdatei', () => {
  it('Rundreise', () => {
    const a = createVersion(v1, ' Erste Fassung ', undefined)
    const b = createVersion(v2, 'Absatz zwei neu', a)
    expect(a.message).toBe('Erste Fassung')
    expect(b).toMatchObject({ added: 6, removed: 1 })
    expect(parseVersions(serializeVersions('text.md', [a, b]))).toEqual([a, b])
  })

  it('lehnt Fremdes ab', () => {
    expect(() => parseVersions('{"x":1}')).toThrow()
  })
})
