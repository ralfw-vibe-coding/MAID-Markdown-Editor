# MAID – Backlog

Wünsche und Punkte, die noch nicht eingeplant sind, aber nicht verloren gehen sollen.

- **Schrift einstellbar:** Schriftart und -größe für Manuskript und Druckfahne getrennt einstellen können (Wunsch vom 30.10.2026).
- **Menü eindeutschen:** Electron-Standardeinträge („Open Recent“, „Close Window“, Bearbeiten-, Darstellung-, Fenster-Menü) erscheinen noch englisch.
- **Undo über das Menü:** ⌘Z per Tastatur wirkt im Editor; ob „Bearbeiten › Widerrufen“ per Mausklick im Menü bei CodeMirror ankommt, ist ungeprüft. Ggf. eigene Menüeinträge, die Undo/Redo an den Editor weiterreichen.
- **Externe Änderungen erkennen:** Wird die geöffnete Datei außerhalb von MAID geändert, Konflikt erkennen und anbieten, neu zu laden.
- **App-Paket:** Eigenes App-Icon, Name „MAID“ statt „Electron“, `.md`-Dateizuordnung im Finder (electron-builder). Nebenbei: Solange MAID als „Electron“ läuft, ist es für Automatisierung nicht von anderen Electron-Entwicklungs-Apps zu unterscheiden.
- **Normalisierung vor Ersetzung:** Vor einer programmgesteuerten Ersetzung den Bereich auf ganze Inline-Knoten erweitern, damit kein kaputtes Markdown (halbe `**`) entsteht. Derzeit sorgt der Lektor-Prompt dafür.
- **KI-Antworten streamen:** Antwort wortweise anzeigen statt nach ~4–10 s am Stück.
- **KI-Kontext begrenzen:** Bei sehr langen Dokumenten nur Abschnitt + Gliederung mitschicken; sichtbar machen, was die KI sieht.
- **Mehrere Änderungsvorschläge:** Varianten im Thread anbieten und eine davon übernehmen.
