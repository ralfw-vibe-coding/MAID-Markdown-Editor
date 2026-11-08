import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { basicSetup } from 'codemirror'
import { Compartment, EditorState, Prec, type Extension } from '@codemirror/state'
import { EditorView, keymap, type Command } from '@codemirror/view'
import { markdown } from '@codemirror/lang-markdown'
import { IMAGE_EXTENSIONS, LOCAL_FILE_SCHEME, type FindCommand, type MaidHost } from '../../shared/host'
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
import { findPhrases, runFind } from './editor/find'
import { cursorHeightPercent, writingLine } from './editor/writingLine'
import { useDocumentFile } from './doc/useDocumentFile'
import { formatCommands, type FormatCommand } from './editor/format'
import { FormatToolbar } from './editor/FormatToolbar'
import { AUTO_COMMIT_DEFAULT, SaveStatus } from './doc/SaveStatus'
import { useSettings } from './settings/useSettings'
import { SettingsDialog } from './settings/SettingsDialog'
import { ChatPanel } from './chat/ChatPanel'
import { createChat, renameChat, suggestTitle, updateChat, type Chat } from './chat/chats'
import { buildChatPrompt, CHAT_SCHEMA, CHAT_SYSTEM_PROMPT, parseChatAnswer, type EditorFocus } from './chat/chat'
import { Link2, Link2Off, MessageSquareText, MessagesSquare } from 'lucide-react'
import { useVersions } from './versions/useVersions'
import { VersionsPane } from './versions/VersionsPane'
import { lineChanges } from './versions/versions'
import { buildVersionMessagePrompt, VERSION_MESSAGE_SCHEMA, VERSION_MESSAGE_SYSTEM } from './versions/versionMessage'
import { useScrollSync } from './layout/useScrollSync'
import {
  COLLAPSED_WIDTH,
  CollapseButton,
  CollapsedStrip,
  gridColumns,
  cannotCollapse,
  clampSide,
  clampVersions,
  loadVersionsWidth,
  saveVersionsWidth,
  VERSIONS_DEFAULT,
  loadSideWidth,
  saveSideWidth,
  SIDE_DEFAULT,
  visibleSplitters,
  loadCollapsed,
  saveCollapsed,
  toggleCollapsed,
  withoutPreview,
  type PaneId,
} from './layout/panes'
import {
  appendMessage,
  checkedAtAnchor,
  createThread,
  lastEdits,
  message,
  syncEditStates,
  syncLastEdits,
  updateThread,
  type Message,
  type NewMessage,
  type Thread,
} from './thread/thread'
import { ThreadPanel } from './thread/ThreadPanel'
import { buildPrompt, parseAnswer, RESPONSE_SCHEMA, SYSTEM_PROMPT, type AskMode } from './ai/lektor'
import { forDocument, isPlainTextPath } from './ai/plainText'
import { minimalChange, placedRanges, planEdits, type EditPlan, type EditRequest } from './ai/planEdit'

declare global {
  interface Window {
    /** Vom Electron-Preload bereitgestellt; fehlt in der reinen Web-Variante. */
    maid?: MaidHost
  }
}

const host = window.maid ?? null
/** In der App startet MAID mit einem leeren Dokument, im Browser mit dem Probetext. */
const initialDoc = host ? '' : sampleDoc

/** Kommentar-Entwurf zu einer Markierung; `top`/`bottom` umfassen die Markierung (Fensterkoordinaten). */
type Pending = SourceRange & { x: number; top: number; bottom: number }

const POPOVER_GAP = 6
const POPOVER_MARGIN = 8

/**
 * Lage des Kommentar-Fensters: unter der Markierung, wenn es dort ganz ins
 * Fenster passt, sonst darüber; notfalls an den Fensterrand geschoben.
 */
function placePopover(p: Pending, width: number, height: number) {
  const maxTop = window.innerHeight - height - POPOVER_MARGIN
  const below = p.bottom + POPOVER_GAP
  const above = p.top - POPOVER_GAP - height
  const top = below <= maxTop ? below : above >= POPOVER_MARGIN ? above : Math.max(POPOVER_MARGIN, maxTop)
  const left = Math.min(Math.max(POPOVER_MARGIN, p.x), window.innerWidth - width - POPOVER_MARGIN)
  return { top, left }
}

