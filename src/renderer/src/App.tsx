import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { basicSetup } from 'codemirror'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { markdown } from '@codemirror/lang-markdown'
import { IMAGE_EXTENSIONS, LOCAL_FILE_SCHEME, type MaidHost } from '../../shared/host'
import { imageExtension, imageMarkdown, setImageWidth } from './render/imageSize'
import { buildPreview } from './render/buildPreview'
import { Preview } from './render/Preview'
import { domRangeToSource, sourceToDomRange, type SourceRange } from './anchor/selection'
import {
  addAnchor,
  anchorField,
  anchorHistory,
  createAnchor,
  isPlaced,
  placeAnchor,
  removeAnchor,
  setAnchors as setAnchorsEffect,
  type Anchor,
} from './anchor/anchors'
import { sampleDoc } from './sampleDoc'
import { markdownKeymap } from './editor/markdownKeymap'
import { useDocumentFile } from './doc/useDocumentFile'
import { formatCommands, type FormatCommand } from './editor/format'
import { FormatToolbar } from './editor/FormatToolbar'
import { useSettings } from './settings/useSettings'
import { SettingsDialog } from './settings/SettingsDialog'
import { ChatPanel } from './chat/ChatPanel'
import { createChat, renameChat, suggestTitle, updateChat, type Chat } from './chat/chats'
import { buildChatPrompt, CHAT_SCHEMA, CHAT_SYSTEM_PROMPT, parseChatAnswer, type EditorFocus } from './chat/chat'
import { MessageSquareText, MessagesSquare } from 'lucide-react'
import {
  COLLAPSED_WIDTH,
  CollapseButton,
  CollapsedStrip,
  gridColumns,
  cannotCollapse,
  clampSide,
  loadSideWidth,
  saveSideWidth,
  SIDE_DEFAULT,
  visibleSplitters,
  loadCollapsed,
  saveCollapsed,
  toggleCollapsed,
  type PaneId,
} from './layout/panes'
import { appendMessage, createThread, message, syncEditStates, syncLastEdit, updateThread, type Message, type Thread } from './thread/thread'
import { ThreadPanel } from './thread/ThreadPanel'
import { buildPrompt, parseAnswer, RESPONSE_SCHEMA, SYSTEM_PROMPT, type AskMode } from './ai/lektor'
import { minimalChange, planEdit } from './ai/planEdit'

declare global {
  interface Window {
    /** Vom Electron-Preload bereitgestellt; fehlt in der reinen Web-Variante. */
    maid?: MaidHost
  }
}

const host = window.maid ?? null
/** In der App startet MAID mit einem leeren Dokument, im Browser mit dem Probetext. */
const initialDoc = host ? '' : sampleDoc

type Pending = SourceRange & { x: number; y: number }

/** Bilddateien aus Zwischenablage oder Ziehen. */
function imageFiles(list: FileList | undefined | null): File[] {
  return [...(list ?? [])].filter((f) => IMAGE_EXTENSIONS.includes(imageExtension(f) ?? ''))
}

const SPLITTER_WIDTH = 5
const SPLIT_KEY = 'maid.split'

const clampSplit = (v: number) => Math.min(0.85, Math.max(0.15, v))

/** Anteil des Manuskripts an der Breite von Manuskript + Druckfahne. */
function loadSplit(): number {
  try {
    const v = Number(localStorage.getItem(SPLIT_KEY))
    return v ? clampSplit(v) : 0.5
  } catch {
    return 0.5
  }
}

function saveSplit(v: number) {
  try {
    localStorage.setItem(SPLIT_KEY, String(v))
  } catch {
    // ohne Speicher bleibt die Breite nur bis zum Neuladen
  }
}

