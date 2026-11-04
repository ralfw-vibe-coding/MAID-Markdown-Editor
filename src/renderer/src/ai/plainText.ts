/**
 * Textmodus: Dokumente mit der Endung .txt sind reiner Text. MAID zeigt dann
 * keine Druckfahne und keine Markdown-Hervorhebung, und Claude erfährt es.
 */
export const isPlainTextPath = (path: string | null) => !!path && /\.txt$/i.test(path)

export const PLAIN_TEXT_RULES = `
Wichtig: Dieses Dokument ist reiner Text (eine .txt-Datei), kein Markdown. Wo oben von Markdown-Quelltext die Rede ist, ist hier der reine Text gemeint. Schreib in "newText" keine Markdown-Auszeichnungen (**, *, #, [](), \`), die nicht schon genau so im Text stehen – Hervorhebungen gibt es in reinem Text nicht. "reply" darfst du weiter in Markdown formatieren.`

/** Systemprompt für das Dokument: bei reinem Text um den Hinweis ergänzt. */
export const forDocument = (systemPrompt: string, plainText: boolean) => (plainText ? systemPrompt + '\n' + PLAIN_TEXT_RULES : systemPrompt)
