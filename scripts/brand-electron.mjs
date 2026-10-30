// Benennt das Electron-Bundle dieses Projekts (node_modules/electron) für die
// Entwicklung in „MAID“ um: Dock, ⌘-Tab, Menüleiste und Bundle-ID unterscheiden
// MAID dann von anderen Electron-Apps. Läuft automatisch nach `npm install`.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const NAME = 'MAID'
const BUNDLE_ID = 'local.maid.dev'

if (process.platform !== 'darwin') process.exit(0)

const app = join(import.meta.dirname, '..', 'node_modules', 'electron', 'dist', 'Electron.app')
const plist = join(app, 'Contents', 'Info.plist')
if (!existsSync(plist)) {
  console.warn('brand-electron: Electron.app nicht gefunden, übersprungen')
  process.exit(0)
}

const read = (key) => {
  try {
    return execFileSync('plutil', ['-extract', key, 'raw', '-o', '-', plist], { encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

const wanted = { CFBundleName: NAME, CFBundleDisplayName: NAME, CFBundleIdentifier: BUNDLE_ID }
const pending = Object.entries(wanted).filter(([key, value]) => read(key) !== value)
if (pending.length === 0) process.exit(0)

for (const [key, value] of pending) execFileSync('plutil', ['-replace', key, '-string', value, plist])
// Info.plist gehört zur Signatur; ad hoc neu signieren, damit macOS das Bundle startet.
execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'ignore' })
// LaunchServices über den neuen Namen informieren (Dock, ⌘-Tab).
execFileSync('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', ['-f', app], { stdio: 'ignore' })
console.log(`brand-electron: Electron.app heißt jetzt „${NAME}“ (${BUNDLE_ID})`)
