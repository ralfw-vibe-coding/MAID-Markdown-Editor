// @vitest-environment node
import { spawn } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { asUpdateState, type UpdateState } from '../shared/host'
import { bundleOf, createUpdater, newestOffer, offerOf, requirementOf, SWAP_SCRIPT, type UpdateTools } from './updater'

describe('Reine Funktionen', () => {
  it('bundleOf: drei Ebenen über der ausführbaren Datei', () => {
    expect(bundleOf('/Applications/MAID.app/Contents/MacOS/MAID')).toBe('/Applications/MAID.app')
    expect(bundleOf('/Users/x/Apps/MAID.app/Contents/MacOS/MAID')).toBe('/Users/x/Apps/MAID.app')
    expect(bundleOf('/usr/local/bin/node')).toBeNull()
  })

  it('offerOf: Build, Version, Commit; anderer Chip passt nicht, fehlender schon', () => {
    const pkg = (o: object) => JSON.stringify({ productName: 'MAID', version: '0.0.1', main: 'out/main/index.js', ...o })
    expect(offerOf('a.zip', pkg({ build: '142', commit: 'abc1234', arch: 'arm64' }), 'arm64')).toEqual({ version: '0.0.1', build: 142, commit: 'abc1234', file: 'a.zip' })
    expect(offerOf('a.zip', pkg({ build: 142, arch: 'x64' }), 'arm64')).toBeNull()
    expect(offerOf('a.zip', pkg({ build: 142 }), 'arm64')).toEqual({ version: '0.0.1', build: 142, file: 'a.zip' })
    expect(offerOf('a.zip', pkg({}), 'arm64')).toBeNull()
    expect(offerOf('a.zip', 'kein JSON', 'arm64')).toBeNull()
  })

  it('newestOffer: höchster Build über dem laufenden', () => {
    const o = (build: number) => ({ version: '', build, file: `${build}.zip` })
    expect(newestOffer([o(140), o(143), o(142)], 141)?.build).toBe(143)
    expect(newestOffer([o(140), o(141)], 141)).toBeNull()
  })

  it('requirementOf: die designated-Zeile', () => {
    const out = '# designated => identifier "local.maid" and certificate root = H"abc"\ndesignated => identifier "local.maid" and certificate root = H"abc"\n'
    expect(requirementOf(out)).toBe('identifier "local.maid" and certificate root = H"abc"')
    expect(requirementOf('Executable=/x\n')).toBeNull()
  })

  it('asUpdateState: Unerwartetes zählt als „unavailable“', () => {
    expect(asUpdateState(undefined)).toEqual({ state: 'unavailable' })
    expect(asUpdateState({ state: 'available', build: 1, folder: '/f', checked: 'x', offer: { build: '2' } })).toEqual({ state: 'unavailable' })
    const ok: UpdateState = { state: 'available', build: 1, folder: '/f', checked: 'x', offer: { version: '0.0.1', build: 2, file: 'a.zip' } }
    expect(asUpdateState(ok)).toEqual(ok)
  })
})

/** Attrappe: ein Update-Ordner mit ZIPs (Inhalt = package.json darin) und ein Protokoll aller Aufrufe. */
function fakeTools(zips: Record<string, object | null>, overrides: Partial<Record<string, { ok: false; error: string }>> = {}) {
  const calls: string[] = []
  const files = new Map<string, string>()
  let detached: string[] | null = null
  let quit = false
  const tools: UpdateTools = {
    list: async (folder) => {
      if (folder === '/kaputt') throw new Error('EACCES')
      return [...Object.keys(zips), 'notiz.txt']
    },
    run: async (command, args) => {
      calls.push([command, ...args].join(' '))
      const key = Object.keys(overrides).find((k) => calls.at(-1)!.startsWith(k))
      if (key) return overrides[key]!
      if (command === 'unzip') {
        const zip = Object.keys(zips).find((z) => args[1].endsWith('/' + z))
        const pkg = zip && zips[zip]
        return pkg ? { ok: true, stdout: JSON.stringify(pkg) } : { ok: false, error: 'caution: filename not matched' }
      }
      if (command === 'ditto') {
        const zip = Object.keys(zips).find((z) => args[2].endsWith('/' + z))!
        files.set(`${args[3]}/MAID.app/Contents/Resources/app/package.json`, JSON.stringify(zips[zip]))
      }
      if (command === 'codesign' && args[0] === '-d') return { ok: true, stdout: 'designated => identifier "local.maid" and certificate root = H"abc"\n' }
      return { ok: true, stdout: '' }
    },
    read: async (path) => {
      const f = files.get(path)
      if (f === undefined) throw new Error('ENOENT')
      return f
    },
    write: async (path, text) => void files.set(path, text),
    remove: async (path) => void calls.push(`remove ${path}`),
    detach: (command, args) => void (detached = [command, ...args]),
    quit: () => void (quit = true),
    now: () => new Date('2026-11-12T10:00:00Z'),
  }
  return { tools, calls, files, detached: () => detached, quit: () => quit }
}

