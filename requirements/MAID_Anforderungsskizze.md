# MAID – AI Augmented Markdown Editor

**Anforderungsskizze · Version 0.1 · 30. Oktober 2026**  
**Status:** Konzept / Diskussionsgrundlage

## 1. Leitidee

**MAID ist ein schlanker, lokaler Markdown-Editor mit einer intelligenten, punktgenau kommentierbaren Druckfahne.**

Die Anwendung trennt bewusst zwei Tätigkeiten:

- **Markdown-Editor = Manuskript:** Hier wird geschrieben und der tatsächliche Quelltext geändert – durch den Autor oder auf dessen ausdrücklichen Wunsch durch die KI.
- **Preview = Druckfahne:** Hier wird gelesen, punktgenau markiert, kommentiert, diskutiert und redaktionell entschieden. **Die Preview ist kein WYSIWYG-Editor.**

Die KI ist nicht bloß eine Chat-Seitenleiste. Sie ist ein **Lektor und, nach Freigabe, ein Bearbeiter des Manuskripts**. Ein Kommentar-Thread begleitet eine *Textstelle über mehrere Fassungen hinweg*.

**Produktversprechen:** Der Nutzer kann in der Preview eine Textstelle markieren, mit der KI darüber diskutieren und „Go!“ sagen. MAID ändert daraufhin gezielt das Markdown. Die Preview zeigt sofort die neue Fassung; derselbe Kommentar-Thread bleibt mit der überarbeiteten Stelle verbunden.

## 2. Gestaltungsprinzipien

1. **Markdown ist die einzige maßgebliche Dokumentfassung (Single Source of Truth).** Keine zweite, eigenständig editierbare Rich-Text-Repräsentation.
2. **Keine WYSIWYG-Bearbeitung.** Markieren und Kommentieren in der Preview ja; freie Texteingabe in den gerenderten Dokumentkörper nein.
3. **Punktgenaue Diskussionen.** Kommentare beziehen sich möglichst auf exakt ausgewählte Wörter, Halbsätze oder Passagen, nicht nur pauschal auf einen Absatz.
4. **KI ändert Text nur auf ausdrücklichen Auftrag.** Eine Diskussion allein darf keine unerwartete Änderung auslösen. „Go!“ ist eine Freigabe zur vereinbarten Bearbeitung.
5. **Änderungen sind nachvollziehbar und reversibel.** Jeder KI-Eingriff besitzt eine dokumentierte Vorher-/Nachher-Fassung; Undo und gezieltes Zurücknehmen sind möglich.
6. **Kommentare leben außerhalb des Markdown-Quelltexts.** Das `.md` bleibt sauber, portabel und mit anderen Editoren lesbar.
7. **Local first.** Dateien, Bilder und Kommentare bleiben zunächst lokal. Keine Cloud oder Zusammenarbeit als Grundvoraussetzung.
8. **Einfacher Kern, tiefe Zusammenarbeit.** Keine Videos, kein eigenes Markdown-Format und keine unnötige Funktionsfülle.

## 3. Oberfläche und Rollen

### 3.1 Markdown-Editor – das Manuskript

- Quelltexteditor mit Syntax-Highlighting, typischen Markdown-Tastenkürzeln und Undo/Redo.
- `.md`-Dateien öffnen, neu anlegen und speichern.
- Direkte Bearbeitung durch den Nutzer.
- KI kann auf ausdrückliche Anweisung Text an einer definierten Stelle einfügen, ersetzen oder umstrukturieren.
- Alle KI-Bearbeitungen laufen durch dieselbe kontrollierte Änderungslogik wie andere Editor-Transaktionen.

### 3.2 Live-Preview – die Druckfahne

- Aktuelle, gerenderte Markdown-Fassung; automatische Aktualisierung beim Schreiben.
- Text in der Preview normal markieren, einschließlich Teilbereichen innerhalb eines Absatzes.
- Kontextaktion „Kommentieren“ oder „Mit KI besprechen“ für die aktuelle Auswahl.
- Bestehende Kommentaranker sichtbar machen, aber die Lesbarkeit der Druckfahne bewahren.
- Beim Öffnen eines Threads die betroffene **aktuelle** Textstelle hervorheben und gegebenenfalls ins Sichtfeld scrollen.
- Nach einer übernommenen Änderung die **neue** Fassung anzeigen, nicht dauerhaft einen diffgefärbten Dokumentkörper.
- Optionaler Modus „Änderungen zeigen“: neue Passage hervorheben und im Thread einen Vorher-/Nachher-Diff anzeigen.

**Die Preview ist eine Review- und Navigationsoberfläche, nicht die Stelle, an der Markdown direkt editiert wird.**

