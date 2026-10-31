import { createElement, forwardRef, useRef, useState, type ReactNode } from 'react'
import type { Preview as PreviewModel, RNode, Segment } from './buildPreview'

type ImageOptions = {
  /** Wandelt einen (relativen) Bildpfad in eine ladbare URL um. */
  resolveSrc?: (src: string) => string
  /** Neue Anzeigebreite für das Bild im Quelltextbereich [from, to); `null` = Originalgröße. */
  onImageResize?: (from: number, to: number, width: number | null) => void
}

function toReact(node: RNode, segments: Segment[], key: number, opts: ImageOptions): ReactNode {
  switch (node.kind) {
    case 'text':
      return node.text
    case 'seg':
      return (
        <span key={key} data-seg={node.id} className={node.className}>
          {segments[node.id].text}
        </span>
      )
    case 'image':
      return <ImageView key={key} node={node} {...opts} />
    case 'el': {
      const kids = node.children.map((c, i) => toReact(c, segments, i, opts))
      return createElement(node.tag, { key, ...node.props }, ...(kids.length ? kids : []))
    }
  }
}

/**
 * Bild in der Druckfahne. Ein Griff unten rechts ändert die Anzeigebreite
 * (gespeichert als `|Breite` im Alt-Text); Doppelklick auf den Griff stellt
 * die Originalgröße wieder her.
 */
function ImageView({ node, resolveSrc, onImageResize }: { node: Extract<RNode, { kind: 'image' }> } & ImageOptions) {
  const [live, setLive] = useState<number | null>(null)
  const box = useRef<HTMLSpanElement>(null)
  const start = useRef<{ x: number; width: number } | null>(null)
  const width = live ?? node.width
  return (
    <span ref={box} className="img-box" style={width ? { width } : undefined}>
      <img src={resolveSrc ? resolveSrc(node.src) : node.src} alt={node.alt} title={node.title} draggable={false} />
      {onImageResize && (
        <span
          className="img-handle"
          title="Ziehen ändert die Anzeigegröße – Doppelklick: Originalgröße"
          onPointerDown={(e) => {
            e.preventDefault()
            e.currentTarget.setPointerCapture(e.pointerId)
            start.current = { x: e.clientX, width: box.current!.getBoundingClientRect().width }
          }}
          onPointerMove={(e) => {
            if (start.current) setLive(Math.max(40, start.current.width + e.clientX - start.current.x))
          }}
          onPointerUp={() => {
            if (start.current && live !== null) onImageResize(node.from, node.to, live)
            start.current = null
            setLive(null)
          }}
          onDoubleClick={() => onImageResize(node.from, node.to, null)}
        />
      )}
    </span>
  )
}

type Props = {
  model: PreviewModel
  onMouseUp?: () => void
  className?: string
} & ImageOptions

/** Druckfahne: rendert den Darstellungsbaum; jeder Textabschnitt trägt `data-seg`. */
export const Preview = forwardRef<HTMLDivElement, Props>(function Preview({ model, onMouseUp, className = 'preview', ...images }, ref) {
  return (
    <div
      ref={ref}
      className={className}
      onMouseUp={onMouseUp}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a')) e.preventDefault()
      }}
    >
      {toReact(model.root, model.segments, 0, images)}
    </div>
  )
})
