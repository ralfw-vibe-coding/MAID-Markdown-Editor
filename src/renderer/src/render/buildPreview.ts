import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import type { Definition, Nodes, Root, RootContent } from 'mdast'
import { alignText, type AlignOptions } from './align'
import { parseAltSize } from './imageSize'

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
  /** Bild mit Quelltextbereich (für das Ändern der Anzeigegröße) und optionaler Breite aus `![alt|300](…)`. */
  | { kind: 'image'; src: string; alt: string; title?: string; width?: number; from: number; to: number }

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

  /** Segmente für Teilstücke [a, b) eines bereits zugeordneten Textes. */
  function piece(value: string, map: { starts: number[]; ends: number[] }, a: number, b: number): RNode {
    if (a >= b) return { kind: 'text', text: '' }
    const id = segments.length
    segments.push({ id, text: value.slice(a, b), starts: map.starts.slice(a, b), ends: map.ends.slice(a, b) })
    return { kind: 'seg', id }
  }

  /**
   * Kinder eines Knotens rendern. Zusätzlich zu GFM: `==Hervorhebung==` und
   * die Inline-Tags `<u>…</u>` und `<mark>…</mark>`. Beides wird auf Ebene der
   * Geschwisterknoten gepaart, damit auch `==**fett**==` funktioniert;
   * ungepaarte Zeichen bleiben als Text stehen.
   */
  function children(node: { children: RootContent[] }, tight = false): RNode[] {
    type Open = { tag: 'u' | 'mark'; marker: string; items: RNode[] }
    const out: RNode[] = []
    const stack: Open[] = []
    const push = (n: RNode) => (stack.at(-1)?.items ?? out).push(n)
    const close = () => {
      const top = stack.pop()!
      push(el(top.tag, top.items))
    }

    for (const c of node.children) {
      if (c.type === 'html') {
        const open = /^<(u|mark)>$/i.exec(c.value)
        const end = /^<\/(u|mark)>$/i.exec(c.value)
        if (open) {
          stack.push({ tag: open[1].toLowerCase() as 'u' | 'mark', marker: c.value, items: [] })
          continue
        }
        if (end && stack.at(-1)?.marker.toLowerCase() === `<${end[1].toLowerCase()}>`) {
          close()
          continue
        }
      }
      if (c.type === 'text' && c.value.includes('==')) {
        const from = c.position?.start.offset ?? 0
        const map = alignText(c.value, md.slice(from, c.position?.end.offset ?? 0), from)
        if (map) {
          let last = 0
          for (let i = c.value.indexOf('=='); i >= 0; i = c.value.indexOf('==', last)) {
            push(piece(c.value, map, last, i))
            if (stack.at(-1)?.marker === '==') close()
            else stack.push({ tag: 'mark', marker: '==', items: [] })
            last = i + 2
          }
          push(piece(c.value, map, last, c.value.length))
          continue
        }
      }
      push(render(c, tight))
    }
    // Nicht geschlossene Auszeichnungen: Zeichen wieder als Text, Inhalt unverändert.
    while (stack.length) {
      const top = stack.pop()!
      const target = stack.at(-1)?.items ?? out
      target.push({ kind: 'text', text: top.marker }, ...top.items)
    }
    return out
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
        return { kind: 'image', src: node.url, ...parseAltSize(node.alt ?? ''), title: node.title ?? undefined, from, to }
      case 'imageReference': {
        const def = definitions.get(node.identifier)
        return { kind: 'image', src: def?.url ?? '', ...parseAltSize(node.alt ?? ''), title: def?.title ?? undefined, from, to }
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
