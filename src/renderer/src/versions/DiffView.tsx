import { useMemo, useState } from 'react'
import { RotateCcw, X } from 'lucide-react'
import { diffWords } from '../thread/diffWords'
import { EditableTitle } from '../layout/EditableTitle'
import { diffParagraphs, type ParagraphDiff } from './versions'

type Props = {
  title: string
  /** Macht den Titel umbenennbar (Klick auf den Titel). */
  onRename?: (title: string) => void
  /** Ursprünglicher Wert für das Umbenennen (ohne Ersatztext wie „(ohne Bezeichnung)“). */
  rawTitle?: string
  meta?: string
  /** Erklärt, was verglichen wird. */
  legend: string
  before: string
  after: string
  /** Text, wenn es keine Unterschiede gibt. */
  emptyText: string
  restoreLabel?: string
  restoreTitle?: string
  onRestore?: () => void
  onClose?: () => void
}

/** Absatzweiser Vergleich, Änderungen wortgenau, unveränderte Absätze eingeklappt. */
export function DiffView({ title, rawTitle, onRename, meta, legend, before, after, emptyText, restoreLabel, restoreTitle, onRestore, onClose }: Props) {
  const diff = useMemo(() => diffParagraphs(before, after), [before, after])
  const changes = diff.filter((d) => d.type !== 'same').length

  return (
    <div className="diff-view">
      <div className="diff-bar">
        <div className="diff-row">
          <div className="diff-title">
            <strong>{onRename ? <EditableTitle value={rawTitle ?? title} placeholder={title} onRename={onRename} /> : title}</strong>
            {meta && <span className="muted"> · {meta}</span>}
          </div>
          {onClose && (
            <button className="icon" aria-label="Auswahl aufheben" title="Zurück zu „jetzt“" onClick={onClose}>
              <X size={16} />
            </button>
          )}
        </div>
        <div className="diff-row">
          <span className="diff-legend muted">
            {legend} · {changes === 0 ? 'keine Unterschiede' : `${changes} ${changes === 1 ? 'Absatz' : 'Absätze'} geändert`}
          </span>
          {onRestore && restoreLabel && (
            <button className="restore" disabled={before === after && changes === 0} onClick={onRestore} title={restoreTitle}>
              <RotateCcw size={14} /> {restoreLabel}
            </button>
          )}
        </div>
      </div>
      <div className="diff-body">
        {changes === 0 ? (
          <p className="diff-empty muted">{emptyText}</p>
        ) : (
          group(diff).map((g, i) => (g.type === 'same' ? <Unchanged key={i} texts={g.texts} /> : <Changed key={i} d={g.d} />))
        )}
      </div>
    </div>
  )
}

type Change = Exclude<ParagraphDiff, { type: 'same' }>
type Group = { type: 'same'; texts: string[] } | { type: 'change'; d: Change }

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

function Changed({ d }: { d: Change }) {
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
