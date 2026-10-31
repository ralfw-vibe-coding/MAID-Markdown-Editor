import { useEffect, useRef, type RefObject } from 'react'
import type { EditorView } from '@codemirror/view'
import type { Segment } from '../render/buildPreview'
import { collectPairs, editorY, interpolate, type HeightPair } from './scrollSync'

/** So lange nach einem programmatischen Scrollen die Gegenrichtung ignorieren. */
const LOCK_MS = 150

type Options = {
  viewRef: RefObject<EditorView | null>
  previewRef: RefObject<HTMLElement | null>
  segments: Segment[]
  enabled: boolean
}

/**
 * Mitlaufendes Scrollen zwischen Manuskript und Druckfahne in beide
 * Richtungen, über Stützstellen aus der zeichengenauen Zuordnung. Liefert
 * außerdem `jumpTo` für den Klick in der Druckfahne.
 */
export function useScrollSync({ viewRef, previewRef, segments, enabled }: Options) {
  const pairs = useRef<HeightPair[] | null>(null)
  const lockedUntil = useRef({ editor: 0, preview: 0 })

  // Stützstellen neu berechnen, sobald sich Inhalt oder Maße ändern.
  useEffect(() => {
    pairs.current = null
  }, [segments])

  const scrollers = () => {
    const view = viewRef.current
    const preview = previewRef.current
    const pane = preview?.parentElement
    return view && preview && pane ? { view, preview, editor: view.scrollDOM, pane } : null
  }
  const getPairs = (s: NonNullable<ReturnType<typeof scrollers>>) =>
    (pairs.current ??= collectPairs(s.view, s.preview, s.pane, segments))
  /** Höhe des klebenden Spaltentitels, der oben über dem Inhalt der Druckfahne liegt. */
  const headerHeight = (pane: HTMLElement) => (pane.querySelector(':scope > h2') as HTMLElement | null)?.offsetHeight ?? 0

  const setScroll = (target: 'editor' | 'preview', el: HTMLElement, top: number) => {
    lockedUntil.current[target] = Date.now() + LOCK_MS
    el.scrollTop = Math.max(0, top)
  }
  const atBottom = (el: HTMLElement) => el.scrollTop + el.clientHeight >= el.scrollHeight - 2

  useEffect(() => {
    const s = scrollers()
    if (!enabled || !s) return

    const fromEditor = () => {
      if (Date.now() < lockedUntil.current.editor) return
      const target = atBottom(s.editor)
        ? s.pane.scrollHeight
        : interpolate(getPairs(s), s.editor.scrollTop, 'ey', 'py') - headerHeight(s.pane)
      setScroll('preview', s.pane, target)
    }
    const editorTarget = () =>
      atBottom(s.pane) ? s.editor.scrollHeight : interpolate(getPairs(s), s.pane.scrollTop + headerHeight(s.pane), 'py', 'ey')
    // CodeMirror kennt Zeilenhöhen außerhalb des sichtbaren Bereichs nur geschätzt und misst
    // erst nach dem Scrollen. Deshalb danach mit frischen Stützstellen nachkorrigieren.
    let refine: ReturnType<typeof setTimeout> | undefined
    const fromPreview = () => {
      if (Date.now() < lockedUntil.current.preview) return
      setScroll('editor', s.editor, editorTarget())
      clearTimeout(refine)
      let rounds = 0
      const correct = () => {
        pairs.current = null
        const target = editorTarget()
        if (Math.abs(target - s.editor.scrollTop) > 3 && rounds++ < 3) {
          setScroll('editor', s.editor, target)
          refine = setTimeout(correct, 60)
        }
      }
      refine = setTimeout(correct, 60)
    }
    const invalidate = () => {
      pairs.current = null
    }

    s.editor.addEventListener('scroll', fromEditor, { passive: true })
    s.pane.addEventListener('scroll', fromPreview, { passive: true })
    // Bilder ändern beim Laden die Höhe der Druckfahne; Größenänderungen ebenso.
    s.preview.addEventListener('load', invalidate, true)
    const resize = new ResizeObserver(invalidate)
    resize.observe(s.preview)
    resize.observe(s.view.contentDOM)
    // Beim Einschalten gleich angleichen.
    fromEditor()
    return () => {
      clearTimeout(refine)
      s.editor.removeEventListener('scroll', fromEditor)
      s.pane.removeEventListener('scroll', fromPreview)
      s.preview.removeEventListener('load', invalidate, true)
      resize.disconnect()
    }
  }, [enabled, segments])

  /**
   * Setzt den Cursor im Manuskript auf `pos` und scrollt so, dass die Zeile auf
   * Höhe des Klicks steht – die Druckfahne bleibt dabei ruhig.
   */
  function jumpTo(pos: number, clientY: number) {
    const s = scrollers()
    if (!s) return
    s.view.dispatch({ selection: { anchor: pos } })
    const lineHeight = s.view.lineBlockAt(pos).height
    const offset = clientY - s.editor.getBoundingClientRect().top - lineHeight / 2
    setScroll('editor', s.editor, editorY(s.view, pos) - offset)
    s.view.focus()
  }

  return { jumpTo }
}
