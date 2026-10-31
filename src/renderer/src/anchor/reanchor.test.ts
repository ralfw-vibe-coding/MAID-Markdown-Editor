import { describe, expect, it } from 'vitest'
import { reanchor, type StoredAnchor } from './reanchor'

/** Gespeicherter Anker für `text` im Dokument `doc` (erstes bzw. `nth`-tes Vorkommen). */
function stored(doc: string, text: string, nth = 0): StoredAnchor {
  let from = -1
  for (let k = 0; k <= nth; k++) from = doc.indexOf(text, from + 1)
  const to = from + text.length
  return { from, to, quote: text, text, prefix: doc.slice(Math.max(0, from - 32), from), suffix: doc.slice(to, to + 32), status: 'ok' }
}

const slice = (doc: string, p: { from: number; to: number }) => doc.slice(p.from, p.to)

describe('Anker beim Öffnen wiederfinden', () => {
  const doc = 'Ein Satz mit einem besonderen Wort darin.\n\nUnd noch ein Absatz danach.\n'

  it('unverändertes Dokument: gespeicherte Position gilt', () => {
    const a = stored(doc, 'besonderen Wort')
    expect(reanchor(doc, a, true)).toEqual({ from: a.from, to: a.to, status: 'ok' })
  })

  it('extern Text davor eingefügt: eindeutiger Wortlaut wird gefunden', () => {
    const a = stored(doc, 'besonderen Wort')
    const changed = '# Neuer Titel 😀\n\n' + doc
    const p = reanchor(changed, a, false)
    expect(slice(changed, p)).toBe('besonderen Wort')
    expect(p.status).toBe('ok')
  })

  it('Wortlaut mehrfach vorhanden: Kontext entscheidet', () => {
    const d = 'Erstens: das Wort hier. Zweitens: das Wort dort.'
    const a = stored(d, 'das Wort', 1)
    const changed = 'Vorweg. ' + d
    const p = reanchor(changed, a, false)
    expect(p.from).toBe(changed.lastIndexOf('das Wort'))
    expect(p.status).toBe('ok')
  })

  it('Wortlaut mehrfach mit gleichem Kontext: verloren statt geraten', () => {
    const d = 'x Wort y\nx Wort y\n'
    const a = { ...stored(d, 'Wort'), prefix: 'x ', suffix: ' y' }
    expect(reanchor('z' + d, a, false).status).toBe('verloren')
  })

  it('Wortlaut extern geändert: über Präfix und Suffix eingekreist', () => {
    const a = stored(doc, 'besonderen Wort')
    const changed = doc.replace('besonderen Wort', 'ganz anderen Begriff')
    const p = reanchor(changed, a, false)
    expect(slice(changed, p)).toBe('ganz anderen Begriff')
    expect(p.status).toBe('geändert')
  })

  it('Stelle gelöscht: verloren', () => {
    const a = stored(doc, 'Und noch ein Absatz danach.')
    const changed = doc.replace('Und noch ein Absatz danach.\n', '')
    expect(reanchor(changed, a, false).status).toBe('verloren')
  })

  it('Anker am Dokumentanfang mit geändertem Wortlaut', () => {
    const a = stored(doc, 'Ein Satz')
    const changed = doc.replace('Ein Satz', 'Dieser lange Satz')
    const p = reanchor(changed, a, false)
    expect(slice(changed, p)).toBe('Dieser lange Satz')
  })

  it('bereits verlorener Anker bleibt verloren', () => {
    const a = { ...stored(doc, 'Wort'), status: 'verloren' as const, text: '' }
    expect(reanchor(doc, a, true).status).toBe('verloren')
  })

  it('Umlaute und Emojis im Wortlaut', () => {
    const d = 'Grüße an Jörg 😀👍🏽 und Straße.'
    const a = stored(d, 'Jörg 😀👍🏽')
    const changed = '🇩🇪 ' + d
    expect(slice(changed, reanchor(changed, a, false))).toBe('Jörg 😀👍🏽')
  })
})

describe('Einfügemarken wiederfinden', () => {
  const doc = 'Erster Absatz mit Text.\n\nZweiter Absatz endet hier.'
  const point = (pos: number): StoredAnchor => ({
    from: pos, to: pos, point: true, quote: '', text: '', status: 'ok',
    prefix: doc.slice(Math.max(0, pos - 32), pos), suffix: doc.slice(pos, pos + 32),
  })

  it('am Textende nach externer Änderung davor', () => {
    const changed = '# Titel\n\n' + doc
    expect(reanchor(changed, point(doc.length), false)).toEqual({ from: changed.length, to: changed.length, status: 'ok' })
  })

  it('zwischen Absätzen', () => {
    const at = doc.indexOf('\n\n') + 1
    const changed = 'Vorweg.\n' + doc
    expect(reanchor(changed, point(at), false).from).toBe(at + 'Vorweg.\n'.length)
  })
})
