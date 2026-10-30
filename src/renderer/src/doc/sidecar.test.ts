import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { createAnchor } from '../anchor/anchors'
import { contentHash, parseSidecar, restoreAnchors, serializeSidecar } from './sidecar'

const doc = 'Ein **fettes** Wort und ein Link [hier](x).\n\nZweiter Absatz mit Jörg 😀.\n'

function anchorsFor(...quotes: string[]) {
  const state = EditorState.create({ doc })
  return quotes.map((q) => createAnchor(state.doc, doc.indexOf(q), doc.indexOf(q) + q.length, `zu ${q}`))
}

describe('Begleitdatei', () => {
  it('ohne Kommentare wird keine Begleitdatei geschrieben', () => {
    expect(serializeSidecar(doc, [], 'text.md', 'h')).toBeNull()
  })

  it('Rundreise: sichern und wieder öffnen ergibt dieselben Anker', async () => {
    const anchors = anchorsFor('fettes** Wort', 'Jörg 😀')
    const hash = await contentHash(doc)
    const json = serializeSidecar(doc, anchors, 'text.md', hash)!
    const restored = restoreAnchors(doc, parseSidecar(json), await contentHash(doc))
    expect(restored.map(({ id, from, to, status, comment, quote }) => ({ id, from, to, status, comment, quote }))).toEqual(
      anchors.map(({ id, from, to, status, comment, quote }) => ({ id, from, to, status, comment, quote })),
    )
  })

  it('nach externer Änderung werden Anker neu zugeordnet', async () => {
    const anchors = anchorsFor('Jörg 😀')
    const json = serializeSidecar(doc, anchors, 'text.md', await contentHash(doc))!
    const changed = '# Titel\n\n' + doc
    const [a] = restoreAnchors(changed, parseSidecar(json), await contentHash(changed))
    expect(changed.slice(a.from, a.to)).toBe('Jörg 😀')
    expect(a.status).toBe('ok')
  })

  it('lehnt fremde JSON-Dateien ab', () => {
    expect(() => parseSidecar('{"foo":1}')).toThrow()
  })
})
