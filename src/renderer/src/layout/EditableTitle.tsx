import { useState, type MouseEvent } from 'react'

type Props = {
  value: string
  /** Anzeige, wenn `value` leer ist. */
  placeholder: string
  onRename: (title: string) => void
  /** Wie die Bearbeitung beginnt: Klick oder Doppelklick (z. B. in Listen, wo ein Klick auswählt). */
  trigger?: 'click' | 'dblclick'
  className?: string
}

/** Titel, der sich an Ort und Stelle umbenennen lässt: ↩ übernimmt, Esc bricht ab. */
export function EditableTitle({ value, placeholder, onRename, trigger = 'click', className = '' }: Props) {
  const [editing, setEditing] = useState(false)
  if (!editing) {
    const start = (e: MouseEvent) => {
      e.stopPropagation()
      setEditing(true)
    }
    return (
      <span
        className={`editable-title ${className}`}
        title={trigger === 'click' ? 'Klicken zum Umbenennen' : 'Doppelklicken zum Umbenennen'}
        onClick={trigger === 'click' ? start : undefined}
        onDoubleClick={trigger === 'dblclick' ? start : undefined}
      >
        {value || placeholder}
      </span>
    )
  }
  const commit = (v: string) => {
    if (!editing) return
    setEditing(false)
    if (v.trim() !== value) onRename(v.trim())
  }
  return (
    <input
      className={`editable-title-input ${className}`}
      autoFocus
      defaultValue={value}
      placeholder={placeholder}
      onClick={(e) => e.stopPropagation()}
      onFocus={(e) => e.target.select()}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') commit(e.currentTarget.value)
        if (e.key === 'Escape') setEditing(false)
      }}
    />
  )
}