### 3.3 KI-Chat und Kommentar-Threads

Es gibt zwei sich ergänzende Kommunikationsformen:

| Form | Kontext | Aufgabe |
| --- | --- | --- |
| **Lokaler Thread** | Exakt markierte Textstelle plus nötiger Dokumentkontext | Fragen, Diskussion, Formulierungsvorschläge, gezielte Überarbeitung |
| **Globaler Chat** | Aktuelles Dokument, bei Freigabe auch weitere Dateien | Übergreifende Fragen, Strukturkritik, Schreib- und Überarbeitungsaufträge |

- Ein lokaler Thread enthält Nachrichten des Autors und der KI sowie ggf. mehrere Änderungsvorschläge.
- Der Thread bleibt auch nach einer Änderung an die fortentwickelte Stelle gebunden.
- Der globale Chat kann auf Wunsch aus einer Analyse konkrete, im Dokument verankerte Kommentare erzeugen (spätere Ausbaustufe).
- Keine dauerhaft erzwungene Dreispaltenoberfläche: Editor und Preview bleiben die Hauptansichten; Thread bzw. Chat erscheinen kontextbezogen als Panel.

## 4. Kernablauf: markieren → diskutieren → „Go!“ → weiterreden

1. Der Nutzer **markiert** im gerenderten Dokument ein Wort, einen Halbsatz oder eine längere Passage.
2. MAID legt einen **präzisen Kommentaranker** für diese Textstelle an.
3. Der Nutzer verfasst einen Kommentar: z. B. „Das ist zu absolut. Ich meine eher Zusammenarbeit als Automatisierung.“
4. Die KI antwortet im **lokalen Thread**, fragt ggf. nach oder macht einen Formulierungsvorschlag. Der Markdown-Text bleibt zunächst unverändert.
5. Mensch und KI **diskutieren** weiter, bis eine gewünschte Änderung klar ist.
6. Mit **„Go!“** gibt der Nutzer die konkrete Änderung frei. Die KI bzw. der Änderungscontroller erstellt eine gezielte Bearbeitung des aktuellen Markdown-Texts.
7. MAID **prüft den Zielbereich und die Dokumentversion**, führt die Änderung als kontrollierte Editor-Transaktion aus und protokolliert sie. Bei Mehrdeutigkeit oder inzwischen veränderter Textgrundlage wird nicht blind ersetzt.
8. Die **Preview rendert die neue Fassung**. Eine temporäre Hervorhebung zeigt, was gerade verändert wurde.
9. Der **gleiche Thread bleibt an der neuen Fassung verankert**. Der Nutzer kann weiterdiskutieren, erneut „Go!“ sagen oder den Thread abschließen.
10. Ein **Diff im Thread** zeigt bei Bedarf die ursprüngliche und neue Formulierung; Änderungen sind rücknehmbar.

### Wichtige semantische Regel für „Go!“

„Go!“ bedeutet: **Führe die zuletzt besprochene, hinreichend eindeutig bestimmte Änderung aus.** Nicht: „Erzeuge bloß noch einen unverbindlichen Vorschlag.“ Wenn keine eindeutige Änderung vorliegt, fragt die KI nach, statt eigenmächtig zu raten. Fehlerhafte oder veraltete Zielbereiche blockieren die Ausführung.

## 5. Kommentaranker: zentrale technische Anforderung

**Das technisch schwierigste Teilproblem ist die stabile Verknüpfung von gerenderter Preview, Markdown-Quelltext und sich änderndem Dokument.** Die Position eines sichtbaren Wortes ist nicht die gleiche wie seine Zeichenposition im Markdown: Syntax wie `##`, `**`, Links, Escapes oder eingebettete Elemente verändert die Offsets.

### 5.1 Markierungen in Quelltextbereiche übersetzen

- Markdown durch einen Parser mit **Quellpositionen** in einen Syntaxbaum überführen, z. B. remark/mdast mit geeigneten feineren Positionierungsinformationen.
- Beim Rendern die Zuordnung zwischen sichtbaren Textsegmenten und relevanten Markdown-Quellbereichen erhalten.
- Eine Browser-Selection in der Preview auf die entsprechenden Quelltextbereiche zurückführen.
- Inline-Formatierungen, Links, Escapes, Unicode und Markierungen über mehrere DOM-Textknoten ausdrücklich berücksichtigen.
- **AST-Start-/Endpositionen allein reichen für beliebige zeichenexakte Markierungen nicht aus**; für diese braucht MAID zusätzliche Segment-/Offset-Mappings.

### 5.2 Anker über Änderungen fortschreiben

