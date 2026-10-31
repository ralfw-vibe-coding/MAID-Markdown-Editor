/** Sichtbarer Ausschnitt des Zeitstrahls in Millisekunden. */
export type TimeWindow = { start: number; end: number }

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Kleinster sinnvoller Ausschnitt beim Hineinzoomen. */
export const MIN_SPAN = 5 * MINUTE

/** Ausschnitt, der alle Versionen und „jetzt“ zeigt – mit etwas Rand. */
export function fitWindow(times: number[], now: number): TimeWindow {
  const first = times.length ? Math.min(...times) : now
  const last = Math.max(now, ...times)
  const span = Math.max(last - first, MIN_SPAN)
  const pad = span * 0.05
  return { start: first - pad, end: last + pad }
}

/** Zoomt um `factor` (< 1 hinein, > 1 heraus); der Zeitpunkt bei `anchor` (0…1) bleibt stehen. */
export function zoomWindow(w: TimeWindow, factor: number, anchor: number, maxSpan: number): TimeWindow {
  const span = w.end - w.start
  const next = Math.min(Math.max(span * factor, MIN_SPAN), Math.max(maxSpan, MIN_SPAN))
  const at = w.start + anchor * span
  return { start: at - anchor * next, end: at - anchor * next + next }
}

/** Verschiebt um einen Anteil der Breite (positiv = in die Zukunft). */
export function panWindow(w: TimeWindow, fraction: number): TimeWindow {
  const d = (w.end - w.start) * fraction
  return { start: w.start + d, end: w.end + d }
}

/** Ausschnitt so verschieben, dass `t` sichtbar ist (mittig, falls er herausfällt). */
export function revealTime(w: TimeWindow, t: number): TimeWindow {
  const span = w.end - w.start
  if (t >= w.start + span * 0.05 && t <= w.end - span * 0.05) return w
  return { start: t - span / 2, end: t + span / 2 }
}

export const toFraction = (t: number, w: TimeWindow) => (t - w.start) / (w.end - w.start)

/**
 * Fasst Punkte zusammen, die enger als `minPx` liegen. `px` ist aufsteigend
 * sortiert; geliefert werden Gruppen mit ihren Indizes und ihrer Mitte.
 */
export function clusterPoints(px: number[], minPx: number): { indices: number[]; x: number }[] {
  const groups: { indices: number[]; x: number }[] = []
  for (let i = 0; i < px.length; i++) {
    const g = groups.at(-1)
    if (g && px[i] - px[g.indices.at(-1)!] < minPx) g.indices.push(i)
    else groups.push({ indices: [i], x: 0 })
  }
  for (const g of groups) g.x = (px[g.indices[0]] + px[g.indices.at(-1)!]) / 2
  return groups
}

type TickUnit = { step: number; align: (d: Date) => void; next: (d: Date) => void; label: (d: Date) => string }

const hm = (d: Date) => d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
const dm = (d: Date) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
const hours = (n: number): TickUnit => ({
  step: n * HOUR,
  align: (d) => d.setHours(d.getHours() - (d.getHours() % n), 0, 0, 0),
  next: (d) => d.setHours(d.getHours() + n),
  label: (d) => (d.getHours() === 0 ? dm(d) : hm(d)),
})
const days = (n: number): TickUnit => ({
  step: n * DAY,
  align: (d) => d.setHours(0, 0, 0, 0),
  next: (d) => d.setDate(d.getDate() + n),
  label: dm,
})
const UNITS: TickUnit[] = [
  hours(1),
  hours(3),
  hours(6),
  hours(12),
  days(1),
  days(2),
  {
    step: 7 * DAY,
    align: (d) => {
      d.setHours(0, 0, 0, 0)
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // Montag
    },
    next: (d) => d.setDate(d.getDate() + 7),
    label: dm,
  },
  {
    step: 30 * DAY,
    align: (d) => {
      d.setHours(0, 0, 0, 0)
      d.setDate(1)
    },
    next: (d) => d.setMonth(d.getMonth() + 1),
    label: (d) => d.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' }),
  },
  {
    step: 365 * DAY,
    align: (d) => {
      d.setHours(0, 0, 0, 0)
      d.setMonth(0, 1)
    },
    next: (d) => d.setFullYear(d.getFullYear() + 1),
    label: (d) => String(d.getFullYear()),
  },
]

/**
 * Achsenbeschriftung, passend zum Zoom: so feine Schritte (Stunden, Tage,
 * Wochen, Monate, Jahre), dass zwischen zwei Marken mindestens `minPx` liegen.
 */
export function axisTicks(w: TimeWindow, widthPx: number, minPx = 52): { t: number; label: string }[] {
  const pxPerMs = widthPx / (w.end - w.start)
  const unit = UNITS.find((u) => u.step * pxPerMs >= minPx) ?? UNITS.at(-1)!
  const d = new Date(w.start)
  unit.align(d)
  const ticks: { t: number; label: string }[] = []
  for (let guard = 0; d.getTime() <= w.end && guard < 500; guard++) {
    if (d.getTime() >= w.start) ticks.push({ t: d.getTime(), label: unit.label(new Date(d)) })
    unit.next(d)
  }
  return ticks
}

/** Kurze, lesbare Zeitangabe für Tooltip und Liste. */
export function formatWhen(iso: string, now = new Date()): string {
  const d = new Date(iso)
  const sameDay = d.toDateString() === now.toDateString()
  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  return sameDay ? `heute ${time}` : `${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })} ${time}`
}