const setup = async (fake: ReturnType<typeof fakeTools>, folder = '/Dropbox/MAID') => {
  fake.files.set('/ud/update.json', JSON.stringify({ folder }))
  const states: UpdateState[] = []
  const updater = await createUpdater({
    tools: fake.tools,
    running: { build: 141, arch: 'arm64' },
    exe: '/Applications/MAID.app/Contents/MacOS/MAID',
    pid: 4711,
    configFile: '/ud/update.json',
    onChange: (s) => states.push(s),
  })
  return { updater, states }
}

describe('Prüfen', () => {
  it('bietet den höchsten neueren Build für denselben Chip an; fremde ZIPs werden übergangen', async () => {
    const fake = fakeTools({
      'MAID-140.zip': { version: '0.0.1', build: 140, arch: 'arm64' },
      'MAID-143-x64.zip': { version: '0.0.1', build: 143, arch: 'x64' },
      'MAID-142.zip': { version: '0.0.1', build: 142, commit: 'abc', arch: 'arm64' },
      'Fotos.zip': null,
    })
    const { updater } = await setup(fake)
    expect(await updater.check()).toEqual({
      state: 'available',
      build: 141,
      folder: '/Dropbox/MAID',
      checked: '2026-11-12T10:00:00.000Z',
      offer: { version: '0.0.1', build: 142, commit: 'abc', file: 'MAID-142.zip' },
    })
    expect(fake.calls).toContain('unzip -p /Dropbox/MAID/MAID-142.zip MAID.app/Contents/Resources/app/package.json')
    expect(fake.calls.some((c) => c.includes('notiz.txt'))).toBe(false)
  })

  it('nichts Neueres → aktuell; kein Ordner → aus; Ordner nicht lesbar → Fehler mit Schritt', async () => {
    const fake = fakeTools({ 'MAID-141.zip': { build: 141 } })
    const { updater } = await setup(fake)
    expect((await updater.check()).state).toBe('current')
    expect(await updater.setFolder(null)).toEqual({ state: 'off', build: 141 })
    expect(JSON.parse(fake.files.get('/ud/update.json')!)).toEqual({})
    const broken = await updater.setFolder('/kaputt')
    expect(broken.state === 'failed' && broken.message).toBe('Ordner nicht lesbar: EACCES')
  })

  it('MAID aus dem Repo (ohne Build) aktualisiert sich nicht', async () => {
    const fake = fakeTools({ 'MAID-142.zip': { build: 142 } })
    const updater = await createUpdater({ tools: fake.tools, running: null, exe: '/x', pid: 1, configFile: '/ud/update.json', onChange: () => {} })
    expect(await updater.check()).toEqual({ state: 'unavailable' })
    expect(await updater.setFolder('/Dropbox/MAID')).toEqual({ state: 'unavailable' })
  })
})

