import { basename, dirname, join } from 'node:path'
import type { UpdateOffer, UpdateState } from '../shared/host'

/**
 * Aktualisierung aus einem Ordner – ohne Apple-Entwicklerprogramm, ohne
 * Notarisierung, ohne Server. Im Update-Ordner (meist ein geteilter
 * Dropbox-Ordner) liegen ZIPs mit MAID.app. Dropbox setzt kein
 * Quarantäne-Attribut, also startet die neue App ohne Gatekeeper-Rückfrage.
 * Dass sie wirklich vom Entwickler ist, zeigt die Signatur: Die neue App muss
 * die „designated requirement“ der installierten erfüllen (gleiches
 * Zertifikat, gleiche Bundle-ID).
 */

/** So heißt die App im ZIP und im Bundle. */
export const APP_NAME = 'MAID.app'
/** Build-Angaben, die das Packskript in die App schreibt (scripts/package.mjs). */
export const BUILD_INFO = 'Contents/Resources/app/package.json'
/** Versteckter Ordner neben der installierten App: dasselbe Volume, der Tausch ist ein `mv`. */
export const STAGING_NAME = '.MAID Update'

/** Wirkungen nach außen – in Tests durch Attrappen ersetzt. */
export type UpdateTools = {
  /** Dateinamen in einem Ordner. */
  list(folder: string): Promise<string[]>
  /** Führt ein Programm aus; bei Fehler stderr als Text, sonst die Fehlermeldung. */
  run(command: string, args: string[]): Promise<{ ok: true; stdout: string } | { ok: false; error: string }>
  read(path: string): Promise<string>
  write(path: string, text: string): Promise<void>
  /** Löscht Datei oder Ordner; fehlt er, ist das kein Fehler. */
  remove(path: string): Promise<void>
  /** Startet ein Programm abgekoppelt; es läuft weiter, wenn MAID endet. */
  detach(command: string, args: string[]): void
  quit(): void
  now(): Date
}

/** Laufender Build: Nummer und Chip. */
export type RunningBuild = { build: number; arch: string }

/** `…/MAID.app/Contents/MacOS/MAID` → `…/MAID.app`; null, wenn die App nicht in einem Bundle läuft. */
export function bundleOf(exe: string): string | null {
  const bundle = dirname(dirname(dirname(exe)))
  return bundle.endsWith('.app') && basename(dirname(exe)) === 'MacOS' ? bundle : null
}

/** Build-Angaben aus der package.json im ZIP; null, wenn sie fehlen oder für einen anderen Chip sind. */
export function offerOf(file: string, packageJson: string, arch: string): UpdateOffer | null {
  try {
    const p = JSON.parse(packageJson) as { version?: unknown; build?: unknown; commit?: unknown; arch?: unknown }
    const build = Number(p.build)
    if (!Number.isInteger(build) || build <= 0) return null
    // Alte Builds ohne Chip-Angabe gelten als passend.
    if (typeof p.arch === 'string' && p.arch !== arch) return null
    return {
      version: typeof p.version === 'string' ? p.version : '',
      build,
      ...(typeof p.commit === 'string' && p.commit ? { commit: p.commit } : {}),
      file,
    }
  } catch {
    return null
  }
}

/** Der höchste Build, der neuer ist als der laufende. */
export function newestOffer(offers: UpdateOffer[], build: number): UpdateOffer | null {
  return offers.filter((o) => o.build > build).reduce<UpdateOffer | null>((best, o) => (!best || o.build > best.build ? o : best), null)
}

/** Aus `codesign -d -r-` (stdout): die Zeile „designated => …“. */
export function requirementOf(codesignOutput: string): string | null {
  const line = codesignOutput.split('\n').find((l) => l.startsWith('designated => '))
  return line ? line.slice('designated => '.length).trim() : null
}

/**
 * Tauscht die App, sobald sie beendet ist. Argumente: $1 PID der App,
 * $2 installiertes Bundle, $3 neues Bundle, $4 Ablage für das alte (im
 * Staging-Ordner), $5 Staging-Ordner. Klappt der zweite `mv` nicht, kommt
 * die alte App zurück. Gestartet wird in jedem Fall wieder.
 */
export const SWAP_SCRIPT = `while kill -0 "$1" 2>/dev/null; do sleep 0.2; done
if mv "$2" "$4"; then if mv "$3" "$2"; then :; else mv "$4" "$2"; fi; fi
rm -rf "$5"
open "$2"`

type Config = { folder?: string }

export type Updater = {
  state(): UpdateState
  /** Ordner setzen (und gleich prüfen) oder mit null entfernen. */
  setFolder(folder: string | null): Promise<UpdateState>
  check(): Promise<UpdateState>
  install(): Promise<UpdateState>
}

/**
 * `running` ist null bei MAID aus dem Repo (ohne Build-Nummer): Dann gibt es
 * keine Aktualisierung. `configFile` liegt lokal (userData), denn der Pfad
 * zum Update-Ordner ist auf jedem Mac ein anderer.
 */
