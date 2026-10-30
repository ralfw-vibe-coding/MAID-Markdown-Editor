import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AiRequest, AiResult } from '../shared/host'

const TIMEOUT_MS = 180_000

/**
 * Aus dem Finder gestartete Apps erben nicht den PATH der Shell; deshalb die
 * üblichen Installationsorte der Claude CLI ausdrücklich prüfen.
 */
function claudeBinary(): string {
  const candidates = [
    process.env['MAID_CLAUDE'],
    join(homedir(), '.local/bin/claude'),
    join(homedir(), '.claude/local/claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
  ]
  return candidates.find((c): c is string => !!c && existsSync(c)) ?? 'claude'
}

/**
 * Ein einzelner, zustandsloser Aufruf der Claude CLI: keine Werkzeuge, keine
 * MCP-Server, keine gespeicherte Sitzung. Die KI kann also nichts lesen oder
 * schreiben außer dem, was im Prompt steht – Änderungen führt MAID selbst aus.
 */
export function askClaude(req: AiRequest): Promise<AiResult> {
  const args = [
    '-p',
    '--output-format', 'json',
    '--json-schema', JSON.stringify(req.schema),
    '--system-prompt', req.systemPrompt,
    '--tools', '',
    '--strict-mcp-config',
    '--disable-slash-commands',
    '--no-session-persistence',
    '--setting-sources', 'user',
  ]
  return new Promise((resolve) => {
    const child = spawn(claudeBinary(), args, { cwd: tmpdir(), env: process.env })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      resolve({ ok: false, error: 'Die KI hat nicht rechtzeitig geantwortet.' })
    }, TIMEOUT_MS)

    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ ok: false, error: `Claude CLI konnte nicht gestartet werden (${err.message}).` })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      try {
        const out = JSON.parse(stdout)
        if (out.is_error || out.subtype !== 'success') {
          resolve({ ok: false, error: String(out.result || out.subtype || 'Fehler der KI') })
        } else if (out.structured_output === undefined) {
          resolve({ ok: false, error: 'Die KI hat keine strukturierte Antwort geliefert.' })
        } else {
          resolve({ ok: true, data: out.structured_output })
        }
      } catch {
        resolve({ ok: false, error: (stderr || stdout).trim().slice(0, 500) || `Claude CLI beendet mit Code ${code}` })
      }
    })

    child.stdin.end(req.prompt)
  })
}
