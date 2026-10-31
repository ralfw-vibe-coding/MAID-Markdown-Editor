/** Testkorpus für die Quellzuordnung – deckt die Akzeptanzkriterien aus Abschnitt 11 ab. */
export const corpus: Record<string, string> = {
  einfach: 'Ein ganz normaler Satz mit einem Wort darin.\n',

  formatierung: '# Überschrift mit **Fett**\n\nHier ist ein **fettes** Wort, *kursiv*, ***beides*** und ~~weg~~.\nSiehe [den Link](https://example.com "Titel") und <https://example.org>.\n',

  unicode: 'Grüße an Jörg – „typografisch“ … 😀👍🏽 und 🇩🇪 sowie ß, é, 中文.\n',

  escapes: 'Das ist \\*kein\\* fett, ein \\[Klammer\\] und \\\\Backslash.\nEntitäten: &amp; &lt;tag&gt; &copy; &#169; &#x1F600;\n',

  container: '> Ein Zitat über\n> zwei Zeilen mit **Fett**\n>\n> > und verschachtelt\n\n- Punkt eins\n  mit Fortsetzung\n- Punkt zwei\n\n1. erstens\n2. zweitens\n\n- [ ] offen\n- [x] erledigt\n',

  code: 'Inline `code` und `` mit ` Backtick `` hier.\n\n```ts\ntype X = 1\nconst a = "b"\n```\n\n    eingerückt\n    zweite\n',

  tabelle: '| Name | Wert |\n| :--- | ---: |\n| Äpfel | 3 |\n| `x \\| y` | **fett** |\n',

  umbrueche: 'Zeile mit hartem  \nUmbruch und Backslash\\\nUmbruch.\n\nWeicher\nUmbruch\r\nmit CRLF.\n',

  html: 'Text mit <kbd>Strg</kbd> drin.\n\n<div class="x">\nBlock-HTML\n</div>\n',

  hervorhebung: 'Ein ==wichtiger Satz== mit <u>Unterstrich</u> und ==**fett markiert**==, dazu ein = und == offen.\n',

  referenzen: 'Ein [Referenz-Link][ref] und ![Bild](assets/bild.png).\n\n[ref]: https://example.com\n',
}
