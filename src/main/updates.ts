import { app } from 'electron'
import { execFile, spawn } from 'node:child_process'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { UpdateState } from '../shared/host'
import { createUpdater, type RunningBuild, type Updater, type UpdateTools } from './updater'

/** Wie oft der Update-Ordner nebenbei geprüft wird. */
const CHECK_EVERY_MS = 30 * 60 * 1000

const tools: UpdateTools = {
  list: (folder) => readdir(folder),
  run: (command, args) =>
    new Promise((resolve) => {
      execFile(command, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (!err) resolve({ ok: true, stdout })
        else resolve({ ok: false, error: stderr.trim() || err.message })
      })
    }),
  read: (path) => readFile(path, 'utf8'),
  write: async (path, text) => {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, text, 'utf8')
  },
  remove: (path) => rm(path, { recursive: true, force: true }),
  detach: (command, args) => spawn(command, args, { detached: true, stdio: 'ignore' }).unref(),
  quit: () => app.quit(),
  now: () => new Date(),
}

/** Build-Angaben, die das Packskript in die App geschrieben hat; MAID aus dem Repo hat keine. */
async function runningBuild(): Promise<RunningBuild | null> {
  if (!app.isPackaged) return null
  try {
    const pkg = JSON.parse(await readFile(join(app.getAppPath(), 'package.json'), 'utf8')) as { build?: unknown }
    const build = Number(pkg.build)
    return Number.isInteger(build) && build > 0 ? { build, arch: process.arch } : null
  } catch {
    return null
  }
}

/**
 * Startet den Updater: liest den Ordner aus userData/update.json (je Mac),
 * prüft beim Start und dann regelmäßig. Erst nach `app.setName`, denn
 * userData hängt vom Namen ab.
 */
export async function startUpdates(onChange: (state: UpdateState) => void): Promise<Updater> {
  const updater = await createUpdater({
    tools,
    running: await runningBuild(),
    exe: app.getPath('exe'),
    pid: process.pid,
    configFile: join(app.getPath('userData'), 'update.json'),
    onChange,
  })
  if (updater.state().state !== 'unavailable') {
    void updater.check()
    setInterval(() => void updater.check(), CHECK_EVERY_MS).unref()
  }
  return updater
}
