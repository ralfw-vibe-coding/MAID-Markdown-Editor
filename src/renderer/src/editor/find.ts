import { EditorState } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { findNext, findPrevious, getSearchQuery, openSearchPanel, searchPanelOpen } from '@codemirror/search'
import type { FindCommand } from '../../../shared/host'

/** Suchleiste von CodeMirror auf Deutsch. */
export const findPhrases = EditorState.phrases.of({
  Find: 'Suchen',
  Replace: 'Ersetzen',
  next: 'Weiter',
  previous: 'Zurück',
  all: 'Alle',
  'match case': 'Groß/klein',
  regexp: 'Regulärer Ausdruck',
  'by word': 'Ganzes Wort',
  replace: 'Ersetzen',
  'replace all': 'Alle ersetzen',
  close: 'Schließen',
  'current match': 'aktueller Treffer',
  'on line': 'in Zeile',
  'replaced $ matches': '$ Treffer ersetzt',
  'replaced match on line $': 'Treffer in Zeile $ ersetzt',
  'Go to line': 'Gehe zu Zeile',
  go: 'Los',
})

/** Suchen und Ersetzen im Manuskript (Menü „Bearbeiten → Suchen“). */
export function runFind(view: EditorView, command: FindCommand) {
  // Weitersuchen ohne Suchbegriff öffnet die Suchleiste.
  const hasQuery = searchPanelOpen(view.state) && getSearchQuery(view.state).valid
  if (command === 'next' && hasQuery) return void findNext(view)
  if (command === 'previous' && hasQuery) return void findPrevious(view)
  openSearchPanel(view)
  if (command === 'replace') {
    const field = view.dom.querySelector<HTMLInputElement>('.cm-search input[name=replace]')
    field?.focus()
    field?.select()
  }
}
