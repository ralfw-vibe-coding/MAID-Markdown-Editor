import { useEffect, useRef, useState } from 'react'
import { CircleHelp, Trash2 } from 'lucide-react'

/**
 * Papierkorb mit Rückfrage ohne Dialog: Der erste Klick macht daraus ein „?“,
 * erst ein zweiter Klick löscht. Ein Klick woanders (oder Esc) nimmt die
 * Rückfrage zurück.
 */
export function ConfirmDeleteButton({ label, onDelete }: { label: string; onDelete: () => void }) {
  const [armed, setArmed] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!armed) return
    const disarm = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setArmed(false)
    }
    document.addEventListener('pointerdown', disarm, true)
    document.addEventListener('keydown', disarm, true)
    return () => {
      document.removeEventListener('pointerdown', disarm, true)
      document.removeEventListener('keydown', disarm, true)
    }
  }, [armed])

  return (
    <button
      ref={ref}
      className={`icon danger ${armed ? 'armed' : ''}`}
      title={armed ? `Nochmal klicken: ${label}` : label}
      aria-label={armed ? `${label} bestätigen` : label}
      onClick={(e) => {
        e.stopPropagation()
        if (armed) onDelete()
        else setArmed(true)
      }}
    >
      {armed ? <CircleHelp size={15} /> : <Trash2 size={15} />}
    </button>
  )
}