Ein Kommentaranker speichert nicht nur zwei rohe Zahlen. Vorgesehen ist eine Kombination aus:

- aktuellem Quelltextbereich (`from`, `to`) und zugehöriger Dokumentrevision,
- markiertem Wortlaut (Zitat),
- umgebendem Textkontext (Präfix/Suffix),
- optional strukturellem Bezug zu Markdown-Knoten oder Abschnitten,
- Thread-ID und Ankerstatus (gültig, fraglich, verwaist).

Änderungen werden anhand ihrer Operationen nachgeführt:

- **Einfügen vor dem Anker:** Quellpositionen nachführen (z. B. mit CodeMirror-Change-Mapping).
- **Änderung andernorts:** Anker beibehalten bzw. an neue Offsets mappen.
- **KI ersetzt kommentierte Stelle:** Anker *explizit* auf den eingesetzten Ersatztext setzen – MAID kennt die Ausgangs- und Zielbereiche dieser Operation.
- **Manuelle Bearbeitung im markierten Bereich:** Anker möglichst auf den erhaltenen/überarbeiteten Text nachführen und bei Unsicherheit kenntlich machen.
- **Verschieben, externe Bearbeitung oder größere Umstrukturierung:** Mit Zitat, Kontext und Struktur neu zuordnen; mehrdeutige Treffer nicht stillschweigend akzeptieren.
- **Vollständige Löschung:** Thread bleibt historisch erhalten und wird ggf. als „Anker verloren“ angezeigt.

**Produktregel:** Lieber einen sichtbar verwaisten Kommentar als einen unbemerkt an der falschen Textstelle.

### 5.3 Kommentar und Text sind verschiedene Datenebenen

- Im `.md` steht **nur Dokumentinhalt**; keine erzwungenen Inline-Kommentar-IDs oder versteckten Annotationstags.
- Kommentar-Threads, Anker, Nachrichten und Änderungshistorie liegen zunächst in einer **separaten lokalen Begleitdatei** (z. B. JSON) oder in einer lokalen Datenbank.
- Die Anwendung muss auch ohne diese Metadaten jedes `.md` normal öffnen können.
- Ein dokumentierter Mechanismus für das Mitnehmen der Kommentare beim Verschieben/Kopieren des Dokuments ist vorzusehen.

## 6. KI-Änderungen, Diffs und Versionierung

**Diff ist nicht gleich Anker.** Diffs zeigen, *was* sich geändert hat; Anker zeigen, *worüber* ein Thread aktuell spricht. Beide Mechanismen ergänzen einander.

- KI-Änderungen möglichst als **präzise Textoperationen** auf Quelltextbereichen statt als blinde Komplettüberschreibung des Dokuments.
- Vor dem Anwenden prüfen, ob die verwendete Dokumentrevision noch aktuell ist; ansonsten kontrolliert neu planen oder Konflikt anzeigen.
- Änderung als **atomare Editor-Transaktion** mit sinnvoller Undo-Historie einspielen.
- Vorher-/Nachher-Text und betroffene Bereiche im Thread protokollieren.
- Klassische Markdown-/Text-Diffs für Überprüfung und Historie nutzen (Git-artiges `-`/`+`-Modell).
- In der Preview standardmäßig **nur die aktuelle gerenderte Fassung** zeigen; Diffs im Thread oder optionalen Änderungsmodus darstellen.
- Später optional eine dokumentweite Änderungsübersicht, selektives Zurücknehmen einzelner KI-Edits und Git-Integration anbieten.

**Git selbst ist keine Voraussetzung.** Diff- und Änderungsoperationen können unabhängig von einem Repository funktionieren.

## 7. KI-Integration und Rechte

### 7.1 Ausgangspunkt

- **Claude CLI / Claude Code darf als lokale Voraussetzung gelten.** Keine eigene Modellplattform oder Accountverwaltung im MVP nötig.
- Programmgesteuerte Kommunikation, z. B. über CLI-Aufrufe oder ein geeignetes Claude Agent SDK, prüfen.
- Die KI erhält den relevanten Thread, die markierte Textstelle, nötigen Kontext und die aktuelle Dokumentrevision.

### 7.2 Rollen und Berechtigungen

- **Lektor-/Diskussionsmodus:** lesen, kommentieren, Fragen beantworten und Textvorschläge machen; kein Schreibzugriff auf das Dokument ohne explizite Freigabe.
- **Freigegebene Bearbeitung:** nach „Go!“ gezielte Änderung des Manuskripts über den MAID-Änderungscontroller.
- **Globaler Schreibauftrag:** Der Nutzer kann die KI ausdrücklich beauftragen, größere Passagen oder mehrere Abschnitte zu bearbeiten; entsprechende Änderungen bleiben nachvollziehbar.
- **Optionaler Agent-Modus (später):** Arbeiten über mehrere freigegebene Dateien, Quellen und Ordner hinweg mit klaren Rechten.

