import { createElement, forwardRef, type ReactNode } from 'react'
import type { Preview as PreviewModel, RNode, Segment } from './buildPreview'

function toReact(node: RNode, segments: Segment[], key: number): ReactNode {
  switch (node.kind) {
    case 'text':
      return node.text
    case 'seg':
      return (
        <span key={key} data-seg={node.id} className={node.className}>
          {segments[node.id].text}
        </span>
      )
    case 'el': {
      const kids = node.children.map((c, i) => toReact(c, segments, i))
      return createElement(node.tag, { key, ...node.props }, ...(kids.length ? kids : []))
    }
  }
}

type Props = {
  model: PreviewModel
  onMouseUp?: () => void
  className?: string
}

/** Druckfahne: rendert den Darstellungsbaum; jeder Textabschnitt trägt `data-seg`. */
export const Preview = forwardRef<HTMLDivElement, Props>(function Preview({ model, onMouseUp, className = 'preview' }, ref) {
  return (
    <div
      ref={ref}
      className={className}
      onMouseUp={onMouseUp}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a')) e.preventDefault()
      }}
    >
      {toReact(model.root, model.segments, 0)}
    </div>
  )
})