export async function createUpdater(opts: {
  tools: UpdateTools
  running: RunningBuild | null
  exe: string
  pid: number
  configFile: string
  onChange: (state: UpdateState) => void
}): Promise<Updater> {
  const { tools, running, exe, pid, configFile, onChange } = opts
  let config: Config = {}
  try {
    config = JSON.parse(await tools.read(configFile)) as Config
  } catch {
    // Noch kein Ordner gewählt.
  }

  let current: UpdateState = !running ? { state: 'unavailable' } : config.folder ? { state: 'current', build: running.build, folder: config.folder, checked: '' } : { state: 'off', build: running.build }
  const set = (next: UpdateState) => {
    current = next
    onChange(next)
    return next
  }

  async function check(): Promise<UpdateState> {
    if (!running) return current
    const folder = config.folder
    if (!folder) return set({ state: 'off', build: running.build })
    if (current.state === 'installing') return current
    const build = running.build
    let files: string[]
    try {
      files = (await tools.list(folder)).filter((f) => f.toLowerCase().endsWith('.zip'))
    } catch (err) {
      return set({ state: 'failed', build, folder, message: `Ordner nicht lesbar: ${(err as Error).message}` })
    }
    const offers: UpdateOffer[] = []
    for (const file of files) {
      // Nur die Build-Angaben lesen, ohne zu entpacken – auch bei 100 MB eine Sache von Millisekunden.
      const r = await tools.run('unzip', ['-p', join(folder, file), `${APP_NAME}/${BUILD_INFO}`])
      const offer = r.ok ? offerOf(file, r.stdout, running.arch) : null
      if (offer) offers.push(offer)
    }
    // Während der Prüfung kann der Ordner gewechselt oder die Installation gestartet worden sein.
    if (config.folder !== folder || (current as UpdateState).state === 'installing') return current
    const checked = tools.now().toISOString()
    const offer = newestOffer(offers, build)
    return set(offer ? { state: 'available', build, folder, checked, offer } : { state: 'current', build, folder, checked })
  }

  async function setFolder(folder: string | null): Promise<UpdateState> {
    if (!running || current.state === 'installing') return current
    config = folder ? { folder } : {}
    await tools.write(configFile, JSON.stringify(config, null, 2) + '\n')
    return check()
  }

  async function install(): Promise<UpdateState> {
    if (!running || current.state !== 'available') return current
    const { folder, offer, build } = current
    const fail = async (message: string, staged?: string) => {
      if (staged) await tools.remove(staged).catch(() => {})
      return set({ state: 'failed', build, folder, message })
    }
    const bundle = bundleOf(exe)
    if (!bundle) return fail('MAID läuft nicht als App-Bundle und kann sich nicht selbst austauschen.')
    set({ state: 'installing', build, folder, offer })

    // 1. Neben die installierte App entpacken. Fehlen dort Schreibrechte, scheitert schon das.
    const staged = join(dirname(bundle), STAGING_NAME)
    await tools.remove(staged).catch(() => {})
    const unpacked = await tools.run('ditto', ['-x', '-k', join(folder, offer.file), staged])
    if (!unpacked.ok) return fail(`Kein Platz für das Update neben der App: ${unpacked.error}`, staged)
    const fresh = join(staged, APP_NAME)

    // 2. Build im Entpackten noch einmal prüfen.
    let freshOffer: UpdateOffer | null = null
    try {
      freshOffer = offerOf(offer.file, await tools.read(join(fresh, BUILD_INFO)), running.arch)
    } catch {
      // bleibt null
    }
    if (!freshOffer || freshOffer.build <= build) return fail(`${offer.file} enthält keine neuere ${APP_NAME}`, staged)

    // 3. Signatur: gültig, und sie erfüllt die Anforderung der installierten App.
    const valid = await tools.run('codesign', ['--verify', '--deep', '--strict', fresh])
    if (!valid.ok) return fail(`Signatur der neuen App ungültig: ${valid.error}`, staged)
    const installed = await tools.run('codesign', ['-d', '-r-', bundle])
    const requirement = installed.ok ? requirementOf(installed.stdout) : null
    if (!requirement) return fail(`Die neue App ist anders signiert als die installierte: Signatur der installierten App nicht lesbar${installed.ok ? '' : ` (${installed.error})`}`, staged)
    // `-R` und `=<Text>` sind zwei Argumente; das `=` heißt „Anforderung als Text“.
    const same = await tools.run('codesign', ['--verify', '-R', `=${requirement}`, fresh])
    if (!same.ok) return fail(`Die neue App ist anders signiert als die installierte: ${same.error}`, staged)

    // 4. Quarantäne entfernen, falls das ZIP doch aus einem Browser kam – erst nach der Signaturprüfung.
    await tools.run('xattr', ['-dr', 'com.apple.quarantine', fresh])

    // 5. Tauschen, sobald MAID beendet ist; eine laufende App kann sich nicht sauber selbst ersetzen.
    tools.detach('/bin/sh', ['-c', SWAP_SCRIPT, 'maid-update', String(pid), bundle, fresh, join(staged, 'previous.app'), staged])
    tools.quit()
    return current
  }

  return { state: () => current, setFolder, check, install }
}
