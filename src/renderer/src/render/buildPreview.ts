import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import type { Definition, Nodes, Root, RootContent } from 'mdast'
import { alignText, type AlignOptions } from './align'

/** Ein sichtbares Textstück der Preview mit zeichengenauer Quellzuordnung. */
export type Segment = {
  id: number
  text: string
  starts: number[]
  ends: number[]
}

/** Darstellungsbaum der Preview, unabhängig von React/DOM und damit testbar. */
export type RNode =
  | { kind: 'el'; tag: string; props?: Record<string, unknown>; children: RNode[] }
  | { kind: 'seg'; id: number; className?: string }
  | { kind: 'text'; text: string }

export type Preview = {
  root: RNode
  segments: Segment[]
  /** Texte, die sich nicht zuordnen ließen; werden ohne Anker-Fähigkeit gerendert. */
  unmapped: string[]
}

const processor = unified().use(remarkParse).use(remarkGfm)

export function parseMarkdown(md: string): Root {
  return processor.parse(md)
}

export function buildPreview(md: string): Preview {
  const tree = parseMarkdown(md)
  const segments: Segment[] = []
  const unmapped: string[] = []
  const definitions = new Map<string, Definition>()
  collectDefinitions(tree, definitions)

  const el = (tag: string, children: RNode[], props?: Record<string, unknown>): RNode => ({ kind: 'el', tag, props, children })

  function segment(value: string, from: number, to: number, opts?: AlignOptions, className?: string): RNode {
    if (value.length === 0) return { kind: 'text', text: '' }
    const map = alignText(value, md.slice(from, to), from, opts)
    if (!map) {
      unmapped.push(value)
      return { kind: 'text', text: value }
    }
    const id = segments.length
    segments.push({ id, text: value, ...map })
    return { kind: 'seg', id, className }
  }

  function children(node: { children: RootContent[] }, tight = false): RNode[] {
    return node.children.map((c) => render(c, tight))
  }

  function render(node: Nodes, tight = false): RNode {
    const pos = node.position
    const from = pos?.start.offset ?? 0
    const to = pos?.end.offset ?? 0
    switch (node.type) {
      case 'root':
        return el('div', children(node))
      case 'paragraph':
        return tight ? el('span', children(node)) : el('p', children(node))
      case 'heading':
        return el(`h${node.depth}`, children(node))
      case 'thematicBreak':
        return el('hr', [])
      case 'blockquote':
        return el('blockquote', children(node))
      case 'list': {
        const items = node.children.map((item) => render(item, !node.spread))
        return node.ordered ? el('ol', items, { start: node.start ?? undefined }) : el('ul', items)
      }
      case 'listItem': {
        const kids = children(node, tight)
        if (node.checked === true || node.checked === false) {
          kids.unshift(el('input', [], { type: 'checkbox', checked: node.checked, readOnly: true, disabled: true }))
          return el('li', kids, { className: 'task' })
        }
        return el('li', kids)
      }
      case 'code': {
        // Inhalt beginnt nach der Zaunzeile; bei eingerückten Blöcken direkt.
        const src = md.slice(from, to)
        const fenced = /^ {0,3}(```|~~~)/.test(src)
        const contentFrom = fenced ? from + src.indexOf('\n') + 1 : from
        const seg = fenced && src.indexOf('\n') < 0 ? { kind: 'text', text: '' } as RNode : segment(node.value, contentFrom, to, { decode: false })
        return el('pre', [el('code', [seg], node.lang ? { 'data-lang': node.lang } : undefined)])
      }
      case 'html':
        return segment(node.value, from, to, { decode: false }, 'raw-html')
      case 'text':
        return segment(node.value, from, to)
      case 'inlineCode': {
        const src = md.slice(from, to)
        const fence = /^`+/.exec(src)![0].length
        let a = from + fence
        let b = to - fence
        const inner = md.slice(a, b)
        if (inner.length > 2 && /^[ \r\n]/.test(inner) && /[ \r\n]$/.test(inner) && /[^ \r\n]/.test(inner)) {
          a += 1
          b -= 1
        }
        return el('code', [segment(node.value, a, b, { decode: false, lineEndingAsSpace: true })])
      }
      case 'emphasis':
        return el('em', children(node))
      case 'strong':
        return el('strong', children(node))
      case 'delete':
        return el('del', children(node))
      case 'break':
        return el('br', [])
      case 'link':
        return el('a', children(node), { href: node.url, title: node.title ?? undefined })
      case 'linkReference': {
        const def = definitions.get(node.identifier)
        return el('a', children(node), { href: def?.url, title: def?.title ?? undefined })
      }
      case 'image':
        return el('img', [], { src: node.url, alt: node.alt ?? '', title: node.title ?? undefined })
      case 'imageReference': {
        const def = definitions.get(node.identifier)
        return el('img', [], { src: def?.url, alt: node.alt ?? '', title: def?.title ?? undefined })
      }
      case 'table': {
        const [head, ...body] = node.children
        const row = (r: (typeof node.children)[number], cell: 'th' | 'td') =>
          el('tr', r.children.map((c, i) => el(cell, children(c), node.align?.[i] ? { style: { textAlign: node.align[i] } } : undefined)))
        return el('table', [el('thead', head ? [row(head, 'th')] : []), el('tbody', body.map((r) => row(r, 'td')))])
      }
      case 'footnoteReference':
        return el('sup', [{ kind: 'text', text: `[${node.label ?? node.identifier}]` }])
      case 'footnoteDefinition':
        return el('div', children(node), { className: 'footnote' })
      case 'definition':
        return { kind: 'text', text: '' }
      default:
        return { kind: 'text', text: '' }
    }
  }

  return { root: render(tree), segments, unmapped }
}

function collectDefinitions(node: Nodes, into: Map<string, Definition>) {
  if (node.type === 'definition') into.set(node.identifier, node)
  if ('children' in node) for (const c of node.children) collectDefinitions(c, into)
}
