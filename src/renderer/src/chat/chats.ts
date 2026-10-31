import type { Message } from '../thread/thread'

/** Ein freier Chat zum Dokument. Es kann beliebig viele geben. */
export type Chat = {
  id: string
  /** Von Claude aus dem Inhalt vorgeschlagen, vom Autor änderbar; leer = noch keiner. */
  title: string
  /** Der Autor hat den Titel selbst gesetzt – dann schlägt Claude keinen mehr vor. */
  titleByUser?: boolean
  createdAt: string
  messages: Message[]
}

export const UNTITLED = 'Neuer Chat'

export function createChat(): Chat {
  return { id: crypto.randomUUID(), title: '', createdAt: new Date().toISOString(), messages: [] }
}

export function updateChat(chats: Chat[], id: string, f: (c: Chat) => Chat): Chat[] {
  return chats.map((c) => (c.id === id ? f(c) : c))
}

/** Übernimmt Claudes Titelvorschlag nur, solange der Chat noch keinen Titel hat. */
export function suggestTitle(chat: Chat, title: string | undefined): Chat {
  const t = title?.trim().replace(/^["„“]|["“”]$/g, '')
  return t && !chat.title && !chat.titleByUser ? { ...chat, title: t.slice(0, 60) } : chat
}

export function renameChat(chat: Chat, title: string): Chat {
  const t = title.trim()
  return t ? { ...chat, title: t, titleByUser: true } : { ...chat, title: '', titleByUser: false }
}