export function App() {
  const editorHost = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  /** Markierung bzw. Cursor zum Zeitpunkt einer Chat-Nachricht; wird bei Änderungen mitgeführt. */
  const chatFocusRef = useRef(new Map<string, EditorFocus>())
  const [doc, setDoc] = useState(initialDoc)
  const [anchors, setAnchors] = useState<Anchor[]>([])
  const [threads, setThreads] = useState<Thread[]>([])
  /** Threads, in denen gerade eine KI-Anfrage läuft. */
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  /** Seitenpanel: Kommentar-Threads oder freier Chat zum ganzen Dokument. */
  const [panel, setPanel] = useState<'comments' | 'chat'>('comments')
  const [chats, setChats] = useState<Chat[]>([])
  /** Geöffneter Chat; null zeigt die Liste der Chats. */
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  /** Chats, in denen Claude gerade antwortet. */
  const [chatBusy, setChatBusy] = useState<ReadonlySet<string>>(new Set())
  const { settings, update: updateSettings } = useSettings(host)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const [draft, setDraft] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [split, setSplit] = useState(loadSplit)
  /** Welcher Trenner gerade gezogen wird. */
  const [dragging, setDragging] = useState<'split' | 'side' | null>(null)
  const [sideW, setSideW] = useState(loadSideWidth)
  const [collapsed, setCollapsed] = useState(loadCollapsed)
  const togglePane = (id: PaneId) =>
    setCollapsed((c) => {
      const next = toggleCollapsed(c, id)
      saveCollapsed(next)
      return next
    })
  const splitters = visibleSplitters(collapsed)
  /** Zeigt Kommentare oder Chat und klappt das Seitenpanel dafür bei Bedarf auf. */
  const showSide = (p: 'comments' | 'chat') => {
    setPanel(p)
    setCollapsed((c) => {
      if (!c.side) return c
      const next = { ...c, side: false }
      saveCollapsed(next)
      return next
    })
  }
  const mainRef = useRef<HTMLElement>(null)
  const model = useMemo(() => buildPreview(doc), [doc])
  // Undo/Redo im Editor im Thread nachziehen, damit Anzeige und KI-Verlauf stimmen.
  useEffect(() => {
    setThreads((ts) =>
      syncEditStates(ts, (id) => {
        const a = anchors.find((x) => x.id === id)
        return a && isPlaced(a) ? doc.slice(a.from, a.to) : null
      }, doc),
    )
    setChats((cs) => {
      let changed = false
      const next = cs.map((c) => {
        const messages = syncLastEdit(c.messages, null, doc)
        if (messages === c.messages) return c
        changed = true
        return { ...c, messages }
      })
      return changed ? next : cs
    })
  }, [anchors, doc])

  // Laufende KI-Anfragen brauchen den aktuellen Stand, nicht den ihres Starts.
  const threadsRef = useRef(threads)
  threadsRef.current = threads

  const extensions = useMemo<Extension[]>(
    () => [
      basicSetup,
      markdown({ addKeymap: false }),
      markdownKeymap,
      EditorView.lineWrapping,
      anchorField,
      anchorHistory,
      // In der App kommen diese Kürzel über die Menüs „KI“ und „Format“; im Browser direkt im Editor.
      host
        ? []
        : keymap.of([
            { key: 'Mod-Shift-k', run: () => (threadFromEditorRef.current(), true) },
            { key: 'Mod-b', run: formatCommands.bold },
            { key: 'Mod-i', run: formatCommands.italic },
            { key: 'Mod-u', run: formatCommands.underline },
            { key: 'Mod-Shift-x', run: formatCommands.strike },
            { key: 'Mod-Shift-h', run: formatCommands.highlight },
            { key: 'Mod-k', run: formatCommands.link },
          ]),
      // Bilder aus der Zwischenablage oder per Ziehen landen im Bilderordner neben dem Dokument.
      EditorView.domEventHandlers({
        paste(e, view) {
          const files = imageFiles(e.clipboardData?.files)
          if (files.length === 0) return false
          e.preventDefault()
          const { from, to } = view.state.selection.main
          void insertImagesRef.current(files, from, to)
          return true
        },
        drop(e, view) {
          const files = imageFiles(e.dataTransfer?.files)
          if (files.length === 0) return false
          e.preventDefault()
          const at = view.posAtCoords({ x: e.clientX, y: e.clientY }) ?? view.state.selection.main.head
          void insertImagesRef.current(files, at, at)
          return true
        },
      }),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) setDoc(u.state.doc.toString())
        if (u.docChanged) {
          for (const [id, f] of chatFocusRef.current) {
            const from = u.changes.mapPos(f.from, f.from === f.to ? -1 : 1)
            chatFocusRef.current.set(id, { from, to: f.from === f.to ? from : Math.max(from, u.changes.mapPos(f.to, -1)) })
          }
        }
        const next = u.state.field(anchorField)
        if (next !== u.startState.field(anchorField)) setAnchors(next)
      }),
    ],
    [],
  )

  useEffect(() => {
    // Wird der Editor neu aufgebaut (z. B. beim Hot Reload in der Entwicklung),
    // übernimmt er Text, Auswahl und Anker vom vorherigen statt leer anzufangen.
    const previous = viewRef.current?.state
    const view = new EditorView({
      parent: editorHost.current!,
      state: EditorState.create({ doc: previous?.doc ?? initialDoc, selection: previous?.selection, extensions }),
    })
    const anchorsBefore = previous?.field(anchorField, false)
    if (anchorsBefore?.length) view.dispatch({ effects: setAnchorsEffect.of(anchorsBefore) })
    viewRef.current = view
    return () => view.destroy()
  }, [extensions])

  const file = useDocumentFile({
    host,
    initialDoc,
    doc,
    anchors,
    threads,
    chats,
    load(content, loaded, loadedThreads, loadedChats) {
      const view = viewRef.current!
      view.setState(EditorState.create({ doc: content, extensions }))
      setDoc(content)
      setAnchors([])
      view.dispatch({ effects: setAnchorsEffect.of(loaded) })
      setThreads(loadedThreads)
      setChats(loadedChats)
      setActiveChatId(null)
      setChatBusy(new Set())
      setBusy(new Set())
      setPending(null)
      setActiveId(null)
      view.focus()
    },
  })

  /** Lädt relative Bildpfade über das lokale Bildprotokoll, relativ zum Ordner des Dokuments. */
  const resolveSrc = useMemo(() => {
    const p = file.path
    if (!host || !p) return undefined
    const dir = p.slice(0, p.lastIndexOf('/')).split('/').map(encodeURIComponent).join('/')
    const base = `${LOCAL_FILE_SCHEME}://local${dir}/`
    return (src: string) => (/^[a-z][a-z0-9+.-]*:/i.test(src) ? src : new URL(src, base).href)
  }, [file.path])

  async function insertImages(files: File[], from: number, to: number) {
    const view = viewRef.current
    if (!host || !view) return file.showError('Bilder einfügen geht nur in der App.')
    try {
      const docPath = await file.ensurePath()
      if (!docPath) return file.showError('Zum Einfügen von Bildern das Dokument bitte zuerst sichern – die Bilder liegen neben der Datei.')
      const refs: string[] = []
      for (const f of files) refs.push(imageMarkdown(await host.saveImage(docPath, new Uint8Array(await f.arrayBuffer()), imageExtension(f)!)))
      const insert = refs.join('\n\n')
      const len = view.state.doc.length
      view.dispatch({
        changes: { from: Math.min(from, len), to: Math.min(to, len), insert },
        selection: { anchor: Math.min(from, len) + insert.length },
        scrollIntoView: true,
        userEvent: 'input.paste',
      })
    } catch (err) {
      file.showError(`Bild konnte nicht eingefügt werden: ${(err as Error).message}`)
    }
  }
  const insertImagesRef = useRef(insertImages)
  insertImagesRef.current = insertImages

  /** Neue Anzeigebreite eines Bildes in den Markdown-Quelltext schreiben. */
  function resizeImage(from: number, to: number, width: number | null) {
    const view = viewRef.current
    if (!view) return
    const source = view.state.doc.sliceString(from, to)
    const next = setImageWidth(source, width)
    if (next !== source) view.dispatch({ changes: { from, to, insert: next }, userEvent: 'input.maid' })
  }

  // Anker in der Druckfahne über die CSS Custom Highlight API markieren – ohne DOM-Umbau.
  useLayoutEffect(() => {
    const root = previewRef.current
    if (!root || !('highlights' in CSS)) return
    const all: Range[] = []
    const active: Range[] = []
    for (const a of anchors) {
      const r = sourceToDomRange(a, root, model.segments)
      if (!r) continue
      ;(a.id === activeId ? active : all).push(r)
    }
    CSS.highlights.set('maid-anchor', new Highlight(...all))
    CSS.highlights.set('maid-active', new Highlight(...active))
    // Die Browser-Auswahl geht verloren, sobald das Kommentarfeld den Fokus bekommt.
    const pendingRange = pending && sourceToDomRange(pending, root, model.segments)
    CSS.highlights.set('maid-pending', new Highlight(...(pendingRange ? [pendingRange] : [])))
  }, [model, anchors, activeId, pending])

  function onPreviewMouseUp() {
    const sel = window.getSelection()
    const root = previewRef.current
    if (!sel || sel.isCollapsed || !root) return setPending(null)
    const range = sel.getRangeAt(0)
    if (!root.contains(range.commonAncestorContainer)) return setPending(null)
    const src = domRangeToSource(range, root, model.segments)
    if (!src) return setPending(null)
    const rect = range.getBoundingClientRect()
    setPending({ ...src, x: rect.left, y: rect.bottom + 6 })
    setDraft('')
  }

  function comment(withAi: boolean) {
    const view = viewRef.current
    if (!view || !pending || !draft.trim()) return
    const anchor = createAnchor(view.state.doc, pending.from, pending.to)
    view.dispatch({ effects: addAnchor.of(anchor) })
    const thread = createThread(anchor.id, draft.trim())
    setThreads((ts) => [...ts, thread])
    threadsRef.current = [...threadsRef.current, thread]
    setPending(null)
    setActiveId(anchor.id)
    showSide('comments')
    window.getSelection()?.removeAllRanges()
    if (withAi && host) void askAi(anchor.id, 'discuss')
  }

  const appendTo = (id: string, m: Parameters<typeof message>[0]) => setThreads((ts) => appendMessage(ts, id, message(m)))
  const currentAnchor = (id: string) => viewRef.current?.state.field(anchorField).find((a) => a.id === id)

  /**
   * Ersetzt `oldText` durch `newText` an der Stelle des Threads – als eine
   * Editor-Transaktion (ein Undo-Schritt). Der Anker wird explizit auf den
   * Ersatztext gesetzt. Liefert den ersetzten Text oder eine Fehlermeldung.
   */
  function replaceAtAnchor(id: string, oldText: string, newText: string): { before: string; elsewhere: boolean } | { error: string } {
    const view = viewRef.current
    const anchor = currentAnchor(id)
    if (!view || !anchor) return { error: 'Der Thread hat keine Stelle mehr im Dokument.' }
    const text = view.state.doc.toString()
    const plan = planEdit(text, anchor, oldText, newText)
    if ('error' in plan) return plan
    const change = minimalChange(text, plan)
    const changes = { from: change.from, to: change.to, insert: change.insert }
    if (plan.elsewhere) {
      // Änderung an anderer Stelle: Anker bleibt, die Stelle wird im Manuskript gezeigt.
      view.dispatch({
        changes,
        selection: { anchor: plan.from, head: plan.from + newText.length },
        scrollIntoView: true,
        userEvent: 'input.maid',
      })
    } else {
      view.dispatch({
        changes,
        // Wird der Text ganz entfernt (z. B. Rücknahme einer Einfügung), bleibt eine Einfügemarke.
        effects: placeAnchor.of({ id, from: plan.from, to: plan.from + newText.length, point: newText === '', quote: newText, status: 'ok' }),
        userEvent: 'input.maid',
      })
    }
    return { before: text.slice(plan.from, plan.to), elsewhere: !!plan.elsewhere }
  }

  async function askAi(id: string, mode: AskMode) {
    if (!host) return appendTo(id, { kind: 'error', text: 'Die KI ist nur in der App verfügbar.' })
    const view = viewRef.current
    const anchor = currentAnchor(id)
    const thread = threadsRef.current.find((t) => t.id === id)
    if (!view || !anchor || !thread) return
    setBusy((b) => new Set(b).add(id))
    try {
      const prompt = buildPrompt({
        doc: view.state.doc.toString(),
        from: anchor.from,
        to: anchor.to,
        point: anchor.point,
        messages: thread.messages,
        mode,
      })
      const result = await host.askAi({ prompt, systemPrompt: SYSTEM_PROMPT, schema: RESPONSE_SCHEMA })
      if (!result.ok) return appendTo(id, { kind: 'error', text: result.error })
      const answer = parseAnswer(result.data)
      appendTo(id, { kind: 'ai', text: answer.reply })
      if (answer.edit) {
        const done = replaceAtAnchor(id, answer.edit.oldText, answer.edit.newText)
        appendTo(
          id,
          'error' in done
            ? { kind: 'error', text: `Nicht ausgeführt: ${done.error}` }
            : { kind: 'edit', before: done.before, after: answer.edit.newText, elsewhere: done.elsewhere },
        )
      }
    } catch (err) {
      appendTo(id, { kind: 'error', text: (err as Error).message })
    } finally {
      setBusy((b) => {
        const next = new Set(b)
        next.delete(id)
        return next
      })
    }
  }

  function send(id: string, text: string) {
    appendTo(id, { kind: 'user', text })
    // Der neue Beitrag ist erst nach dem nächsten Render im Thread; askAi liest über die Ref.
    threadsRef.current = appendMessage(threadsRef.current, id, message({ kind: 'user', text }))
    if (host) void askAi(id, 'discuss')
  }

  function revert(id: string, messageId: string) {
    const m = threadsRef.current.find((t) => t.id === id)?.messages.find((x) => x.id === messageId)
    if (!m || m.kind !== 'edit') return
    const done = replaceAtAnchor(id, m.after, m.before)
    if ('error' in done) return appendTo(id, { kind: 'error', text: done.error })
    setThreads((ts) =>
      updateThread(ts, id, (t) => ({ ...t, messages: t.messages.map((x) => (x.id === messageId ? { ...x, reverted: true } : x)) })),
    )
  }

  function removeThread(id: string) {
    viewRef.current?.dispatch({ effects: removeAnchor.of(id) })
    setThreads((ts) => ts.filter((t) => t.id !== id))
    threadsRef.current = threadsRef.current.filter((t) => t.id !== id)
    if (activeId === id) setActiveId(null)
  }

  /** Ein geöffneter Thread ohne jede Nachricht wird beim Verlassen verworfen. */
  function discardIfEmpty(id: string | null) {
    if (id && threadsRef.current.find((t) => t.id === id)?.messages.length === 0) removeThread(id)
  }

  function closeChat() {
    discardIfEmpty(activeId)
    setActiveId(null)
  }

  /**
   * Neuer Thread an der Auswahl im Manuskript – ohne Auswahl an einer
   * Einfügemarke an der Cursorposition. Der Chat öffnet sich leer.
   */
  function threadFromEditor() {
    const view = viewRef.current
    if (!view) return
    discardIfEmpty(activeId)
    const { from, to } = view.state.selection.main
    const anchor = createAnchor(view.state.doc, from, to)
    view.dispatch({ effects: addAnchor.of(anchor) })
    const thread = createThread(anchor.id)
    setThreads((ts) => [...ts, thread])
    threadsRef.current = [...threadsRef.current, thread]
    setPending(null)
    setActiveId(anchor.id)
    showSide('comments')
  }
  const threadFromEditorRef = useRef(threadFromEditor)
  threadFromEditorRef.current = threadFromEditor
  const newChatRef = useRef(() => {})

  /** Formatierung auf die Auswahl im Manuskript anwenden. */
  function applyFormat(cmd: FormatCommand) {
    const view = viewRef.current
    if (!view) return
    formatCommands[cmd](view)
    view.focus()
  }

  useEffect(
    () =>
      host?.onMenu((command) => {
        if (command === 'askAi') threadFromEditorRef.current()
        if (command === 'settings') setSettingsOpen(true)
        if (command === 'chat') newChatRef.current()
        if (command.startsWith('format:')) {
          // Nicht in Eingabefeldern (Chat, Kommentar) – dort gilt das Kürzel nicht dem Manuskript.
          const focus = document.activeElement
          if (!(focus instanceof HTMLTextAreaElement || focus instanceof HTMLInputElement)) applyFormat(command.slice(7) as FormatCommand)
        }
      }),
    [],
  )

  function onSplitterMove(e: PointerEvent<HTMLDivElement>) {
    const main = mainRef.current
    if (!dragging || !main) return
    const rect = main.getBoundingClientRect()
    if (dragging === 'side') return setSideW(clampSide(rect.right - e.clientX - SPLITTER_WIDTH / 2, rect.width))
    const side = collapsed.side ? COLLAPSED_WIDTH : sideW + SPLITTER_WIDTH
    const width = rect.width - side - SPLITTER_WIDTH
    setSplit(clampSplit((e.clientX - rect.left) / width))
  }

  /** Gemeinsames Verhalten beider Trenner: ziehen, loslassen merkt die Breite, Doppelklick setzt zurück. */
  const splitterProps = (kind: 'split' | 'side') => ({
    role: 'separator',
    'aria-orientation': 'vertical' as const,
    title: 'Ziehen zum Ändern der Breite, Doppelklick setzt zurück',
    className: `splitter ${(kind === 'split' ? splitters.split : splitters.side) ? '' : 'hidden'}`,
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      setDragging(kind)
    },
    onPointerMove: onSplitterMove,
    onPointerUp: () => {
      setDragging(null)
      if (kind === 'split') saveSplit(split)
      else saveSideWidth(sideW)
    },
    onDoubleClick: () => {
      if (kind === 'split') {
        setSplit(0.5)
        saveSplit(0.5)
      } else {
        setSideW(SIDE_DEFAULT)
        saveSideWidth(SIDE_DEFAULT)
      }
    },
  })

  const appendToChat = (id: string, m: Message) => setChats((cs) => updateChat(cs, id, (c) => ({ ...c, messages: [...c.messages, m] })))

  async function askChat(id: string, text: string) {
    const view = viewRef.current
    const chat = chats.find((c) => c.id === id)
    if (!host || !view || !chat) return
    const messages = [...chat.messages, message({ kind: 'user', text })]
    setChats((cs) => updateChat(cs, id, (c) => ({ ...c, messages })))
    setChatBusy((b) => new Set(b).add(id))
    try {
      const { from, to } = view.state.selection.main
      chatFocusRef.current.set(id, { from, to })
      const prompt = buildChatPrompt({ doc: view.state.doc.toString(), focus: { from, to }, messages })
      const result = await host.askAi({ prompt, systemPrompt: CHAT_SYSTEM_PROMPT, schema: CHAT_SCHEMA })
      if (!result.ok) return appendToChat(id, message({ kind: 'error', text: result.error }))
      const answer = parseChatAnswer(result.data)
      setChats((cs) => updateChat(cs, id, (c) => suggestTitle({ ...c, messages: [...c.messages, message({ kind: 'ai', text: answer.reply })] }, answer.title)))
      if (answer.edit) {
        const { oldText, newText } = answer.edit
        const done = applyChatEdit(oldText, newText, chatFocusRef.current.get(id) ?? null)
        // Chat-Änderungen sind an keinen Anker gebunden; ihr Status wird im ganzen Dokument geprüft.
        appendToChat(
          id,
          'error' in done
            ? message({ kind: 'error', text: `Nicht ausgeführt: ${done.error}` })
            : message({ kind: 'edit', before: done.before, after: newText, elsewhere: true }),
        )
      }
    } catch (err) {
      appendToChat(id, message({ kind: 'error', text: (err as Error).message }))
    } finally {
      chatFocusRef.current.delete(id)
      setChatBusy((b) => {
        const next = new Set(b)
        next.delete(id)
        return next
      })
    }
  }

  /** Ein geöffneter Chat ohne Nachricht wird beim Verlassen verworfen. */
  function leaveChat() {
    setChats((cs) => cs.filter((c) => c.id !== activeChatId || c.messages.length > 0))
    setActiveChatId(null)
  }

  function newChat() {
    leaveChat()
    const chat = createChat()
    setChats((cs) => [...cs, chat])
    setActiveChatId(chat.id)
    showSide('chat')
  }
  newChatRef.current = newChat

  /**
   * Führt eine Chat-Änderung aus: an der Markierung bzw. Cursorposition, sonst an
   * einer eindeutigen Textstelle. Die geänderte Stelle wird im Manuskript markiert.
   */
  function applyChatEdit(oldText: string, newText: string, focus: EditorFocus | null): { before: string } | { error: string } {
    const view = viewRef.current
    if (!view) return { error: 'Kein Editor.' }
    const text = view.state.doc.toString()
    const target = focus ? { ...focus, point: focus.from === focus.to } : { from: 0, to: 0 }
    const plan = planEdit(text, target, oldText, newText)
    if ('error' in plan) return plan
    const change = minimalChange(text, plan)
    view.dispatch({
      changes: { from: change.from, to: change.to, insert: change.insert },
      selection: { anchor: plan.from, head: plan.from + newText.length },
      scrollIntoView: true,
      userEvent: 'input.maid',
    })
    return { before: text.slice(plan.from, plan.to) }
  }

  function revertChatEdit(id: string, messageId: string) {
    const m = chats.find((c) => c.id === id)?.messages.find((x) => x.id === messageId)
    if (!m || m.kind !== 'edit') return
    const done = applyChatEdit(m.after, m.before, null)
    if ('error' in done) return appendToChat(id, message({ kind: 'error', text: `Nicht zurückgenommen: ${done.error}` }))
    setChats((cs) => updateChat(cs, id, (c) => ({ ...c, messages: c.messages.map((x) => (x.id === messageId ? { ...x, reverted: true } : x)) })))
  }

  function focusThread(id: string) {
    if (activeId !== id) discardIfEmpty(activeId)
    const a = currentAnchor(id)
    setActiveId(id)
    if (!a) return
    const view = viewRef.current
    if (view && isPlaced(a)) {
      view.dispatch({ selection: { anchor: a.from, head: a.to }, scrollIntoView: true })
    }
    const root = previewRef.current
    const r = root && sourceToDomRange(a, root, model.segments)
    r?.startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  return (
    <div className="app">
      {/* In der App stehen Dateiname und „ungesichert“ in der macOS-Titelleiste; hier nur Fehler. */}
      {(!host || file.error) && (
        <header>
          {!host && (
            <>
              <strong>MAID</strong>
              <span className="muted">Web-Vorschau ohne Dateizugriff</span>
            </>
          )}
          {file.error && (
            <span className="error">
              {file.error}
              <button className="link" onClick={file.clearError}>
                ×
              </button>
            </span>
          )}
        </header>
      )}
      <main
        ref={mainRef}
        className={dragging ? 'dragging' : undefined}
        style={{ gridTemplateColumns: gridColumns(collapsed, split, SPLITTER_WIDTH, sideW) }}
      >
        {/* Weggeklappte Spalten bleiben im DOM, damit Editor, Entwürfe und Verlauf erhalten bleiben. */}
        <section className={`pane manuscript ${collapsed.editor ? 'collapsed' : ''}`}>
          {collapsed.editor && <CollapsedStrip title="Manuskript" onExpand={() => togglePane('editor')} />}
          <h2>
            Manuskript
            <FormatToolbar onFormat={applyFormat} />
            <CollapseButton disabled={cannotCollapse(collapsed, 'editor')} onClick={() => togglePane('editor')} />
          </h2>
          <div className="editor" ref={editorHost} />
        </section>
        <div {...splitterProps('split')} />
        <section className={`pane ${collapsed.preview ? 'collapsed' : ''}`}>
          {collapsed.preview && <CollapsedStrip title="Druckfahne" onExpand={() => togglePane('preview')} />}
          <h2>
            Druckfahne
            <CollapseButton disabled={cannotCollapse(collapsed, 'preview')} onClick={() => togglePane('preview')} />
          </h2>
          <Preview ref={previewRef} model={model} onMouseUp={onPreviewMouseUp} resolveSrc={resolveSrc} onImageResize={resizeImage} />
        </section>
        <div {...splitterProps('side')} />
        <aside className={`pane threads ${(panel === 'comments' ? activeId : activeChatId) ? 'chat-open' : ''} ${collapsed.side ? 'collapsed' : ''}`}>
          {collapsed.side && (
            <CollapsedStrip title={panel === 'chat' ? 'Chat' : 'Kommentare'} onExpand={() => togglePane('side')} />
          )}
          <div className="panel-tabs" role="tablist">
            <button role="tab" aria-selected={panel === 'comments'} className={panel === 'comments' ? 'active' : ''} onClick={() => setPanel('comments')}>
              <MessageSquareText size={14} /> Kommentare
            </button>
            <button role="tab" aria-selected={panel === 'chat'} className={panel === 'chat' ? 'active' : ''} onClick={() => setPanel('chat')}>
              <MessagesSquare size={14} /> Chat
              {chatBusy.size > 0 && panel !== 'chat' && <span className="dot" title="Claude antwortet" />}
            </button>
            <CollapseButton disabled={cannotCollapse(collapsed, 'side')} onClick={() => togglePane('side')} />
          </div>
          {panel === 'chat' ? (
            <ChatPanel
              doc={doc}
              chats={chats}
              activeId={activeChatId}
              busy={chatBusy}
              aiAvailable={!!host}
              onNew={newChat}
              onOpen={(id) => {
                leaveChat()
                setActiveChatId(id)
              }}
              onClose={leaveChat}
              onSend={(id, t) => void askChat(id, t)}
              onRevert={revertChatEdit}
              onRename={(id, title) => setChats((cs) => updateChat(cs, id, (c) => renameChat(c, title)))}
              onRemove={(id) => {
                setChats((cs) => cs.filter((c) => c.id !== id))
                setActiveChatId(null)
              }}
            />
          ) : (
            <ThreadPanel
              doc={doc}
              anchors={anchors}
              threads={threads}
              activeId={activeId}
              busy={busy}
              aiAvailable={!!host}
              onOpen={focusThread}
              onClose={closeChat}
              onSend={send}
              onExecute={(id) => void askAi(id, 'execute')}
              onRevert={revert}
              onRemove={removeThread}
            />
          )}
        </aside>
      </main>

      {settingsOpen && (
        <SettingsDialog host={host} settings={settings} onChange={updateSettings} onClose={() => setSettingsOpen(false)} />
      )}

      {pending && (
        <div className="popover" style={{ left: pending.x, top: pending.y }}>
          <div className="src">
            Quelle [{pending.from}, {pending.to}): <code>{doc.slice(pending.from, pending.to)}</code>
          </div>
          <textarea
            autoFocus
            placeholder={host ? 'Was stört dich an der Stelle? (↩ an die KI, ⇧↩ neue Zeile)' : 'Kommentar … (↩ notieren, ⇧↩ neue Zeile)'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Wie im Chat: ↩ sendet, ⇧↩ macht eine neue Zeile.
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                comment(!!host)
              }
              if (e.key === 'Escape') setPending(null)
            }}
          />
          <div className="actions">
            <button onClick={() => setPending(null)}>Abbrechen</button>
            <button disabled={!draft.trim()} onClick={() => comment(false)}>
              Nur notieren
            </button>
            {host && (
              <button className="primary" disabled={!draft.trim()} onClick={() => comment(true)}>
                Mit KI besprechen
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
