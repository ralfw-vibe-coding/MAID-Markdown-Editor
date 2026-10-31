import { app } from 'electron'
import { readFileSync } from 'node:fs'
import { rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DEFAULT_SETTINGS, type Settings } from '../shared/host'

const file = () => join(app.getPath('userData'), 'settings.json')

let current: Settings | null = null

export function getSettings(): Settings {
  if (!current) {
    try {
      current = { ...DEFAULT_SETTINGS, ...JSON.parse(readFileSync(file(), 'utf8')) }
    } catch {
      current = { ...DEFAULT_SETTINGS }
    }
  }
  return current!
}

export async function updateSettings(changes: Partial<Settings>): Promise<Settings> {
  const known = Object.fromEntries(Object.entries(changes).filter(([key]) => key in DEFAULT_SETTINGS))
  current = { ...getSettings(), ...known }
  const tmp = file() + '.tmp'
  await writeFile(tmp, JSON.stringify(current, null, 2) + '\n', 'utf8')
  await rename(tmp, file())
  return current
}
