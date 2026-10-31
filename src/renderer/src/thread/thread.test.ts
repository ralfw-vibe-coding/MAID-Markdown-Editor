import { describe, expect, it } from 'vitest'
import { createThread, message, syncEditStates, type Thread } from './thread'

function threadWithEdits(...edits: { before: string; after: string; reverted?: boolean; elsewhere?: boolean }[]): Thread {
  const t = createThread('t', 'Zu absolut.')
  for (const e of edits) t.messages.push(message({ kind: 'edit', ...e }))
  return t
}
const editStates = (ts: Thread[]) => ts[0].messages.filter((m) => m.kind === 'edit').map((m) => (m.kind === 'edit' ? m.reverted : null))

describe('Änderungsstatus mit dem Text abgleichen', () => {
  it('⌘Z: alter Text steht wieder da → zurückgenommen', () => {
    const ts = [threadWithEdits({ before: 'absolut sicher', after: 'wahrscheinlich' })]
    expect(editStates(syncEditStates(ts, () => 'absolut sicher', ''))).toEqual([true])
  })

  it('Redo: neuer Text steht wieder da → ausgeführt', () => {
    const ts = [threadWithEdits({ before: 'absolut sicher', after: 'wahrscheinlich', reverted: true })]
    expect(editStates(syncEditStates(ts, () => 'wahrscheinlich', ''))).toEqual([false])
  })

  it('nur die letzte Änderung wird abgeglichen', () => {
    const ts = [threadWithEdits({ before: 'a', after: 'b', reverted: true }, { before: 'a', after: 'b' })]
    expect(editStates(syncEditStates(ts, () => 'a', ''))).toEqual([true, true])
    expect(editStates(syncEditStates(ts, () => 'b', ''))).toEqual([true, false])
  })

  it('Text seitdem anders bearbeitet → Status bleibt', () => {
    const ts = [threadWithEdits({ before: 'a', after: 'b' })]
    expect(syncEditStates(ts, () => 'c', '')).toBe(ts)
  })

  it('ohne Änderung bleibt die Liste identisch (kein unnötiges Neurendern)', () => {
    const ts = [threadWithEdits({ before: 'a', after: 'b' })]
    expect(syncEditStates(ts, () => 'b', '')).toBe(ts)
  })
})

describe('Änderungen an anderer Stelle abgleichen', () => {
  const edit = { before: 'Leitsatz.', after: 'Leitsatz. Neuer Satz.', elsewhere: true }

  it('⌘Z: neuer Text weg, alter da → zurückgenommen; Redo → ausgeführt', () => {
    const ts = [threadWithEdits(edit)]
    const undone = syncEditStates(ts, () => 'Anker', 'Text. Leitsatz. Mehr.')
    expect(editStates(undone)).toEqual([true])
    expect(editStates(syncEditStates(undone, () => 'Anker', 'Text. Leitsatz. Neuer Satz. Mehr.'))).toEqual([false])
  })
})
