// Baut MAID.app für den Update-Ordner: electron-builder packt, dieses Skript
// schreibt die Build-Angaben hinein, signiert mit einer festen Identität und
// legt ein ZIP nach dist/. Das ZIP kommt in den geteilten Update-Ordner; jede
// MAID mit diesem Ordner bietet es dann an (Einstellungen → Aktualisierung).
//
// Feste Signatur: Jeder Build wird mit demselben Zertifikat signiert, daran
// erkennt der Updater, dass ein ZIP wirklich von hier ist. Ein selbst
// erstelltes Code-Signing-Zertifikat aus der Schlüsselbundverwaltung genügt
// (Zertifikatsassistent → Zertifikat erstellen → Typ „Code-Signierung“).
// Ad hoc („-“) geht nicht: Dessen Anforderung ist der Fingerabdruck des
// einzelnen Builds, kein neuer Build passt dazu.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Name des Code-Signing-Zertifikats im Schlüsselbund. Nie wechseln – sonst nimmt keine installierte MAID mehr Updates an. */
const IDENTITY = process.env.MAID_SIGN_IDENTITY || 'HyperRec Code Signing'

const root = join(import.meta.dirname, '..')
const dist = join(root, 'dist')
const run = (command, args, options = {}) => execFileSync(command, args, { cwd: root, encoding: 'utf8', ...options })
const git = (...args) => run('git', args).trim()

const identities = run('security', ['find-identity', '-v', '-p', 'codesigning'])
if (!identities.includes(`"${IDENTITY}"`)) {
  console.error(`package: Code-Signing-Zertifikat „${IDENTITY}“ fehlt im Schlüsselbund (oder MAID_SIGN_IDENTITY setzen).\n${identities}`)
  process.exit(1)
}

// Fortlaufende Build-Nummer: die Zahl der Commits. Ungesicherte Änderungen stehen im Commit-Kürzel.
const build = Number(git('rev-list', '--count', 'HEAD'))
const commit = git('rev-parse', '--short', 'HEAD') + (git('status', '--porcelain') ? '-dirty' : '')
const arch = process.arch
const { version, productName } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

run(join(root, 'node_modules/.bin/electron-builder'), ['--mac', `--${arch}`], { stdio: 'inherit' })

const appPath = join(dist, arch === 'arm64' ? 'mac-arm64' : 'mac', `${productName}.app`)
if (!existsSync(appPath)) {
  console.error(`package: ${appPath} fehlt`)
  process.exit(1)
}

// Build-Angaben in die App – der Updater liest sie aus dem ZIP, ohne es zu entpacken.
const infoPath = join(appPath, 'Contents/Resources/app/package.json')
const info = JSON.parse(readFileSync(infoPath, 'utf8'))
writeFileSync(infoPath, JSON.stringify({ ...info, productName, version, build, commit, arch }, null, 2) + '\n')

// Erst nach dem Schreiben signieren, sonst wäre die Signatur ungültig.
run('codesign', ['--force', '--deep', '--sign', IDENTITY, appPath], { stdio: 'inherit' })
run('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' })

// ZIP mit ditto, damit Symlinks und Rechte im Bundle bleiben; --keepParent legt MAID.app/ obenauf.
for (const old of readdirSync(dist).filter((f) => f.startsWith(`${productName}-`) && f.endsWith(`-${arch}.zip`))) rmSync(join(dist, old))
const zip = join(dist, `${productName}-${version}-${build}-${arch}.zip`)
run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', appPath, zip])
console.log(`Gepackt: ${zip} (Build ${build}, ${commit}, ${arch}, signiert mit „${IDENTITY}“)`)
