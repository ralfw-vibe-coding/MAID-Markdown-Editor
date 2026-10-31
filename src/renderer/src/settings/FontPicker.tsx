import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

/**
 * Ist eine Schrift installiert? Gemessen wird, ob ein Mustertext mit ihr
 * anders breit ist als mit der Ersatzschrift – die übliche Erkennung ohne
 * Zugriff auf die Schriftenliste des Systems.
 */
function isInstalled(name: string): boolean {
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return true
  const sample = 'mmmmmmmmmmlliWW@#0123456789'
  return ['monospace', 'serif', 'sans-serif'].some((base) => {
    ctx.font = `72px ${base}`
    const plain = ctx.measureText(sample).width
    ctx.font = `72px "${name}", ${base}`
    return ctx.measureText(sample).width !== plain
  })
}

type Props = {
  value: string
  fonts: string[]
  /** Ersatzschrift, falls die Schrift fehlt – nur für die Anzeige. */
  fallback: string
  onChange: (family: string) => void
}

/**
 * Schriftauswahl mit Vorschau: Jede Schrift erscheint in sich selbst; das
 * Eingabefeld zeigt die gewählte. Freie Eingabe bleibt möglich.
 */
export function FontPicker({ value, fonts, fallback, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLSpanElement>(null)
  const installed = useMemo(() => fonts.filter(isInstalled), [fonts])

  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', close, true)
    document.addEventListener('keydown', close, true)
    return () => {
      document.removeEventListener('pointerdown', close, true)
      document.removeEventListener('keydown', close, true)
    }
  }, [open])

  const pick = (family: string) => {
    onChange(family)
    setOpen(false)
  }

  return (
    <span className="font-picker" ref={box}>
      <input
        type="text"
        placeholder="Standard"
        value={value}
        style={value.trim() ? { fontFamily: `"${value.trim()}", ${fallback}` } : undefined}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
      />
      <button type="button" className="icon" aria-label="Schriften anzeigen" onClick={() => setOpen((o) => !o)}>
        <ChevronDown size={14} />
      </button>
      {open && (
        <ul className="font-list" role="listbox">
          <li role="option" aria-selected={!value} className={!value ? 'selected' : ''} onClick={() => pick('')}>
            Standard
          </li>
          {installed.map((f) => (
            <li
              key={f}
              role="option"
              aria-selected={value === f}
              className={value === f ? 'selected' : ''}
              style={{ fontFamily: `"${f}", ${fallback}` }}
              onClick={() => pick(f)}
            >
              {f}
            </li>
          ))}
        </ul>
      )}
    </span>
  )
}
