import { diffWords } from '../thread/diffWords'

/**
 * Gesicherter Stand des Manuskripts mit Nachricht – wie ein Commit, aber ohne
 * git. Versionen liegen in `<dokument>.md.commits.json` neben dem Dokument.
 */
export type Version = {
  id: string
  message: string
  createdAt: string
  text: string
  /** Geänderte Wörter gegenüber der vorherigen Version. */
  added: number
  removed: number
  /** Von MAID automatisch angelegt, z. B. vor dem Zurückgehen. */
  auto?: boolean
}

export type VersionsFile = {
  format: 'maid-versions'
  version: 1
  document: string
  versions: Version[]
}

/** Anzeigename einer Fassung; automatische ohne Bezeichnung heißen „Automatisch festgehalten“. */
export function fassungTitle(v: Version): string {
  return v.message || (v.auto ? 'Automatisch festgehalten' : '(ohne Bezeichnung)')
}

export function parseVersions(json: string): Version[] {
  const data = JSON.parse(json) as VersionsFile
  if (data?.format !== 'maid-versions' || !Array.isArray(data.versions)) throw new Error('Unbekanntes Format der Versionsdatei')
  return data.versions
}

export function serializeVersions(documentName: string, versions: Version[]): string {
  const file: VersionsFile = { format: 'maid-versions', version: 1, document: documentName, versions }
  return JSON.stringify(file, null, 2) + '\n'
}

export function createVersion(text: string, message: string, previous: Version | undefined, auto = false): Version {
  const { added, removed } = wordStats(previous?.text ?? '', text)
  return { id: crypto.randomUUID(), message: message.trim(), createdAt: new Date().toISOString(), text, added, removed, ...(auto ? { auto } : {}) }
}

// ── Absatzweiser Vergleich ────────────────────────────────────────────────

export type ParagraphDiff =
  | { type: 'same'; text: string }
  | { type: 'added'; text: string }
  | { type: 'removed'; text: string }
  | { type: 'changed'; before: string; after: string }

const paragraphs = (text: string) => text.split(/\n[ \t]*\n+/).map((p) => p.replace(/^\n+|\n+$/g, '')).filter((p) => p !== '')

/** LCS über Listen; liefert die Paare gleicher Indizes. Bei sehr großen Eingaben null. */
function lcsPairs<T>(a: T[], b: T[], limit = 4_000_000): [number, number][] | null {
  const n = a.length
  const m = b.length
  if (n * m > limit) return null
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const pairs: [number, number][] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      pairs.push([i++, j++])
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++
    else j++
  }
  return pairs
}

/**
 * Vergleicht zwei Fassungen absatzweise. Gelöschte und eingefügte Absätze an
 * derselben Stelle werden zu „geändert“ gepaart, damit man sie wortweise sieht.
 */
export function diffParagraphs(before: string, after: string): ParagraphDiff[] {
  const a = paragraphs(before)
  const b = paragraphs(after)
  const pairs = lcsPairs(a, b) ?? []
  const out: ParagraphDiff[] = []
  let i = 0
  let j = 0
  const flush = (i1: number, j1: number) => {
    const removed = a.slice(i, i1)
    const added = b.slice(j, j1)
    const common = Math.min(removed.length, added.length)
    for (let k = 0; k < common; k++) out.push({ type: 'changed', before: removed[k], after: added[k] })
    for (const t of removed.slice(common)) out.push({ type: 'removed', text: t })
    for (const t of added.slice(common)) out.push({ type: 'added', text: t })
  }
  for (const [pi, pj] of pairs) {
    flush(pi, pj)
    out.push({ type: 'same', text: a[pi] })
    i = pi + 1
    j = pj + 1
  }
  flush(a.length, b.length)
  return out
}

const countWords = (s: string) => (s.match(/[\p{L}\p{N}_]+/gu) ?? []).length

/** Hinzugekommene und entfernte Wörter zwischen zwei Fassungen. */
export function wordStats(before: string, after: string): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const d of diffParagraphs(before, after)) {
    if (d.type === 'added') added += countWords(d.text)
    else if (d.type === 'removed') removed += countWords(d.text)
    else if (d.type === 'changed') {
      for (const p of diffWords(d.before, d.after)) {
        if (p.type === 'ins') added += countWords(p.text)
        if (p.type === 'del') removed += countWords(p.text)
      }
    }
  }
  return { added, removed }
}

// ── Zurückgehen mit minimalen Änderungen ──────────────────────────────────

export type TextChange = { from: number; to: number; insert: string }

const lines = (s: string) => s.match(/[^\n]*\n|[^\n]+$/g) ?? []

/**
 * Zeilenweise Änderungen, die `current` in `target` überführen. Unveränderte
 * Zeilen bleiben unberührt – so bleiben Kommentare dort verankert.
 * Positionen beziehen sich auf `current` und sind aufsteigend.
 */
export function lineChanges(current: string, target: string): TextChange[] {
  if (current === target) return []
  const a = lines(current)
  const b = lines(target)
  const offsets = [0]
  for (const l of a) offsets.push(offsets.at(-1)! + l.length)

  let pre = 0
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++
  let suf = 0
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++
  const midA = a.slice(pre, a.length - suf)
  const midB = b.slice(pre, b.length - suf)

  const pairs = lcsPairs(midA, midB)
  if (!pairs) return [{ from: offsets[pre], to: offsets[a.length - suf], insert: midB.join('') }]

  const changes: TextChange[] = []
  let i = 0
  let j = 0
  const hunk = (i1: number, j1: number) => {
    if (i1 > i || j1 > j) changes.push({ from: offsets[pre + i], to: offsets[pre + i1], insert: midB.slice(j, j1).join('') })
  }
  for (const [pi, pj] of pairs) {
    hunk(pi, pj)
    i = pi + 1
    j = pj + 1
  }
  hunk(midA.length, midB.length)
  return changes
}

/** Wendet aufsteigende, sich nicht überlappende Änderungen an (für Tests und Vorschau). */
export function applyChanges(text: string, changes: TextChange[]): string {
  let out = ''
  let pos = 0
  for (const c of changes) {
    out += text.slice(pos, c.from) + c.insert
    pos = c.to
  }
  return out + text.slice(pos)
}
