// Installiert die gebaute MAID.app (aus `npm run dist`) nach /Applications und
// macht sie zum Standardprogramm für Markdown (.md, .markdown).
// Eine laufende installierte MAID wird vorher sauber beendet (sie speichert dabei).
import { execFileSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const BUNDLE_ID = 'local.maid'
const MARKDOWN_UTI = 'net.daringfireball.markdown'
const TARGET = '/Applications/MAID.app'
const LSREGISTER = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'

const dist = join(import.meta.dirname, '..', 'dist')
const source = ['mac-arm64', 'mac', 'mac-universal'].map((d) => join(dist, d, 'MAID.app')).find(existsSync)
if (!source) {
  console.error('install-app: dist/mac*/MAID.app fehlt – erst `npm run dist`')
  process.exit(1)
}

const osascript = (script) => execFileSync('osascript', ['-e', script], { encoding: 'utf8' }).trim()
if (osascript(`application id "${BUNDLE_ID}" is running`) === 'true') {
  console.log('MAID läuft – wird beendet …')
  osascript(`tell application id "${BUNDLE_ID}" to quit`)
  for (let i = 0; i < 50 && osascript(`application id "${BUNDLE_ID}" is running`) === 'true'; i++) execFileSync('sleep', ['0.2'])
}

rmSync(TARGET, { recursive: true, force: true })
execFileSync('ditto', [source, TARGET])
execFileSync(LSREGISTER, ['-f', TARGET])
console.log(`Installiert: ${TARGET}`)

// Standardprogramm für Markdown setzen (LaunchServices; gilt für .md und .markdown).
const swift = `
import Foundation
import CoreServices
let status = LSSetDefaultRoleHandlerForContentType("${MARKDOWN_UTI}" as NSString as CFString, LSRolesMask.all, "${BUNDLE_ID}" as NSString as CFString)
print(status)
`
const status = execFileSync('swift', ['-'], { input: swift, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim()
if (status === '0') console.log('Standardprogramm für .md und .markdown: MAID')
else console.warn(`Standardprogramm konnte nicht gesetzt werden (LaunchServices-Status ${status}) – im Finder: Informationen → Öffnen mit → MAID → Alle ändern …`)