/** Ziehbare Trenner zwischen den Spalten. */
type Splitter = 'versions' | 'split' | 'side'

/** Inhalt des Seitenpanels. */
type SidePanel = 'comments' | 'chat'
const PANEL_TITLE: Record<SidePanel, string> = { comments: 'Kommentare', chat: 'Chat' }

/** Bilddateien aus Zwischenablage oder Ziehen. */
function imageFiles(list: FileList | undefined | null): File[] {
  return [...(list ?? [])].filter((f) => IMAGE_EXTENSIONS.includes(imageExtension(f) ?? ''))
}

/** Markdown-Hervorhebung und -Tasten (Listen fortsetzen); im Textmodus leer. */
const markdownMode = new Compartment()
const MARKDOWN_MODE: Extension = [markdown({ addKeymap: false }), markdownKeymap]

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

type DoneEdit = { before: string; after: string; elsewhere: boolean }
type EditOutcome = { done: DoneEdit[]; errors: string[] }

const doneEdits = (text: string, plans: EditPlan[]): DoneEdit[] =>
  plans.map((p) => ({ before: text.slice(p.from, p.to), after: p.insert, elsewhere: !!p.elsewhere }))

/** Verlaufseinträge zu einer KI-Antwort: jede Änderung einzeln, mehrere mit gemeinsamer Kennung. */
function editMessages(done: DoneEdit[], errors: string[]): NewMessage[] {
  const batch = done.length > 1 ? crypto.randomUUID() : undefined
  return [
    ...done.map((d): NewMessage => ({ kind: 'edit', ...d, ...(batch ? { batch } : {}) })),
    ...errors.map((e): NewMessage => ({ kind: 'error', text: `Nicht ausgeführt: ${e}` })),
  ]
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
  const [panel, setPanel] = useState<SidePanel>('comments')
  const [chats, setChats] = useState<Chat[]>([])
  /** Geöffneter Chat; null zeigt die Liste der Chats. */
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  /** Chats, in denen Claude gerade antwortet. */
  const [chatBusy, setChatBusy] = useState<ReadonlySet<string>>(new Set())
  const { settings, update: updateSettings } = useSettings(host)
  /** Für den Editor, der einmal aufgebaut wird und die Einstellung beim Tippen liest. */
  const writingLineRef = useRef(settings.writingLine)
  writingLineRef.current = settings.writingLine
  const [settingsOpen, setSettingsOpen] = useState(false)
  /** In der Versionsspalte gewählte Version (Vergleich); null = aktueller Stand. */
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  /** Erhöht, wenn das Nachrichtenfeld der Versionsspalte den Fokus bekommen soll (⌥⌘S). */
  const [versionFocus, setVersionFocus] = useState(0)
  const [pending, setPending] = useState<Pending | null>(null)
  const [draft, setDraft] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [split, setSplit] = useState(loadSplit)
  /** Welcher Trenner gerade gezogen wird. */
  const [dragging, setDragging] = useState<Splitter | null>(null)
  const [sideW, setSideW] = useState(loadSideWidth)
  const [versionsW, setVersionsW] = useState(loadVersionsWidth)
  const [collapsed, setCollapsed] = useState(loadCollapsed)
  /** Zählt geladene Dokumente – jedes bringt einen frischen Editorzustand mit. */
  const [loads, setLoads] = useState(0)
  /** Mitlaufendes Scrollen von Manuskript und Druckfahne (Kette im Titel der Druckfahne). */
  const [syncScroll, setSyncScroll] = useState(() => {
    try {
      return localStorage.getItem('maid.syncScroll') !== 'off'
    } catch {
      return true
    }
  })
  const toggleSyncScroll = () =>
    setSyncScroll((on) => {
      try {
        localStorage.setItem('maid.syncScroll', on ? 'off' : 'on')
      } catch {
        // ohne Speicher gilt die Einstellung nur bis zum Neuladen
      }
      return !on
    })
  const togglePane = (id: PaneId) =>
    setCollapsed((c) => {
      const next = toggleCollapsed(c, id)
      saveCollapsed(next)
      return next
    })
  /** Zeigt Kommentare oder Chat und klappt das Seitenpanel dafür bei Bedarf auf. */
  const showSide = (p: SidePanel) => {
    // Ein noch leerer Kommentar (z. B. per ⇧⌘K angelegt) wird beim Wechsel zum Chat verworfen.
    if (p === 'chat') discardIfEmpty(activeId)
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
        const messages = syncLastEdits(c.messages, null, doc)
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
  /** Textmodus (.txt): keine Markdown-Formatierung, keine Bilder. Wird gesetzt, sobald der Pfad feststeht. */
  const plainTextRef = useRef(false)
  /** Formatierungskürzel greifen nur bei Markdown; im Textmodus gehen sie ins Leere. */
  const unlessPlain = (cmd: Command): Command => (view) => plainTextRef.current || cmd(view)

  const extensions = useMemo<Extension[]>(
    () => [
      basicSetup,
      markdownMode.of(MARKDOWN_MODE),
      findPhrases,
      writingLine(() => writingLineRef.current),
      EditorView.lineWrapping,
      anchorField,
      anchorHistory,
      // Unsere Kürzel mit Vorrang: CodeMirror belegt ⌘I (Block auswählen), ⌘U (Auswahl
      // zurücknehmen), ⇧⌘K (Zeile löschen) und ⇧⌘L (alle Treffer auswählen) selbst, und
      // der Editor sieht Tasten vor dem Menü. Was der Editor behandelt, löst den
      // Menüeintrag nicht mehr aus – also nichts doppelt.
      Prec.highest(
        keymap.of([
          { key: 'Mod-Shift-k', run: () => (threadFromEditorRef.current(), true) },
          { key: 'Mod-Shift-l', run: () => (newChatRef.current(), true) },
          { key: 'Mod-b', run: unlessPlain(formatCommands.bold) },
          { key: 'Mod-i', run: unlessPlain(formatCommands.italic) },
          { key: 'Mod-u', run: unlessPlain(formatCommands.underline) },
          { key: 'Mod-Shift-x', run: unlessPlain(formatCommands.strike) },
          { key: 'Mod-Shift-h', run: unlessPlain(formatCommands.highlight) },
          { key: 'Mod-k', run: unlessPlain(formatCommands.link) },
        ]),
      ),
      // Bilder aus der Zwischenablage oder per Ziehen landen im Bilderordner neben dem Dokument.
      EditorView.domEventHandlers({
        paste(e, view) {
          const files = imageFiles(e.clipboardData?.files)
          if (files.length === 0 || plainTextRef.current) return false
          e.preventDefault()
          const { from, to } = view.state.selection.main
          void insertImagesRef.current(files, from, to)
          return true
        },
        drop(e, view) {
          const files = imageFiles(e.dataTransfer?.files)
          if (files.length === 0 || plainTextRef.current) return false
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
    autoSave: settings.autoSave,
    load(content, loaded, loadedThreads, loadedChats) {
      const view = viewRef.current!
      view.setState(EditorState.create({ doc: content, extensions }))
      setDoc(content)
      setAnchors([])
      view.dispatch({ effects: setAnchorsEffect.of(loaded) })
      setThreads(loadedThreads)
      setChats(loadedChats)
      setSelectedVersionId(null)
      setActiveChatId(null)
      setChatBusy(new Set())
      setBusy(new Set())
      setPending(null)
      setActiveId(null)
      setLoads((n) => n + 1)
      view.focus()
    },
  })

  const plainText = isPlainTextPath(file.path)
  plainTextRef.current = plainText
  // Ein geladener Editorzustand beginnt mit Markdown; danach den Modus zum Pfad passend setzen.
  useEffect(() => {
    viewRef.current?.dispatch({ effects: markdownMode.reconfigure(plainText ? [] : MARKDOWN_MODE) })
  }, [plainText, loads])
  /** Im Textmodus gibt es keine Druckfahne; die übrigen Spalten bleiben, wie sie sind. */
  const layout = plainText ? withoutPreview(collapsed) : collapsed
  const splitters = visibleSplitters(layout)

  const { jumpTo } = useScrollSync({
    viewRef,
    previewRef,
    segments: model.segments,
    enabled: syncScroll && !layout.editor && !layout.preview,
  })

  /**
   * Einfacher Klick in die Druckfahne setzt den Cursor an dieselbe Stelle im Manuskript;
   * ein Klick auf einen Link öffnet ihn im Browser (Markieren über den Link bleibt möglich).
   */
  function onPreviewClick(e: MouseEvent<HTMLDivElement>) {
    if (e.detail !== 1 || !window.getSelection()?.isCollapsed) return
    const link = (e.target as HTMLElement).closest('a')
    if (link) {
      if (host) host.openExternal(link.href)
      else window.open(link.href, '_blank', 'noopener')
      return
    }
    if (collapsed.editor || (e.target as HTMLElement).closest('.img-handle')) return
    const caret = document.caretPositionFromPoint?.(e.clientX, e.clientY)
    const node = caret?.offsetNode
    const span = node instanceof Text ? node.parentElement?.closest<HTMLElement>('[data-seg]') : null
    const seg = span ? model.segments[Number(span.dataset.seg)] : undefined
    if (!seg || !caret) return
    const i = caret.offset
    jumpTo(i < seg.text.length ? seg.starts[i] : seg.ends[seg.text.length - 1], e.clientY)
  }

  /** Lädt relative Bildpfade über das lokale Bildprotokoll, relativ zum Ordner des Dokuments. */
  const resolveSrc = useMemo(() => {
    const p = file.path
    if (!host || !p) return undefined
    const dir = p.slice(0, p.lastIndexOf('/')).split('/').map(encodeURIComponent).join('/')
    const base = `${LOCAL_FILE_SCHEME}://local${dir}/`
    return (src: string) => (/^[a-z][a-z0-9+.-]*:/i.test(src) ? src : new URL(src, base).href)
  }, [file.path])

  const versions = useVersions(host, file.path)
  useEffect(() => {
    if (versions.error) file.showError(versions.error)
  }, [versions.error])

  /**
   * Neue Fassung festhalten. Ohne Bezeichnung formuliert Claude sie aus dem
   * inhaltlichen Kern der Änderungen. Fehler gehen an das Formular der Spalte.
   */
  async function saveVersion(message: string) {
    const view = viewRef.current
    if (!host || !view) return
    const docPath = await file.ensurePath()
    if (!docPath) throw new Error('Für Fassungen das Dokument bitte zuerst speichern – sie liegen neben der Datei.')
    // Den Stand beim Klick festhalten, auch wenn Claude ein paar Sekunden braucht.
    const text = view.state.doc.toString()
    let name = message
    let aiError: string | null = null
    if (!name) {
      try {
        name = await suggestVersionMessage(text)
      } catch (err) {
        aiError = (err as Error).message
      }
    }
    await versions.add(docPath, text, name)
    setSelectedVersionId(null)
    if (aiError) throw new Error(`Festgehalten, aber ohne Bezeichnung – Claude: ${aiError}`)
  }

  /**
   * Fassung auf Claudes Wunsch: hält den aktuellen Stand fest – vor einer
   * Änderung (dann als automatische Fassung) oder auf Bitte des Autors.
   * Liefert die Nachricht für den Verlauf.
   */
  async function holdFassungForAi(title: string, beforeEdit: boolean): Promise<NewMessage> {
    const view = viewRef.current
    const path = file.path
    if (!view) return { kind: 'error', text: 'Fassung nicht festgehalten.' }
    if (!path) return { kind: 'error', text: `Fassung „${title}“ nicht festgehalten – das Dokument hat noch keinen Dateinamen (⌘S).` }
    const text = view.state.doc.toString()
    const latest = versionsRef.current.versions.at(-1)
    if (latest?.text === text) return { kind: 'fassung', title: latest.message || title, existing: true }
    try {
      await versions.add(path, text, title, beforeEdit)
      return { kind: 'fassung', title }
    } catch (err) {
      return { kind: 'error', text: `Fassung nicht festgehalten: ${(err as Error).message}` }
    }
  }

  // Automatische Fassungen: alle x Minuten, wenn sich seit der letzten Fassung etwas geändert hat –
  // ein Protokoll des Schreibfortschritts. Gezählt wird ab der letzten Fassung bzw. ab dem Öffnen.
  const versionsRef = useRef(versions)
  versionsRef.current = versions
  const openedAt = useRef(Date.now())
  useEffect(() => {
    openedAt.current = Date.now()
  }, [file.path])
  useEffect(() => {
    const minutes = settings.autoCommitMinutes
    const path = file.path
    if (!host || !path || !(minutes > 0)) return
    const tick = () => {
      const view = viewRef.current
      if (!view) return
      const list = versionsRef.current.versions
      const latest = list.at(-1)
      const since = Math.max(openedAt.current, latest ? Date.parse(latest.createdAt) : 0)
      const text = view.state.doc.toString()
      if (Date.now() - since < minutes * 60_000 || text === latest?.text || text.trim() === '') return
      void versionsRef.current.add(path, text, '', true).catch((err: Error) => file.showError(`Automatisches Festhalten fehlgeschlagen: ${err.message}`))
    }
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [host, file.path, settings.autoCommitMinutes])

  /** ⌥⌘S: Versionsspalte aufklappen und ins Nachrichtenfeld. */
  function openVersions() {
    setCollapsed((c) => {
      if (!c.versions) return c
      const next = { ...c, versions: false }
      saveCollapsed(next)
      return next
    })
    setVersionFocus((n) => n + 1)
  }
  const openVersionsRef = useRef(openVersions)
  openVersionsRef.current = openVersions

  async function suggestVersionMessage(text: string): Promise<string> {
    if (!host) throw new Error('Nur in der App verfügbar.')
    const prompt = buildVersionMessagePrompt(versions.versions.at(-1)?.text ?? '', text)
    const result = await host.askAi({ prompt, systemPrompt: VERSION_MESSAGE_SYSTEM, schema: VERSION_MESSAGE_SCHEMA })
    if (!result.ok) throw new Error(result.error)
    return String((result.data as { message?: unknown }).message ?? '')
  }

  /**
   * Zurück zu einer Version: Der jetzige Stand wird vorher automatisch als Version
   * gesichert; dann wird nur geändert, was sich unterscheidet (ein Undo-Schritt).
   */
  async function restoreVersion(id: string) {
    const view = viewRef.current
    const target = versions.versions.find((v) => v.id === id)
    if (!host || !view || !target || !file.path) return
    const current = view.state.doc.toString()
    try {
      if (versions.versions.at(-1)?.text !== current) await versions.add(file.path, current, `Vor Rückkehr zu „${target.message || 'Fassung'}“`, true)
      view.dispatch({ changes: lineChanges(current, target.text), userEvent: 'input.restore', scrollIntoView: true })
      setSelectedVersionId(null)
    } catch (err) {
      file.showError(`Zurückgehen fehlgeschlagen: ${(err as Error).message}`)
    }
  }

  async function insertImages(files: File[], from: number, to: number) {
    const view = viewRef.current
    if (!host || !view) return file.showError('Bilder einfügen geht nur in der App.')
    try {
      const docPath = await file.ensurePath()
      if (!docPath) return file.showError('Zum Einfügen von Bildern das Dokument bitte zuerst speichern – die Bilder liegen neben der Datei.')
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

  // Kommentar-Fenster erst messen, dann so legen, dass es ganz zu sehen ist.
  const popoverRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = popoverRef.current
    if (!pending || !el) return
    const { top, left } = placePopover(pending, el.offsetWidth, el.offsetHeight)
    el.style.top = `${top}px`
    el.style.left = `${left}px`
    el.style.visibility = 'visible'
  }, [pending])

  function onPreviewMouseUp() {
    const sel = window.getSelection()
    const root = previewRef.current
    if (!sel || sel.isCollapsed || !root) return setPending(null)
    const range = sel.getRangeAt(0)
    if (!root.contains(range.commonAncestorContainer)) return setPending(null)
    const src = domRangeToSource(range, root, model.segments)
    if (!src) return setPending(null)
    const rect = range.getBoundingClientRect()
    setPending({ ...src, x: rect.left, top: rect.top, bottom: rect.bottom })
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
   * Führt Änderungen an der Stelle eines Threads aus – alle zusammen als eine
   * Editor-Transaktion (ein Undo-Schritt). Betrifft genau eine Änderung die
   * kommentierte Stelle, sitzt der Anker danach auf ihrem Ersatztext; betreffen
   * sie mehrere, umfasst er die Stelle samt allen. `moveAnchor: false` lässt den
   * Anker einfach mitwandern (Rücknahme einer von mehreren Änderungen).
   */
  function editAtAnchor(id: string, edits: EditRequest[], moveAnchor = true): EditOutcome {
    const view = viewRef.current
    const anchor = currentAnchor(id)
    if (!view || !anchor) return { done: [], errors: ['Der Thread hat keine Stelle mehr im Dokument.'] }
    const text = view.state.doc.toString()
    const { plans, errors } = planEdits(text, anchor, edits)
    if (!plans.length) return { done: [], errors }
    const changes = view.state.changes(plans.map((p) => minimalChange(text, p)))
    const ranges = placedRanges(plans)
    const atAnchor = ranges.filter((_, i) => !plans[i].elsewhere)
    if (atAnchor.length === 0) {
      // Nur an anderen Stellen geändert: Anker bleibt, die (erste) Stelle wird im Manuskript gezeigt.
      view.dispatch({ changes, selection: { anchor: ranges[0].from, head: ranges[0].to }, scrollIntoView: true, userEvent: 'input.maid' })
    } else if (!moveAnchor) {
      view.dispatch({ changes, userEvent: 'input.maid' })
    } else {
      const only = atAnchor.length === 1 ? atAnchor[0] : null
      const from = only ? only.from : Math.min(changes.mapPos(anchor.from, 1), ...atAnchor.map((r) => r.from))
      const to = only ? only.to : Math.max(changes.mapPos(anchor.to, -1), ...atAnchor.map((r) => r.to))
      const quote = changes.apply(view.state.doc).sliceString(from, to)
      view.dispatch({
        changes,
        // Wird der Text ganz entfernt (z. B. Rücknahme einer Einfügung), bleibt eine Einfügemarke.
        effects: placeAnchor.of({ id, from, to, point: from === to, quote, status: 'ok' }),
        userEvent: 'input.maid',
      })
    }
    return { done: doneEdits(text, plans), errors }
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
      const result = await host.askAi({ prompt, systemPrompt: forDocument(SYSTEM_PROMPT, plainText), schema: RESPONSE_SCHEMA })
      if (!result.ok) return appendTo(id, { kind: 'error', text: result.error })
      const answer = parseAnswer(result.data)
      appendTo(id, { kind: 'ai', text: answer.reply })
      // Erst festhalten, dann ändern – die Fassung ist der Stand vor der Änderung.
      if (answer.fassung) appendTo(id, await holdFassungForAi(answer.fassung, answer.edits.length > 0))
      if (answer.edits.length) {
        const { done, errors } = editAtAnchor(id, answer.edits)
        for (const m of editMessages(done, errors)) appendTo(id, m)
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
    const messages = threadsRef.current.find((t) => t.id === id)?.messages ?? []
    const m = messages.find((x) => x.id === messageId)
    if (!m || m.kind !== 'edit') return
    const { done, errors } = editAtAnchor(id, [{ oldText: m.after, newText: m.before }], checkedAtAnchor(m, lastEdits(messages)))
    if (!done.length) return appendTo(id, { kind: 'error', text: errors[0] ?? 'Nicht zurückgenommen.' })
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

  /** ⌥⌘T: Schreibzeile auf der Höhe festhalten, auf der der Cursor gerade steht – oder lösen. */
  function toggleWritingLine() {
    const view = viewRef.current
    if (settings.writingLine > 0) return void updateSettings({ writingLine: 0 })
    const percent = view && cursorHeightPercent(view)
    if (percent) void updateSettings({ writingLine: percent })
    view?.focus()
  }
  const toggleWritingLineRef = useRef(toggleWritingLine)
  toggleWritingLineRef.current = toggleWritingLine

  /** Formatierung auf die Auswahl im Manuskript anwenden. */
  function applyFormat(cmd: FormatCommand) {
    const view = viewRef.current
    if (!view || plainTextRef.current) return
    formatCommands[cmd](view)
    view.focus()
  }

  useEffect(
    () =>
      host?.onMenu((command) => {
        if (command === 'askAi') threadFromEditorRef.current()
        if (command === 'settings') setSettingsOpen(true)
        if (command === 'saveVersion') openVersionsRef.current()
        if (command === 'chat') newChatRef.current()
        if (command === 'writingLine') toggleWritingLineRef.current()
        if (command.startsWith('find:') && viewRef.current) runFind(viewRef.current, command.slice(5) as FindCommand)
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
    if (dragging === 'versions') return setVersionsW(clampVersions(e.clientX - rect.left - SPLITTER_WIDTH / 2, rect.width))
    const left = collapsed.versions ? COLLAPSED_WIDTH : versionsW + SPLITTER_WIDTH
    const right = collapsed.side ? COLLAPSED_WIDTH : sideW + SPLITTER_WIDTH
    const width = rect.width - left - right - SPLITTER_WIDTH
    setSplit(clampSplit((e.clientX - rect.left - left) / width))
  }

  /** Gemeinsames Verhalten der Trenner: ziehen, loslassen merkt die Breite, Doppelklick setzt zurück. */
  const splitterProps = (kind: Splitter) => ({
    role: 'separator',
    'aria-orientation': 'vertical' as const,
    title: 'Ziehen zum Ändern der Breite, Doppelklick setzt zurück',
    className: `splitter ${splitters[kind] ? '' : 'hidden'}`,
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      setDragging(kind)
    },
    onPointerMove: onSplitterMove,
    onPointerUp: () => {
      setDragging(null)
      if (kind === 'split') saveSplit(split)
      else if (kind === 'side') saveSideWidth(sideW)
      else saveVersionsWidth(versionsW)
    },
    onDoubleClick: () => {
      if (kind === 'split') {
        setSplit(0.5)
        saveSplit(0.5)
      } else if (kind === 'side') {
        setSideW(SIDE_DEFAULT)
        saveSideWidth(SIDE_DEFAULT)
      } else {
        setVersionsW(VERSIONS_DEFAULT)
        saveVersionsWidth(VERSIONS_DEFAULT)
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
      const result = await host.askAi({ prompt, systemPrompt: forDocument(CHAT_SYSTEM_PROMPT, plainText), schema: CHAT_SCHEMA })
      if (!result.ok) return appendToChat(id, message({ kind: 'error', text: result.error }))
      const answer = parseChatAnswer(result.data)
      setChats((cs) => updateChat(cs, id, (c) => suggestTitle({ ...c, messages: [...c.messages, message({ kind: 'ai', text: answer.reply })] }, answer.title)))
      if (answer.fassung) appendToChat(id, message(await holdFassungForAi(answer.fassung, answer.edits.length > 0)))
      if (answer.edits.length) {
        const { done, errors } = applyChatEdits(answer.edits, chatFocusRef.current.get(id) ?? null)
        // Chat-Änderungen sind an keinen Anker gebunden; ihr Status wird im ganzen Dokument geprüft.
        for (const m of editMessages(done.map((d) => ({ ...d, elsewhere: true })), errors)) appendToChat(id, message(m))
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
   * Führt Chat-Änderungen aus – an der Markierung bzw. Cursorposition, sonst an
   * eindeutigen Textstellen; alle zusammen als ein Undo-Schritt. Die (erste)
   * geänderte Stelle wird im Manuskript markiert.
   */
  function applyChatEdits(edits: EditRequest[], focus: EditorFocus | null): EditOutcome {
    const view = viewRef.current
    if (!view) return { done: [], errors: ['Kein Editor.'] }
    const text = view.state.doc.toString()
    const target = focus ? { ...focus, point: focus.from === focus.to } : { from: 0, to: 0 }
    const { plans, errors } = planEdits(text, target, edits)
    if (!plans.length) return { done: [], errors }
    const [first] = placedRanges(plans)
    view.dispatch({
      changes: plans.map((p) => minimalChange(text, p)),
      selection: { anchor: first.from, head: first.to },
      scrollIntoView: true,
      userEvent: 'input.maid',
    })
    return { done: doneEdits(text, plans), errors }
  }

  function revertChatEdit(id: string, messageId: string) {
    const m = chats.find((c) => c.id === id)?.messages.find((x) => x.id === messageId)
    if (!m || m.kind !== 'edit') return
    const { done, errors } = applyChatEdits([{ oldText: m.after, newText: m.before }], null)
    if (!done.length) return appendToChat(id, message({ kind: 'error', text: `Nicht zurückgenommen: ${errors[0] ?? ''}` }))
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
        style={{ gridTemplateColumns: gridColumns(layout, split, SPLITTER_WIDTH, sideW, versionsW, plainText) }}
      >
        {/* Weggeklappte Spalten bleiben im DOM, damit Editor, Entwürfe und Verlauf erhalten bleiben. */}
        <section className={`pane versions-column ${collapsed.versions ? 'collapsed' : ''}`}>
          {collapsed.versions && <CollapsedStrip title="Fassungen" onExpand={() => togglePane('versions')} />}
          <h2>
            <span className="pane-title">Fassungen</span>
            <CollapseButton disabled={cannotCollapse(layout, 'versions')} onClick={() => togglePane('versions')} />
          </h2>
          <VersionsPane
            versions={versions.versions}
            selectedId={selectedVersionId}
            current={doc}
            available={!!host}
            focusToken={versionFocus}
            onSave={saveVersion}
            aiAvailable={!!host}
            onSuggest={host ? () => suggestVersionMessage(viewRef.current?.state.doc.toString() ?? doc) : undefined}
            onSelect={setSelectedVersionId}
            onRestore={(id) => void restoreVersion(id)}
            onRename={(id, m) => {
              if (file.path) void versions.rename(file.path, id, m)
            }}
            onRemove={(id) => {
              if (file.path) void versions.remove(file.path, id)
              if (selectedVersionId === id) setSelectedVersionId(null)
            }}
          />
        </section>
        <div {...splitterProps('versions')} />
        <section className={`pane manuscript ${collapsed.editor ? 'collapsed' : ''}`}>
          {collapsed.editor && <CollapsedStrip title="Manuskript" onExpand={() => togglePane('editor')} />}
          <h2>
            <span className="pane-title">Manuskript</span>
            {host && (
              <SaveStatus
                hasPath={!!file.path}
                autoSave={settings.autoSave}
                dirty={file.dirty}
                saving={file.saving}
                onToggleSave={() => void updateSettings({ autoSave: !settings.autoSave })}
                autoCommitMinutes={settings.autoCommitMinutes}
                unfixed={doc.trim() !== '' && versions.versions.at(-1)?.text !== doc}
                onToggleCommit={() => void updateSettings({ autoCommitMinutes: settings.autoCommitMinutes > 0 ? 0 : AUTO_COMMIT_DEFAULT })}
              />
            )}
            {!plainText && <FormatToolbar onFormat={applyFormat} />}
            <CollapseButton disabled={cannotCollapse(layout, 'editor')} onClick={() => togglePane('editor')} />
          </h2>
          <div className="editor" ref={editorHost} />
        </section>
        <div {...splitterProps('split')} />
        <section className={`pane preview-pane ${collapsed.preview ? 'collapsed' : ''} ${plainText ? 'gone' : ''}`} aria-hidden={plainText}>
          {collapsed.preview && <CollapsedStrip title="Druckfahne" onExpand={() => togglePane('preview')} />}
          <h2>
            <span className="pane-title">Druckfahne</span>
            <button
              className={`icon sync-toggle ${syncScroll ? 'on' : ''}`}
              title={syncScroll ? 'Mitlaufendes Scrollen ist an – klicken zum Ausschalten' : 'Mitlaufendes Scrollen ist aus – klicken zum Einschalten'}
              aria-label="Mitlaufendes Scrollen"
              aria-pressed={syncScroll}
              onClick={toggleSyncScroll}
            >
              {syncScroll ? <Link2 size={14} /> : <Link2Off size={14} />}
            </button>
            <CollapseButton disabled={cannotCollapse(layout, 'preview')} onClick={() => togglePane('preview')} />
          </h2>
          <Preview
            ref={previewRef}
            model={model}
            onMouseUp={onPreviewMouseUp}
            onClick={onPreviewClick}
            resolveSrc={resolveSrc}
            onImageResize={resizeImage}
          />
        </section>
        <div {...splitterProps('side')} />
        <aside className={`pane threads ${(panel === 'comments' ? activeId : activeChatId) ? 'chat-open' : ''} ${collapsed.side ? 'collapsed' : ''}`}>
          {collapsed.side && (
            <CollapsedStrip title={PANEL_TITLE[panel]} onExpand={() => togglePane('side')} />
          )}
          <div className="panel-tabs" role="tablist">
            <button role="tab" aria-selected={panel === 'comments'} className={panel === 'comments' ? 'active' : ''} onClick={() => setPanel('comments')}>
              <MessageSquareText size={14} /> Kommentare
            </button>
            <button role="tab" aria-selected={panel === 'chat'} className={panel === 'chat' ? 'active' : ''} onClick={() => showSide('chat')}>
              <MessagesSquare size={14} /> Chat
              {chatBusy.size > 0 && panel !== 'chat' && <span className="dot" title="Claude antwortet" />}
            </button>
            <CollapseButton disabled={cannotCollapse(layout, 'side')} onClick={() => togglePane('side')} />
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
        <div className="popover" ref={popoverRef} style={{ visibility: 'hidden' }}>
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
