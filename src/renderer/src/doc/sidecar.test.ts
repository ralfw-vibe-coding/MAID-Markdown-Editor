import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { createAnchor } from '../anchor/anchors'
import { createThread, message } from '../thread/thread'
import { createChat } from '../chat/chats'
import { contentHash, parseSidecar, restoreThreads, serializeSidecar } from './sidecar'

const doc = 'Ein **fettes** Wort und ein Link [hier](x).\n\nZweiter Absatz mit Jörg 😀.\n'

function setup(...quotes: string[]) {
  const state = EditorState.create({ doc })
  const anchors = quotes.map((q) => createAnchor(state.doc, doc.indexOf(q), doc.indexOf(q) + q.length))
  const threads = anchors.map((a) => createThread(a.id, `zu ${a.quote}`))
  return { anchors, threads }
}

const positions = (anchors: { id: string; from: number; to: number; status: string; quote: string }[]) =>
  anchors.map(({ id, from, to, status, quote }) => ({ id, from, to, status, quote }))

describe('Begleitdatei', () => {
  it('ohne Threads wird keine Begleitdatei geschrieben', () => {
    expect(serializeSidecar(doc, [], [], [], 'text.md', 'h')).toBeNull()
  })

  it('Rundreise: sichern und wieder öffnen ergibt dieselben Anker und Nachrichten', async () => {
    const { anchors, threads } = setup('fettes** Wort', 'Jörg 😀')
    threads[0].messages.push(message({ kind: 'ai', text: 'Antwort' }), message({ kind: 'edit', before: 'a', after: 'b' }))
    const json = serializeSidecar(doc, anchors, threads, [], 'text.md', await contentHash(doc))!
    const restored = restoreThreads(doc, parseSidecar(json), await contentHash(doc))
    expect(positions(restored.anchors)).toEqual(positions(anchors))
    expect(restored.threads).toEqual(threads)
  })

  it('nach externer Änderung werden Anker neu zugeordnet', async () => {
    const { anchors, threads } = setup('Jörg 😀')
    const json = serializeSidecar(doc, anchors, threads, [], 'text.md', await contentHash(doc))!
    const changed = '# Titel\n\n' + doc
    const [a] = restoreThreads(changed, parseSidecar(json), await contentHash(changed)).anchors
    expect(changed.slice(a.from, a.to)).toBe('Jörg 😀')
    expect(a.status).toBe('ok')
  })

  it('liest die frühe Fassung mit author/text-Nachrichten', () => {
    const legacy = JSON.stringify({
      format: 'maid-sidecar',
      version: 1,
      document: 'x.md',
      contentHash: 'h',
      savedAt: '',
      threads: [{ id: 't', createdAt: '', anchor: { from: 0, to: 3, quote: 'Ein', text: 'Ein', prefix: '', suffix: '', status: 'ok' }, messages: [{ author: 'user', text: 'Hallo', at: '' }] }],
    })
    const [m] = parseSidecar(legacy).threads[0].messages
    expect(m).toMatchObject({ kind: 'user', text: 'Hallo' })
  })

  it('sichert Chats auch ohne Threads, leere Chats nicht', async () => {
    const used = { ...createChat(), title: 'Zusammenfassung', messages: [message({ kind: 'user', text: 'Fasse zusammen' }), message({ kind: 'ai', text: '**Kurz:** …' })] }
    const json = serializeSidecar(doc, [], [], [used, createChat()], 'text.md', await contentHash(doc))!
    expect(restoreThreads(doc, parseSidecar(json), await contentHash(doc)).chats).toEqual([used])
    expect(serializeSidecar(doc, [], [], [createChat()], 'text.md', 'h')).toBeNull()
  })

  it('liest die frühe Fassung mit nur einem Chat', () => {
    const legacy = JSON.stringify({ format: 'maid-sidecar', version: 1, document: 'x.md', contentHash: 'h', savedAt: '2026-10-31', threads: [], chat: [{ id: 'm', kind: 'user', text: 'Hallo', at: '2026-10-30' }] })
    const [c] = parseSidecar(legacy).chats!
    expect(c).toMatchObject({ title: 'Chat', createdAt: '2026-10-30', messages: [{ text: 'Hallo' }] })
  })

  it('lehnt fremde JSON-Dateien ab', () => {
    expect(() => parseSidecar('{"foo":1}')).toThrow()
  })
})
