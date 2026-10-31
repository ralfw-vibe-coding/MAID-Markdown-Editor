import { useEffect, useRef, useState } from 'react'
import type { MaidHost } from '../../../shared/host'
import { createVersion, parseVersions, serializeVersions, type Version } from './versions'

const fileName = (path: string) => path.split('/').pop()!

/**
 * Versionen des geöffneten Dokuments. Sie werden sofort in die Versionsdatei
 * geschrieben – unabhängig vom Sichern des Dokuments.
 */
export function useVersions(host: MaidHost | null, path: string | null) {
  const [versions, setVersions] = useState<Version[]>([])
  const [error, setError] = useState<string | null>(null)
  const latest = useRef(versions)
  latest.current = versions
  /** Für welche Datei die Liste gilt – verhindert, dass ein spätes Laden frisch Angelegtes überschreibt. */
  const loadedFor = useRef<string | null>(null)

  useEffect(() => {
    if (!host || !path || loadedFor.current === path) return
    loadedFor.current = path
    setVersions([])
    host
      .readVersions(path)
      .then((json) => {
        if (loadedFor.current === path) setVersions(json ? parseVersions(json) : [])
      })
      .catch((err: Error) => setError(`Versionen konnten nicht gelesen werden: ${err.message}`))
  }, [host, path])

  async function persist(docPath: string, next: Version[]) {
    loadedFor.current = docPath
    latest.current = next
    setVersions(next)
    await host!.writeVersions(docPath, serializeVersions(fileName(docPath), next))
  }

  async function add(docPath: string, text: string, message: string, auto = false): Promise<Version> {
    const base = loadedFor.current === docPath ? latest.current : []
    const version = createVersion(text, message, base.at(-1), auto)
    await persist(docPath, [...base, version])
    return version
  }

  async function remove(docPath: string, id: string) {
    await persist(docPath, latest.current.filter((v) => v.id !== id))
  }

  return { versions, add, remove, error, clearError: () => setError(null) }
}