describe('Installieren', () => {
  const zips = { 'MAID-142.zip': { version: '0.0.1', build: 142, arch: 'arm64' } }

  it('entpackt neben die App, prüft die Signatur, startet den Tausch und beendet MAID', async () => {
    const fake = fakeTools(zips)
    const { updater, states } = await setup(fake)
    await updater.check()
    await updater.install()
    const staged = '/Applications/.MAID Update'
    expect(fake.calls).toEqual(
      expect.arrayContaining([
        `ditto -x -k /Dropbox/MAID/MAID-142.zip ${staged}`,
        `codesign --verify --deep --strict ${staged}/MAID.app`,
        'codesign -d -r- /Applications/MAID.app',
        `codesign --verify -R =identifier "local.maid" and certificate root = H"abc" ${staged}/MAID.app`,
        `xattr -dr com.apple.quarantine ${staged}/MAID.app`,
      ]),
    )
    expect(fake.detached()).toEqual(['/bin/sh', '-c', SWAP_SCRIPT, 'maid-update', '4711', '/Applications/MAID.app', `${staged}/MAID.app`, `${staged}/previous.app`, staged])
    expect(fake.quit()).toBe(true)
    expect(states.at(-1)?.state).toBe('installing')
  })

  it('anders signiert → nicht tauschen, Staging aufräumen, Grund nennen', async () => {
    const fake = fakeTools(zips, { 'codesign --verify -R': { ok: false, error: 'code failed to satisfy specified code requirement(s)' } })
    const { updater } = await setup(fake)
    await updater.check()
    const s = await updater.install()
    expect(s.state === 'failed' && s.message).toBe('Die neue App ist anders signiert als die installierte: code failed to satisfy specified code requirement(s)')
    expect(fake.calls.at(-1)).toBe('remove /Applications/.MAID Update')
    expect(fake.detached()).toBeNull()
    expect(fake.quit()).toBe(false)
  })

  it('kein Schreibrecht neben der App, ungültige Signatur: Schritt in der Meldung', async () => {
    for (const [key, message] of [
      ['ditto', 'Kein Platz für das Update neben der App: Permission denied'],
      ['codesign --verify --deep', 'Signatur der neuen App ungültig: Permission denied'],
    ]) {
      const fake = fakeTools(zips, { [key]: { ok: false, error: 'Permission denied' } })
      const { updater } = await setup(fake)
      await updater.check()
      const s = await updater.install()
      expect(s.state === 'failed' && s.message).toBe(message)
      expect(fake.quit()).toBe(false)
    }
  })

  it('ZIP enthält doch keinen neueren Build → abbrechen', async () => {
    const fake = fakeTools(zips)
    const { updater } = await setup(fake)
    await updater.check()
    // Zwischen Prüfen und Installieren wurde das ZIP durch einen alten Build ersetzt.
    zips['MAID-142.zip'].build = 140
    const s = await updater.install()
    zips['MAID-142.zip'].build = 142
    expect(s.state === 'failed' && s.message).toBe('MAID-142.zip enthält keine neuere MAID.app')
  })
})

describe('Tausch-Skript (echt)', () => {
  /** Zwei Attrappen-Bundles, `sleep 1` als PID, ein eigenes `open`, das nur protokolliert. */
  async function runSwap(withNew: boolean) {
    const dir = mkdtempSync(join(tmpdir(), 'maid-swap-'))
    const bin = join(dir, 'bin')
    mkdirSync(bin)
    writeFileSync(join(bin, 'open'), `#!/bin/sh\necho "$@" >> "${join(dir, 'open.log')}"\n`)
    chmodSync(join(bin, 'open'), 0o755)
    const installed = join(dir, 'Alt.app')
    const staged = join(dir, '.Update')
    const fresh = join(staged, 'Neu.app')
    mkdirSync(installed)
    writeFileSync(join(installed, 'version'), 'alt')
    mkdirSync(staged)
    if (withNew) {
      mkdirSync(fresh)
      writeFileSync(join(fresh, 'version'), 'neu')
    }
    const sleeper = spawn('sleep', ['1'])
    const started = Date.now()
    await new Promise<void>((resolve, reject) => {
      const sh = spawn('/bin/sh', ['-c', SWAP_SCRIPT, 'maid-update', String(sleeper.pid), installed, fresh, join(staged, 'previous.app'), staged], {
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
        stdio: 'ignore',
      })
      sh.on('exit', () => resolve())
      sh.on('error', reject)
    })
    return { waited: Date.now() - started, version: readFileSync(join(installed, 'version'), 'utf8'), staged: existsSync(staged), opened: readFileSync(join(dir, 'open.log'), 'utf8').trim(), installed }
  }

  it('wartet, tauscht, räumt auf und öffnet', async () => {
    const r = await runSwap(true)
    expect(r.waited).toBeGreaterThanOrEqual(900)
    expect(r.version).toBe('neu')
    expect(r.staged).toBe(false)
    expect(r.opened).toBe(r.installed)
  })

  it('ohne neue App kommt die alte zurück', async () => {
    const r = await runSwap(false)
    expect(r.version).toBe('alt')
    expect(r.staged).toBe(false)
    expect(r.opened).toBe(r.installed)
  })
})
