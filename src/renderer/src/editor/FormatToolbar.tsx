import { Bold, Highlighter, Italic, Link, Strikethrough, Underline, type LucideIcon } from 'lucide-react'
import type { FormatCommand } from './format'

const BUTTONS: { cmd: FormatCommand; icon: LucideIcon; label: string; keys: string }[] = [
  { cmd: 'bold', icon: Bold, label: 'Fett', keys: '⌘B' },
  { cmd: 'italic', icon: Italic, label: 'Kursiv', keys: '⌘I' },
  { cmd: 'underline', icon: Underline, label: 'Unterstrichen', keys: '⌘U' },
  { cmd: 'strike', icon: Strikethrough, label: 'Durchgestrichen', keys: '⇧⌘X' },
  { cmd: 'highlight', icon: Highlighter, label: 'Hervorgehoben', keys: '⇧⌘H' },
  { cmd: 'link', icon: Link, label: 'Link einfügen', keys: '⌘K' },
]

/** Kleine Symbolleiste im Kopf des Manuskripts. Klicks nehmen dem Editor den Fokus nicht. */
export function FormatToolbar({ onFormat }: { onFormat: (cmd: FormatCommand) => void }) {
  return (
    <span className="format-toolbar" role="toolbar" aria-label="Formatierung">
      {BUTTONS.map(({ cmd, icon: Icon, label, keys }, i) => (
        <button
          key={cmd}
          className={`icon ${i === BUTTONS.length - 1 ? 'separated' : ''}`}
          title={`${label} (${keys})`}
          aria-label={label}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onFormat(cmd)}
        >
          <Icon size={14} />
        </button>
      ))}
    </span>
  )
}
