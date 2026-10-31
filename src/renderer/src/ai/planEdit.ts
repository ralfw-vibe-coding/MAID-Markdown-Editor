export type EditPlan = {
  /** Bereich im aktuellen Dokument, der ersetzt wird. */
  from: number
  to: number
  insert: string
  /** Die Änderung liegt nicht an der kommentierten Stelle, sondern woanders im Dokument. */
  elsewhere?: boolean
}

/**
 * Plant eine Ersetzung von `oldText` durch `newText` an der Stelle eines Ankers.
 * Vorrang hat ein Vorkommen von `oldText`, das den Anker überlappt. Gibt es
 * keins, darf die Änderung woanders liegen (im Thread besprochen, z. B. „füge
 * das in Abschnitt 1 ein“) – aber nur, wenn `oldText` im ganzen Dokument genau
 * einmal vorkommt. Sonst wird nicht blind ersetzt. Leeres `oldText` meint
 * genau den Anker – an einer Einfügemarke also: `newText` dort einfügen.
 */
export function planEdit(
  doc: string,
  anchor: { from: number; to: number; point?: boolean },
  oldText: string,
  newText: string,
): EditPlan | { error: string } {
  const placed = anchor.from < anchor.to || !!anchor.point
  if (oldText === '') {
    if (!placed) return { error: 'Die kommentierte Stelle ist nicht mehr im Dokument. Nichts geändert.' }
    oldText = doc.slice(anchor.from, anchor.to)
  }
  if (oldText === newText) return { error: 'Die Änderung würde nichts verändern.' }
  if (oldText === '') return { from: anchor.from, to: anchor.from, insert: newText }

  // Ein Textbereich muss überlappt, eine Einfügemarke berührt werden – zwischen
  // Ausschnitt und Marke darf höchstens Leerraum liegen (z. B. der Zeilenumbruch am Textende).
  const onlySpace = (a: number, b: number) => /^\s*$/.test(doc.slice(a, b))
  const touches = (i: number) => {
    if (!placed) return false
    const end = i + oldText.length
    if (!anchor.point) return i < anchor.to && end > anchor.from
    return (i <= anchor.from || onlySpace(anchor.from, i)) && (end >= anchor.from || onlySpace(end, anchor.from))
  }
  const all: number[] = []
  for (let i = doc.indexOf(oldText); i >= 0; i = doc.indexOf(oldText, i + 1)) all.push(i)
  const atAnchor = all.filter(touches)

  if (atAnchor.length === 1) return { from: atAnchor[0], to: atAnchor[0] + oldText.length, insert: newText }
  if (atAnchor.length > 1) return { error: 'Der zu ersetzende Text kommt an der kommentierten Stelle mehrfach vor – unklar, welches Vorkommen gemeint ist. Nichts geändert.' }
  if (all.length === 1) return { from: all[0], to: all[0] + oldText.length, insert: newText, elsewhere: true }
  if (all.length > 1) {
    return { error: `Der zu ersetzende Text („${excerpt(oldText)}“) steht nicht an der kommentierten Stelle und kommt im Dokument ${all.length}-mal vor – unklar, wo geändert werden soll. Nichts geändert.` }
  }
  return { error: `Der zu ersetzende Text („${excerpt(oldText)}“) kommt im Dokument nicht vor – vermutlich wurde er inzwischen geändert. Nichts geändert.` }
}

const excerpt = (s: string) => (s.length > 60 ? `${s.slice(0, 57).trimEnd()} …` : s).replace(/\s+/g, ' ')

/**
 * Verkleinert eine Ersetzung auf den tatsächlich veränderten Teil, damit
 * andere Anker im unveränderten Rest nicht verschoben oder geleert werden.
 */
export function minimalChange(doc: string, plan: EditPlan): EditPlan {
  const old = doc.slice(plan.from, plan.to)
  const ins = plan.insert
  let pre = 0
  while (pre < old.length && pre < ins.length && old[pre] === ins[pre]) pre++
  let suf = 0
  while (suf < old.length - pre && suf < ins.length - pre && old[old.length - 1 - suf] === ins[ins.length - 1 - suf]) suf++
  return { from: plan.from + pre, to: plan.to - suf, insert: ins.slice(pre, ins.length - suf) }
}
