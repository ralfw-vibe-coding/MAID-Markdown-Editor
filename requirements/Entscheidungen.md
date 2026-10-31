# MAID – Entscheidungen

Ergänzt die [Anforderungsskizze](MAID_Anforderungsskizze.md). Stand: 30. Oktober 2026.

## E1 · Desktop-Hülle: Electron

Electron (mit electron-vite), nicht Tauri.

- Eine Sprache (TypeScript) für Oberfläche, Hauptprozess und KI-Anbindung.
- Chromium verhält sich bei Selection/Range genauso wie der Browser, in dem der PoC entsteht.
- Claude CLI bzw. Agent SDK direkt aus Node nutzbar.
- Größeres Bundle (~100 MB) ist für ein lokales Werkzeug unerheblich.

Der Proof of Concept läuft zunächst als reine Web-App (Vite + React) im Browser und wird danach in Electron eingebettet.

## E2 · Kommentare: sichtbare Begleitdatei neben dem Dokument

`text.md` → `text.md.maid.json` im selben Ordner. Enthält Threads, Anker, Nachrichten, Änderungsprotokoll und einen Hash des Dokumentinhalts zum Zeitpunkt des Speicherns. Sichtbar, damit beim Kopieren/Weitergeben offensichtlich ist, dass sie dazugehört.

## E3 · Ausführungsfreigabe

Es gibt kein festes Zauberwort. Der Nutzer sagt im Thread oder Chat in eigenen Worten, dass die KI die besprochene Änderung jetzt umsetzen soll; zusätzlich gibt es einen Button dafür.

- Jede KI-Antwort ist entweder nur eine Antwort oder eine Antwort plus konkrete Änderung (`oldText` → `newText`).
- Eine Änderung darf die KI nur liefern, wenn die letzte Nutzernachricht erkennbar einen Ausführungsauftrag enthält oder der Button gedrückt wurde. Ist unklar, *was* geändert werden soll, fragt sie nach.
- MAID wendet die Änderung sofort an (nach Bereichsprüfung), zeigt den Diff im Thread und ermöglicht Undo.
- Die KI hat keine Datei-Tools; MAID führt alle Änderungen selbst aus.

## E4 · Markdown-Umfang

CommonMark + GFM (Tabellen, Tasklisten, Durchstreichen, Autolinks). Fußnoten, Frontmatter, Mathe, Mermaid vorerst nicht. Keine zeichenverändernden Transformationen (z. B. Smartypants).

Ergänzt (31.10.2026) um zwei verbreitete Erweiterungen, wie in Obsidian/MacDown: `==Hervorhebung==` und die Inline-Tags `<u>…</u>` (unterstrichen) und `<mark>…</mark>`. Andere Programme zeigen sie ggf. als Rohtext.

## E5 · Offsets

Alle Positionen sind UTF-16-Code-Unit-Offsets in den Markdown-Quelltext (wie JS-Strings, CodeMirror und micromark). Positionslogik lebt ausschließlich in TypeScript.

## E6 · Bilder

- Eingefügte Bilder (Zwischenablage, Ziehen) liegen neben dem Dokument im Ordner `<Name ohne .md> - Images`, z. B. `test gedicht.md` → `test gedicht - Images/bild-2026-10-31-181220.png`.
- Verweis im Markdown relativ, in spitzen Klammern wegen der Leerzeichen: `![](<test gedicht - Images/bild-….png>)`.
- Anzeigebreite in der Druckfahne wie in Obsidian im Alt-Text: `![Foto|300](…)`. Andere Markdown-Programme zeigen das Bild trotzdem; nur der Alt-Text enthält dann „|300“.
- Ein neues, noch nie gesichertes Dokument wird vor dem ersten Bild gesichert – sonst gäbe es keinen Ort für den Bilderordner.

## E7 · Versionen ohne git

- „Ablage › Version sichern …“ (⌥⌘S) sichert den jetzigen Stand des Manuskripts mit einer Nachricht (wie eine Commit-Nachricht); Claude kann sie aus den Änderungen vorschlagen.
- Versionen liegen in `<dokument>.md.versions.json` neben dem Dokument – getrennt von der Begleitdatei, damit ⌘S schnell bleibt. Volle Textstände, keine Deltas.
- Eigene Spalte „Versionen“ (links, standardmäßig eingeklappt): oben sichern, darunter ein Zeitstrahl (maßstäblich bis „jetzt“), die Liste (Nachricht, Zeit, +/− Wörter) und für die gewählte Version ein absatzweiser, wortgenauer Vergleich („Seitdem“ bzw. „Diese Version“ gegenüber der vorherigen). Das KI-Panel bleibt bei Kommentaren und Chat, die Druckfahne bei der Druckfahne.
- „Zurück zu dieser Version“ sichert den jetzigen Stand vorher automatisch (falls noch nicht gesichert) und ändert nur die abweichenden Zeilen – als ein Undo-Schritt; Kommentare in unveränderten Teilen bleiben verankert.
- Bilder sind nur additiv: Der Bilderordner wird nie aufgeräumt, auch wenn eine neuere Version ein Bild nicht mehr verwendet. So findet jede alte Version ihre Bilder.

## E8 · Speichern und Fassungen

- **Speichern** (⌘S, „Speichern unter …“ ⇧⌘S) schreibt die Datei. Standardmäßig **automatisch**: nach kurzer Tipppause, beim Wechsel in ein anderes Programm und beim Schließen (nur Dokumente mit Dateinamen). Anzeige im Kopf des Manuskripts („Auto gespeichert“ bzw. „● nicht gespeichert“), Klick schaltet um; auch in den Einstellungen.
- **Festhalten** (⌥⌘S, Menü „Fassung festhalten …“) legt eine **Fassung** an – das, was in git ein Commit wäre. Die Spalte heißt „Fassungen“.
- Leere Bezeichnung beim Festhalten: Claude benennt die Fassung nach dem inhaltlichen Kern der Änderungen (Wirkung auf Aussage, Ton, Aufbau), nicht nach geänderten Wörtern.
- **Automatische Fassungen** alle x Minuten (Einstellung, Standard 15, 0 = aus), nur wenn sich seit der letzten Fassung etwas geändert hat – als Protokoll des Schreibfortschritts. Sie erscheinen als hohle Punkte und „Automatisch festgehalten“; bewusst festgehaltene Fassungen sind die bedeutsamen.

