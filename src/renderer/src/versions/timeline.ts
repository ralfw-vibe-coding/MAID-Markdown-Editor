/** Rechter Rand bleibt für die Marke „jetzt“ frei. */
const END = 0.92

/**
 * Positionen (0…1) der Versionen auf dem Zeitstrahl, zeitlich maßstäblich
 * zwischen der ersten Version und jetzt. Kurz hintereinander gesicherte
 * Versionen werden auf einen Mindestabstand gezogen, damit jede anklickbar
 * bleibt; „jetzt“ steht bei 1.
 */
export function timelinePositions(times: number[], now: number, minGap = 0.04): number[] {
  if (times.length === 0) return []
  const t0 = times[0]
  const span = Math.max(now, times.at(-1)!) - t0
  const raw = times.map((t, i) => (span > 0 ? ((t - t0) / span) * END : (i / Math.max(1, times.length)) * END))
  const pos: number[] = []
  for (const p of raw) pos.push(pos.length ? Math.max(p, pos.at(-1)! + minGap) : p)
  const last = pos.at(-1)!
  return last > END ? pos.map((p) => (p / last) * END) : pos
}

/** Kurze, lesbare Zeitangabe für Achsenbeschriftung und Tooltip. */
export function formatWhen(iso: string, now = new Date()): string {
  const d = new Date(iso)
  const sameDay = d.toDateString() === now.toDateString()
  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  return sameDay ? `heute ${time}` : `${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })} ${time}`
}
