/**
 * Anzeigegröße eines Bildes, notiert wie in Obsidian im Alt-Text:
 * `![Foto|300](bild.png)` = 300 px breit. Andere Markdown-Programme zeigen
 * das Bild trotzdem; nur der Alt-Text enthält dann „|300“.
 */
const SIZE = /^(.*?)\|(\d{1,4})$/s

export function parseAltSize(alt: string): { alt: string; width?: number } {
  const m = SIZE.exec(alt)
  return m ? { alt: m[1], width: Number(m[2]) } : { alt }
}

/** Alt-Text eines Bild-Quelltexts `![alt](…)` bzw. `![alt][ref]`, mit Escapes. */
const ALT = /^!\[((?:\\.|[^\]\\])*)\]/

/**
 * Setzt die Anzeigebreite im Markdown-Quelltext eines Bildes; `null` entfernt
 * sie (Originalgröße). Der Rest (Pfad, Titel) bleibt unverändert.
 */
export function setImageWidth(source: string, width: number | null): string {
  const m = ALT.exec(source)
  if (!m) return source
  const base = parseAltSize(m[1]).alt
  const alt = width === null ? base : `${base}|${Math.round(width)}`
  return `![${alt}]` + source.slice(m[0].length)
}

/** Markdown-Bildverweis auf einen relativen Pfad; spitze Klammern erlauben Leerzeichen im Pfad. */
export function imageMarkdown(relativePath: string, alt = ''): string {
  return `![${alt}](<${relativePath}>)`
}

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/tiff': 'tiff',
  'image/bmp': 'bmp',
}

/** Dateiendung für ein eingefügtes Bild – aus dem Typ, sonst aus dem Dateinamen. */
export function imageExtension(file: { type: string; name: string }): string | null {
  return MIME_EXT[file.type] ?? (/\.([a-z0-9]+)$/i.exec(file.name)?.[1].toLowerCase() || null)
}