Die KI sollte nicht unkoordiniert dieselbe Datei auf der Festplatte überschreiben, während ungespeicherte Änderungen im Editor liegen. **MAID verwaltet den aktuellen Arbeitsstand und führt genehmigte Änderungen selbst kontrolliert aus.** Externe Dateiänderungen erfordern Konflikterkennung.

## 8. Bilder und Markdown-Grundfunktionen

### Muss für den ersten brauchbaren Editor

- Syntax-Highlighting und gewohnte Markdown-Bearbeitung.
- Live-Preview für übliches Markdown (Überschriften, Listen, Links, Tabellen, Code, Bilder etc.).
- **Bilder in der Preview darstellen**; Bilder müssen zunächst *nicht* im Markdown-Editor selbst visuell erscheinen.
- Bilder per Drag & Drop, Zwischenablage (`Cmd+V`) und Dateiauswahl einfügen.
- Beim Einfügen lokal speichern, vorzugsweise in einem dokumentnahen `assets/`-Ordner, und relative Markdown-Bildpfade erzeugen.
- `.md`-Dateien lesen und schreiben; Bilder und Pfade müssen nach Neustart und beim Weitergeben funktionieren.
- Lokaler macOS-Desktop-Betrieb.

### Optionale KI-Bildfunktionen (später)

- Alt-Text und Bildunterschriften vorschlagen.
- Bildverweise und unbenutzte Bilder prüfen.
- Im lokalen Bildbestand nach Motiven suchen und geeignete Bilder zu Textstellen empfehlen.

**Videos sind ausdrücklich nicht Teil des angestrebten Umfangs.**

## 9. Technische Ausgangshypothese

Ein pragmatischer möglicher Stack, nicht bereits eine endgültige Festlegung:

| Aufgabe | Möglicher Baustein |
| --- | --- |
| Markdown-Quelltexteditor | CodeMirror 6 |
| Parsing mit Struktur-/Quellpositionen | unified / remark / mdast, bei Bedarf micromark |
| Preview-Oberfläche und Kommentar-UI | React |
| Lokale macOS-Desktop-App und Dateizugriff | Tauri 2 |
| KI-Laufzeit | Claude CLI oder Claude Agent SDK |
| Anker-Nachführung für Editor-Edits | CodeMirror-Change-Mapping plus eigener Anker-Controller |
| Diffs | Text-Diff-Bibliothek plus transaktionsbasierte Änderungsprotokolle |
| Persistenz der Kommentare | JSON-Sidecar oder lokale Datenbank |

Die konkrete Parser-/Renderer-Kombination muss **vor** einer breiten UI-Implementierung an echter punktgenauer Selektion getestet werden. Die Quelltext-/Preview-Zuordnung ist das wesentliche technische Risiko.

## 10. MVP, technische Vorstufe und Ausbau

### Technischer Proof of Concept (kritischer Pfad)

Zunächst **ohne KI** nachweisen:

1. In der Preview eine beliebige Teilphrase markieren und einen Kommentar anlegen.
2. Den Kommentar speichern, App/Dokument neu öffnen und an der richtigen Stelle wieder anzeigen.
3. Vor oder innerhalb der kommentierten Stelle Markdown im Editor verändern und die Anker-Nachführung überprüfen.
4. Den kommentierten Bereich programmgesteuert ersetzen, den Thread auf den neuen Text verankern und aktualisierte Preview zeigen.
5. Vorher-/Nachher-Diff anzeigen; Ersetzung rückgängig machen.

### MVP – MAID als funktionierendes Produkt

- Lokaler Markdown-Editor mit Live-Preview und zuverlässiger Bildverwaltung.
- Punktgenaues Markieren und lokale Kommentar-Threads in der Preview.
- KI antwortet in Threads und schlägt Formulierungen vor.
- „Go!“ führt die besprochene Änderung nach Revision-/Konfliktprüfung im Markdown aus.
- Vorschau aktualisiert sich; Thread bleibt an der neuen Textstelle; Diff und Undo verfügbar.
- Einfacher globaler Chat mit Zugriff auf das aktuell geöffnete Dokument.
- Kommentare und Historie werden lokal gespeichert und beim Wiederöffnen wiederhergestellt.

### Spätere Erweiterungen

