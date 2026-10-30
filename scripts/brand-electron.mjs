// Legt für die Entwicklung neben dem Electron-Bundle dieses Projekts eine Kopie
// „MAID.app“ an (Name „MAID“, eigene Bundle-ID). Dock, ⌘-Tab und Menüleiste
// unterscheiden MAID so von anderen Electron-Apps; der Dock-Name kommt aus dem
// Ordnernamen, deshalb reicht ein geändertes Info.plist allein nicht.
// Läuft automatisch nach `npm install`; `npm run app` startet MAID.app.
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const NAME = 'MAID'
const BUNDLE_ID = 'local.maid.dev'
const ORIGINAL = { CFBundleName: 'Electron', CFBundleDisplayName: 'Electron', CFBundleIdentifier: 'com.github.Electron' }
const LSREGISTER = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'

if (process.platform !== 'darwin') process.exit(0)

const dist = join(import.meta.dirname, '..', 'node_modules', 'electron', 'dist')
const source = join(dist, 'Electron.app')
const target = join(dist, `${NAME}.app`)
if (!existsSync(source)) {
  console.warn('brand-electron: Electron.app nicht gefunden, übersprungen')
  process.exit(0)
}

const plistOf = (app) => join(app, 'Contents', 'Info.plist')
const read = (app, key) => {
  try {
    return execFileSync('plutil', ['-extract', key, 'raw', '-o', '-', plistOf(app)], { encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}
/** Setzt Werte im Info.plist und signiert ad hoc neu (Info.plist gehört zur Signatur). */
function brand(app, values) {
  const pending = Object.entries(values).filter(([key, value]) => read(app, key) !== value)
  if (pending.length === 0) return false
  for (const [key, value] of pending) execFileSync('plutil', ['-replace', key, '-string', value, plistOf(app)])
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'ignore' })
  execFileSync(LSREGISTER, ['-f', app], { stdio: 'ignore' })
  return true
}

// Frühere Fassung dieses Skripts hat Electron.app selbst umbenannt – rückgängig machen.
brand(source, ORIGINAL)

const version = read(source, 'CFBundleVersion')
if (existsSync(target) && read(target, 'CFBundleVersion') !== version) rmSync(target, { recursive: true, force: true })
if (!existsSync(target)) {
  // APFS-Klon: kostet praktisch keinen Speicherplatz.
  try {
    execFileSync('cp', ['-cR', source, target])
  } catch {
    cpSync(source, target, { recursive: true, verbatimSymlinks: true })
  }
}
if (brand(target, { CFBundleName: NAME, CFBundleDisplayName: NAME, CFBundleIdentifier: BUNDLE_ID })) {
  console.log(`brand-electron: ${NAME}.app angelegt (${BUNDLE_ID}, Electron ${version})`)
}
