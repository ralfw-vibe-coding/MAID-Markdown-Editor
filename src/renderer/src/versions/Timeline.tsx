import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Maximize2, Minus, Plus } from 'lucide-react'
import { axisTicks, clusterPoints, fitWindow, formatWhen, panWindow, revealTime, toFraction, zoomWindow, type TimeWindow } from './timeWindow'
import type { Version } from './versions'

/** Punkte, die enger liegen, werden zu einem Bündel. */
const CLUSTER_PX = 14
/** Innenrand links und rechts, damit Punkte und Beschriftungen an den Enden nicht abgeschnitten werden. */
const PAD = 14

type Props = {
  versions: Version[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}

/**
 * Zeitstrahl der Versionen bis „jetzt“. Scrollen bzw. Pinch zoomt (um die
 * Mausposition), seitliches Scrollen oder Ziehen verschiebt. Zu eng liegende
 * Versionen erscheinen als Bündel; ein Klick darauf zoomt hinein.
 */
export function Timeline({ versions, selectedId, onSelect }: Props) {
  const track = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const times = useMemo(() => versions.map((v) => Date.parse(v.createdAt)), [versions])
  const [win, setWin] = useState<TimeWindow>(() => fitWindow(times, now))
  const maxSpan = Math.max((now - (times[0] ?? now)) * 3, 7 * 24 * 3_600_000)

  // „jetzt“ läuft mit; neue Versionen kommen in den Ausschnitt.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])
  useEffect(() => {
    setNow(Date.now())
    setWin((w) => revealTime(w, Date.now()))
  }, [versions.length])
  // Andere Versionsliste (Dokument geöffnet, Versionen geladen): alles zeigen.
  useEffect(() => {
    setWin(fitWindow(times, Date.now()))
  }, [versions[0]?.id])

  // Gewählte Version (z. B. aus der Liste) in den Ausschnitt holen.
  useEffect(() => {
    const t = times[versions.findIndex((v) => v.id === selectedId)]
    if (t !== undefined) setWin((w) => revealTime(w, t))
  }, [selectedId])

  useLayoutEffect(() => {
    const el = track.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  // Rad und Pinch: nicht-passiv, damit die Spalte nicht mitscrollt.
  useEffect(() => {
    const el = track.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const inner = Math.max(1, rect.width - 2 * PAD)
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && !e.ctrlKey) {
        setWin((w) => panWindow(w, e.deltaX / inner))
      } else {
        const anchor = (e.clientX - rect.left - PAD) / inner
        setWin((w) => zoomWindow(w, Math.exp(e.deltaY * (e.ctrlKey ? 0.02 : 0.004)), anchor, maxSpan))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [maxSpan])

  // Ziehen verschiebt.
  const drag = useRef<{ x: number; win: TimeWindow; moved: boolean } | null>(null)

  // Zeit → x innerhalb des Innenbereichs [PAD, width − PAD]
  const inner = Math.max(1, width - 2 * PAD)
  const x = (t: number) => PAD + toFraction(t, win) * inner
  const px = times.map(x)
  const inView = (v: number) => v >= PAD / 2 && v <= width - PAD / 2
  const groups = clusterPoints(px, CLUSTER_PX).filter((g) => inView(g.x))
  const nowX = x(now)
  const selectedIndex = versions.findIndex((v) => v.id === selectedId)
  const ticks = width ? axisTicks(win, inner) : []

  const zoomTo = (indices: number[]) => {
    const ts = indices.map((i) => times[i])
    const span = Math.max(...ts) - Math.min(...ts)
    setWin(fitWindow([Math.min(...ts), Math.max(...ts)], Math.max(...ts) + span * 0.1))
  }

  return (
    <div className="timeline" aria-label="Zeitstrahl der Versionen">
      <div
        className="timeline-track"
        ref={track}
        onPointerDown={(e) => {
          if (e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains('timeline-axis')) return
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { x: e.clientX, win, moved: false }
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d || !width) return
          if (Math.abs(e.clientX - d.x) > 2) d.moved = true
          setWin(panWindow(d.win, -(e.clientX - d.x) / inner))
        }}
        onPointerUp={() => {
          drag.current = null
        }}
      >
        <div className="timeline-axis" />
        {ticks.map((t) => (
          <div key={t.t} className="timeline-tick" style={{ left: x(t.t) }} />
        ))}
        {selectedIndex >= 0 && (
          <div className="timeline-span" style={{ left: Math.max(PAD, px[selectedIndex]), width: Math.max(0, Math.min(width - PAD, nowX) - Math.max(PAD, px[selectedIndex])) }} />
        )}
        {groups.map((g) => {
          if (g.indices.length === 1) {
            const v = versions[g.indices[0]]
            return (
              <button
                key={v.id}
                className={`timeline-dot ${v.id === selectedId ? 'selected' : ''} ${v.auto ? 'auto' : ''}`}
                style={{ left: g.x }}
                title={`${v.message || '(ohne Nachricht)'} – ${formatWhen(v.createdAt)}`}
                aria-label={v.message}
                onClick={() => onSelect(v.id === selectedId ? null : v.id)}
              />
            )
          }
          const containsSelected = g.indices.includes(selectedIndex)
          return (
            <button
              key={`g${g.indices[0]}`}
              className={`timeline-cluster ${containsSelected ? 'selected' : ''}`}
              style={{ left: g.x }}
              title={`${g.indices.length} Versionen ${formatWhen(versions[g.indices[0]].createdAt)} – ${formatWhen(versions[g.indices.at(-1)!].createdAt)}: klicken zum Hineinzoomen`}
              onClick={() => zoomTo(g.indices)}
            >
              {g.indices.length}
            </button>
          )
        })}
        {inView(nowX) && (
          <button
            className={`timeline-now ${selectedId === null ? 'selected' : ''}`}
            style={{ left: nowX }}
            title="Jetzt – ungesicherte Änderungen seit der neuesten Version"
            aria-label="Jetzt"
            onClick={() => onSelect(null)}
          />
        )}
      </div>
      <div className="timeline-ticks muted">
        {ticks.map((t) => {
          // Beschriftungen an den Enden nicht mittig, sondern bündig, damit sie nicht abgeschnitten werden.
          const at = x(t.t)
          const align = at < 30 ? 'start' : at > width - 30 ? 'end' : ''
          return (
            <span key={t.t} className={align} style={{ left: at }}>
              {t.label}
            </span>
          )
        })}
      </div>
      <div className="timeline-controls">
        <button className="icon" title="Herauszoomen" aria-label="Herauszoomen" onClick={() => setWin((w) => zoomWindow(w, 2, 0.5, maxSpan))}>
          <Minus size={13} />
        </button>
        <button className="icon" title="Hineinzoomen" aria-label="Hineinzoomen" onClick={() => setWin((w) => zoomWindow(w, 0.5, 0.5, maxSpan))}>
          <Plus size={13} />
        </button>
        <button className="icon" title="Alles zeigen" aria-label="Alles zeigen" onClick={() => setWin(fitWindow(times, Date.now()))}>
          <Maximize2 size={12} />
        </button>
      </div>
    </div>
  )
}
