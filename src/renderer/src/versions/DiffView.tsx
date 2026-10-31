import { useMemo, useState } from 'react'
import { RotateCcw, X } from 'lucide-react'
import { diffWords } from '../thread/diffWords'
import { diffParagraphs, type ParagraphDiff, type Version } from './versions'

type Props = {
  version: Version
  /** Vorherige Version (für „Was hat diese Version geändert?“). */
  previous: Version | undefined
  current: string
  onRestore: () => void
  onClose: () => void
}

type Mode = 'toCurrent' | 'fromPrevious'

/**
 * Vergleich anstelle der Druckfahne: absatzweise, Änderungen wortgenau,
 * unveränderte Absätze eingeklappt.
 */
export function DiffView({ version, previous, current, onRestore, onClose }: Props) {
  const [mode, setMode] = useState<Mode>('toCurrent')
  const [before, after] = mode === 'toCurrent' ? [version.text, current] : [previous?.text ?? '', version.text]
  const diff = useMemo(() => diffParagraphs(before, after), [before, after])
  const changes = diff.filter((d) => d.type !== 'same').length

  return (
    <div className="diff-view">
      <div className="diff-bar">
        <div className="diff-row">
          <div className="diff-title">
            <strong>{version.message || '(ohne Nachricht)'}</strong>
            <span className="muted"> · {new Date(version.createdAt).toLocaleString('de-DE')}</span>
          </div>
          <button className="icon" aria-label="Vergleich schließen" title="Schließen" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="diff-row">
          <div className="diff-mode" role="tablist">
            <button className={mode === 'toCurrent' ? 'active' : ''} onClick={() => setMode('toCurrent')} title="Was hat sich seit dieser Version geändert?">
              Seitdem
            </button>
            <button className={mode === 'fromPrevious' ? 'active' : ''} onClick={() => setMode('fromPrevious')} title="Was hat diese Version gegenüber der vorherigen geändert?">
              Diese Version
            </button>
          </div>
          <button className="restore" disabled={version.text === current} onClick={onRestore} title="Manuskript auf diese Version zurücksetzen (vorher wird der jetzige Stand gesichert)">
            <RotateCcw size={14} /> Zurück zu dieser Version
          </button>
        </div>
      </div>
      <div className="diff-legend muted">
        {mode === 'toCurrent' ? 'Rot: nur in dieser Version · Grün: seitdem hinzugekommen' : `Gegenüber ${previous ? 'der vorherigen Version' : 'einem leeren Dokument'}`}
        {' · '}
        {changes === 0 ? 'keine Unterschiede' : `${changes} ${changes === 1 ? 'Absatz' : 'Absätze'} geändert`}
      </div>
      <div className="diff-body">
        {group(diff).map((g, i) =>
          g.type === 'same' ? <Unchanged key={i} texts={g.texts} /> : <Changed key={i} d={g.d} />,
        )}
      </div>
    </div>
  )
}

type Group = { type: 'same'; texts: string[] } | { type: 'change'; d: Exclude<ParagraphDiff, { type: 'same' }> }

/** Aufeinanderfolgende unveränderte Absätze zusammenfassen. */
function group(diff: ParagraphDiff[]): Group[] {
  const out: Group[] = []
  for (const d of diff) {
    const last = out.at(-1)
    if (d.type === 'same') {
      if (last?.type === 'same') last.texts.push(d.text)
      else out.push({ type: 'same', texts: [d.text] })
    } else out.push({ type: 'change', d })
  }
  return out
}

function Unchanged({ texts }: { texts: string[] }) {
  const [open, setOpen] = useState(false)
  if (open) return <>{texts.map((t, i) => <p key={i} className="diff-par same">{t}</p>)}</>
  return (
    <button className="diff-fold" onClick={() => setOpen(true)}>
      {texts.length} unveränderte{texts.length === 1 ? 'r Absatz' : ' Absätze'} – anzeigen
    </button>
  )
}

function Changed({ d }: { d: Exclude<ParagraphDiff, { type: 'same' }> }) {
  if (d.type === 'added') return <p className="diff-par added"><ins>{d.text}</ins></p>
  if (d.type === 'removed') return <p className="diff-par removed"><del>{d.text}</del></p>
  return (
    <p className="diff-par changed">
      {diffWords(d.before, d.after).map((p, i) =>
        p.type === 'same' ? <span key={i}>{p.text}</span> : p.type === 'del' ? <del key={i}>{p.text}</del> : <ins key={i}>{p.text}</ins>,
      )}
    </p>
  )
}