- KI erzeugt nach einem globalen Lektoratsauftrag mehrere **verankerte Kommentare** im Dokument.
- Struktur-/Kapitelanalyse und Umstrukturierung ganzer Abschnitte.
- Rollen wie Lektor, Co-Autor und Rechercheur mit unterschiedlichen Anweisungen und Rechten.
- Versionsübersicht, differenzierte Undo-/Rollback-Funktionen, optionale Git-Anbindung.
- Mehrdateien- und Projektmodus, freigegebene Agent-Workflows.
- KI-gestützte Bildpflege und Bildsuche.

### Bewusst nicht im Fokus

- WYSIWYG- oder Rich-Text-Editing in der Preview.
- Videobearbeitung oder Videoeinbettungs-Workflows.
- Cloud-Synchronisierung, Echtzeit-Kollaboration, Publikationsplattform.
- Eigenes Markdown-Dialekt-/Dokumentformat.
- Eigenes LLM-Hosting oder umfangreiche Modellverwaltung.
- Komplexes Plugin-Ökosystem zum Start.

## 11. Akzeptanzkriterien für den Kernworkflow

Der Kern von MAID gilt als tragfähig, wenn folgende Szenarien zuverlässig funktionieren:

- **Exakte Auswahl:** Innerhalb eines Satzes nur ein einzelnes Wort markieren, kommentieren und nach dem erneuten Öffnen korrekt wiederfinden.
- **Formatierung:** Eine Phrase markieren, die `**fett**`, *kursiv*, einen Markdown-Link oder mehrere gerenderte Textknoten berührt.
- **Unicode:** Umlaute, Emojis und typografische Zeichen dürfen Anker nicht verschieben.
- **Bearbeitung davor:** Beim Einfügen oder Löschen von Text vor der Stelle bleibt der Thread richtig zugeordnet.
- **Go!-Bearbeitung:** Die KI ersetzt ausschließlich die freigegebene Passage; andere Inhalte und Formatierungen bleiben erhalten, soweit nicht ausdrücklich beauftragt.
- **Nachher-Zustand:** Nach „Go!“ sieht der Nutzer in der Preview den geänderten Text und kann **im selben Thread** weiterreden.
- **Diff + Undo:** Die Änderung ist als Vorher-/Nachher-Vergleich sichtbar und lässt sich rückgängig machen; auch die Anker werden dabei korrekt nachgeführt.
- **Konflikt:** Zwischen Vorschlag und „Go!“ geänderter Quelltext führt nicht zu stillschweigender Überschreibung.
- **Verwaister Anker:** Wenn eine Stelle nicht mehr eindeutig auffindbar ist, wird der Kommentar erkennbar als unzugeordnet angezeigt.
- **Portabilität:** Ein `.md` lässt sich unabhängig von MAID lesen; relative Bildpfade funktionieren nach dem erneuten Öffnen.

## 12. Offene Produkt- und Architekturfragen

Diese Punkte sind bewusst **nicht** vorentschieden:

1. Wie sehen Anmerkungsmarker, Thread-Panel und mehrere überlappende Markierungen in der Preview am ruhigsten aus?
2. Wie werden Kommentare beim Verschieben/Umbenennen von Dateien zuverlässig mitgenommen (Sidecar-Datei, Projektspeicher oder lokale Datenbank)?
3. Soll „Go!“ immer auf einen explizit sichtbaren letzten Formulierungsvorschlag verweisen oder auch komplexere besprochene Aufträge freigeben?
4. Wie werden sehr große oder mehrere getrennte Textbereiche in einem einzigen Thread behandelt?
5. Wie werden konkurrierende Kommentare und Änderungen an überlappenden Textbereichen koordiniert?
6. Wie genau funktioniert die Rücknahme einer früheren Änderung, wenn inzwischen weitere Bearbeitungen stattgefunden haben?
7. Wie viel Dokumentkontext bekommt die KI standardmäßig, und wie sichtbar wird dieser Kontext für den Nutzer gemacht?
8. Welche Markdown-Erweiterungen sollen unterstützt werden, ohne die Positionszuordnung zu gefährden?

## 13. Kurzform der Vision

> **MAID verbindet ein schlichtes Markdown-Manuskript mit einer intelligenten Druckfahne.** Der Autor markiert in der Preview punktgenau eine Passage und diskutiert sie mit einer KI wie mit einem Lektor. Erst nach ausdrücklicher Freigabe („Go!“) wird das Markdown geändert. Die Preview zeigt danach die neue Fassung, während der Kommentar-Thread an derselben – nun weiterentwickelten – Textstelle bestehen bleibt. Änderungen sind nachvollziehbar; das Markdown bleibt sauber, lokal und portabel.
