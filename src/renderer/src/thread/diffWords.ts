export type DiffPart = { type: 'same' | 'del' | 'ins'; text: string }

const TOKEN = /\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu

/** Wortweiser Vorher-/Nachher-Vergleich (LCS) für die Anzeige im Thread. */
export function diffWords(before: string, after: string): DiffPart[] {
  const a = before.match(TOKEN) ?? []
  const b = after.match(TOKEN) ?? []
  const n = a.length
  const m = b.length
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const raw: DiffPart[] = []
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      raw.push({ type: 'same', text: a[i++] })
      j++
    } else if (i < n && (j === m || lcs[i + 1][j] >= lcs[i][j + 1])) {
      raw.push({ type: 'del', text: a[i++] })
    } else {
      raw.push({ type: 'ins', text: b[j++] })
    }
  }
  return coalesce(raw)
}

/**
 * Fasst zusammenhängende Änderungen zu „gelöscht, dann eingefügt“ zusammen;
 * reine Leerräume zwischen zwei Änderungen zählen zur Änderung.
 */
function coalesce(raw: DiffPart[]): DiffPart[] {
  const out: DiffPart[] = []
  const emit = (type: DiffPart['type'], text: string) => {
    if (!text) return
    const last = out.at(-1)
    if (last?.type === type) last.text += text
    else out.push({ type, text })
  }
  let k = 0
  while (k < raw.length) {
    if (raw[k].type === 'same') {
      emit('same', raw[k++].text)
      continue
    }
    let del = ''
    let ins = ''
    while (k < raw.length) {
      const p = raw[k]
      const bridge = p.type === 'same' && /^\s+$/.test(p.text) && raw[k + 1] && raw[k + 1].type !== 'same'
      if (p.type === 'del') del += p.text
      else if (p.type === 'ins') ins += p.text
      else if (bridge) {
        del += p.text
        ins += p.text
      } else break
      k++
    }
    emit('del', del)
    emit('ins', ins)
  }
  return out
}
