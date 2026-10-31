import { net, protocol } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { IMAGE_EXTENSIONS, imagesFolderName, LOCAL_FILE_SCHEME } from '../shared/host'

/** Muss vor `app.ready` laufen. */
export function registerLocalFileScheme() {
  protocol.registerSchemesAsPrivileged([
    { scheme: LOCAL_FILE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  ])
}

/**
 * Liefert lokale Bilder für die Druckfahne aus – ausschließlich Bilddateien,
 * damit über das Protokoll nichts anderes von der Platte gelesen werden kann.
 */
export function handleLocalFileScheme() {
  protocol.handle(LOCAL_FILE_SCHEME, (request) => {
    const path = decodeURIComponent(new URL(request.url).pathname)
    const ext = extname(path).slice(1).toLowerCase()
    if (!isAbsolute(path) || !IMAGE_EXTENSIONS.includes(ext)) return new Response('Nur Bilder', { status: 403 })
    return net.fetch(pathToFileURL(path).toString())
  })
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Legt ein Bild im Bilderordner des Dokuments ab; liefert den Pfad relativ zum Dokument. */
export async function saveImage(documentPath: string, data: Uint8Array, extension: string): Promise<string> {
  const ext = extension.toLowerCase().replace(/^\./, '')
  if (!IMAGE_EXTENSIONS.includes(ext)) throw new Error(`Kein unterstütztes Bildformat: ${extension}`)
  const folder = imagesFolderName(basename(documentPath))
  const dir = join(dirname(documentPath), folder)
  await mkdir(dir, { recursive: true })
  const d = new Date()
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  for (let n = 1; ; n++) {
    const name = `bild-${stamp}${n > 1 ? `-${n}` : ''}.${ext}`
    try {
      // „wx“: nie eine vorhandene Datei überschreiben
      await writeFile(join(dir, name), data, { flag: 'wx' })
      return `${folder}/${name}`
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
    }
  }
}
