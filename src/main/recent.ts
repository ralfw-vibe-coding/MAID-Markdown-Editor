import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * „Zuletzt benutzt“ führt MAID selbst (userData/recent.json). Die Liste von macOS
 * hängt an der Code-Signatur der App; ad hoc signiert ändert die sich mit jedem
 * Build, und macOS verwirft dann die Liste. So teilen sich außerdem
 * Entwicklungsversion und installierte App eine Liste.
 */
const MAX_RECENT = 10

const file = () => join(app.getPath('userData'), 'recent.json')

let current: string[] | null = null
let writing = Promise.resolve()

function load(): string[] {
  if (!current) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(file(), 'utf8'))
      current = Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : []
    } catch {
      current = []
    }
  }
  return current
}

function save(list: string[]): Promise<void> {
  current = list
  // Nacheinander schreiben, damit sich schnelle Änderungen nicht überholen.
  writing = writing
    .then(async () => {
      const tmp = file() + '.tmp'
      await writeFile(tmp, JSON.stringify(list, null, 2) + '\n', 'utf8')
      await rename(tmp, file())
    })
    .catch((err) => console.error('recent.json:', err))
  return writing
}

/** Zuletzt benutzte Dokumente, neuestes zuerst; nicht mehr vorhandene fallen weg. */
export function recentDocuments(): string[] {
  return load().filter((p) => existsSync(p))
}

/** Setzt das Dokument an den Anfang der Liste. Liefert, ob sich die Liste geändert hat. */
export function noteRecentDocument(path: string): boolean {
  const list = load()
  if (list[0] === path) return false
  void save([path, ...list.filter((p) => p !== path)].slice(0, MAX_RECENT))
  return true
}

export function clearRecentDocuments() {
  void save([])
}
