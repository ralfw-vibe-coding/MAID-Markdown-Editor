export type EditPlan = {
  /** Bereich im aktuellen Dokument, der ersetzt wird. */
  from: number
  to: number
  insert: string
}

/**
 * Plant eine Ersetzung von `oldText` durch `newText` an der Stelle eines Ankers.
 * `oldText` muss im aktuellen Dokument genau einmal so vorkommen, dass es den
 * Anker überlappt – sonst wird nicht blind ersetzt (z. B. weil der Autor die
 * Stelle inzwischen geändert hat). Leeres `oldText` meint genau den Anker –
 * an einer Einfügemarke also: `newText` dort einfügen.
 */
export function planEdit(
  doc: string,
  anchor: { from: number; to: number; point?: boolean },
  oldText: string,
  newText: string,
): EditPlan | { error: string } {
  if (anchor.from >= anchor.to && !anchor.point) return { error: 'Die kommentierte Stelle ist nicht mehr im Dokument.' }
  if (oldText === '') oldText = doc.slice(anchor.from, anchor.to)
  if (oldText === newText) return { error: 'Die Änderung würde nichts verändern.' }
  if (oldText === '') return { from: anchor.from, to: anchor.from, insert: newText }

  // Ein Textbereich muss überlappt, eine Einfügemarke berührt werden – zwischen
  // Ausschnitt und Marke darf höchstens Leerraum liegen (z. B. der Zeilenumbruch am Textende).
  const onlySpace = (a: number, b: number) => /^\s*$/.test(doc.slice(a, b))
  const touches = (i: number) => {
    const end = i + oldText.length
    if (!anchor.point) return i < anchor.to && end > anchor.from
    return (i <= anchor.from || onlySpace(anchor.from, i)) && (end >= anchor.from || onlySpace(end, anchor.from))
  }
  const hits: number[] = []
  for (let i = doc.indexOf(oldText); i >= 0; i = doc.indexOf(oldText, i + 1)) {
    if (touches(i)) hits.push(i)
  }
  if (hits.length === 0) {
    return { error: 'Der zu ersetzende Text steht so nicht (mehr) an der kommentierten Stelle. Nichts geändert.' }
  }
  if (hits.length > 1) return { error: 'Der zu ersetzende Text ist an der Stelle nicht eindeutig. Nichts geändert.' }
  return { from: hits[0], to: hits[0] + oldText.length, insert: newText }
}

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
