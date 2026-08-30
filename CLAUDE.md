# Distill Voice – CLAUDE.md
> Pflichtlektüre vor jeder Coding-Session. Bei jeder Versionsänderung aktualisieren.

## Aktuelle Version
**v6.75** (Stand: 30.08.2026)
- Fix: Kapitel-/Themen-Analysen und eigene Prompts konnten mit `Uncaught SyntaxError: Expected ',' or '}' after property value in JSON` abbrechen. Ursache (Diagnose anhand des Fehlerbilds, die konkrete kaputte KI-Antwort war zum Zeitpunkt der Untersuchung nicht mehr abrufbar): Ein KI-Anbieter (beobachtet bei Mistral) lieferte innerhalb eines Textfelds (z.B. einer Kapitel-`summary`) ein rohes Steuerzeichen – typischerweise ein echter Zeilenumbruch statt eines korrekt maskierten `\n`. Laut JSON-Spezifikation sind rohe Steuerzeichen (Code < 0x20) innerhalb eines Strings ungültig, `JSON.parse()` bricht dann exakt mit dieser Fehlermeldung mitten im String ab. Betroffen war potenziell jede der 12 Aufrufstellen von `extractJSON()` (`js/claude.js`) – Kapitel, Themen, 360°, Gesprächs-/Arbeitsanalyse, Stimmung, eigene Prompts (`js/prompts.js`), Gesprächs-Chat-Vorschläge (`js/features.js`), Projekt-Assistent (`js/projects.js`). Fix: `extractJSON()` maskiert beim Durchlaufen des Textes jetzt selbst alle rohen Steuerzeichen, die innerhalb eines JSON-Strings auftauchen (`\n`/`\r`/`\t`/`\b`/`\f` bzw. `\uXXXX` für alles andere < 0x20), bevor der extrahierte Ausschnitt an `JSON.parse()` geht – bereits korrekt maskierte Zeichen (das bestehende `escape`-Flag) bleiben unverändert, mit 5 Testfällen verifiziert (valides JSON unverändert, roher Zeilenumbruch repariert, kein Doppel-Escaping, verschachtelte Objekte/escapte Anführungszeichen, Präambel-Text vor dem JSON). Bewusst nicht angegangen: eine Reparatur für nicht-escapte Anführungszeichen *innerhalb* eines Textfelds – das lässt sich nicht zuverlässig automatisch von einem echten String-Ende unterscheiden, wäre spekulativ und könnte neue Fehler einbauen; ebenso bewusst nicht umgesetzt: Mistrals `response_format: json_object`-Parameter, da mehrere Prompts (Kapitel, Themen) ein JSON-*Array* statt eines Objekts erwarten und dieser Modus laut OpenAI-Konvention ein Objekt voraussetzt – hätte andere Aufrufstellen riskiert, ohne dass `callMistralAPI()`/`_mistralFetchWithRetry()` aktuell wissen, welche Form der jeweilige Aufrufer erwartet.

## v6.74 (Stand: 26.08.2026)
- Fix: Sitzung wirkte nach dem Öffnen "leer" (Transkript unsichtbar), obwohl die Daten unangetastet in Drive/IndexedDB vorhanden waren. Ursache (per Konsolen-Fehler bestätigt, kein Verdacht): `escHtml()` (`js/ui.js`) ruft `.replace()` direkt auf dem übergebenen Wert auf – lieferte ein KI-Anbieter (beobachtet bei Mistral) ein Analyse-Textfeld wie `privateAnalysis.zwischenzeilen` als verschachteltes Objekt statt als String zurück (`analysePrivate()`/`analyseWork()` prüften beim Speichern bisher nur "ist das Feld leer", nicht den Datentyp), stürzte `escHtml()` beim nächsten Öffnen der Sitzung mit `TypeError: str.replace is not a function` ab – und zwar in `renderInsights()`, die `showTranscript()` VOR dem Aufruf von `renderUtterances()` durchläuft. Der Absturz brach `showTranscript()` dadurch komplett ab, bevor die Transkript-Anzeige überhaupt erreicht wurde – daher der Eindruck, das Transkript sei gelöscht. Fix in drei Schichten: (1) `escHtml()` wandelt den Wert jetzt über `String(str ?? '')` um statt direkt `.replace()` aufzurufen – ein einzelnes Feld mit falschem Datentyp kann die App nie wieder komplett zum Absturz bringen. (2) `renderInsights()` zeigt `summary`/`dynamics`/`zwischenzeilen` (privat + Arbeit) nur noch an, wenn der Wert tatsächlich ein String ist (`typeof`-Guard) – bei falschem Typ wird der Abschnitt sauber übersprungen statt Datenmüll anzuzeigen. (3) `analysePrivate()`/`analyseWork()` prüfen beim Speichern dieser Textfelder jetzt ebenfalls `typeof === 'string'` statt nur `|| ''` – ein abweichendes Antwortformat landet so gar nicht erst in der Sitzung. Bewusst nicht angegangen: bereits betroffene Bestandssitzungen (z.B. das konkret gemeldete `zwischenzeilen`-Feld) werden nicht rückwirkend repariert/migriert – dank Fix (1)+(2) crasht die Anzeige nicht mehr, der betroffene Abschnitt bleibt für genau diese Analyse leer; bei Bedarf reicht ein erneuter Lauf der Analyse.
- Fix: KI-Analyse (Claude/Mistral/Ollama) konnte bei einer nicht antwortenden API endlos im Lade-Zustand hängen bleiben (der "Abbrechen"-Button ist während des Laufs bewusst deaktiviert) – keiner der drei Provider-Fetch-Aufrufe hatte ein eigenes Timeout, anders als die Drive-API-Calls (`_fetchWithTimeout()`, `js/drive.js`, seit längerem). `_claudeFetchWithRetry()` (`js/claude.js`), `_mistralFetchWithRetry()` und `callOllamaAPI()` (`js/aiProvider.js`) nutzen jetzt denselben `_fetchWithTimeout()`-Helfer mit 120s-Timeout (KI-Antworten dauern länger als Drive-Calls) statt eines rohen `fetch()`-Aufrufs; ein `AbortError` wird auf eine klare deutsche Fehlermeldung gemappt statt die technische `AbortError`-Meldung durchzureichen. Bewusst nicht umgesetzt: den "Abbrechen"-Button während des Laufs live nutzbar machen (würde einen AbortController durch mehrere aktuell parameterlose Funktionsebenen reichen müssen – größerer Umbau) – das 120s-Timeout begrenzt einen Hänger jetzt aber ohnehin automatisch.

## v6.73 (Stand: 24.08.2026)
- Fix: Eigene Prompts nannten in der Analyse teils "Sprecher A/B/C" statt der echten Namen aus dem Transkript. Diagnose: `buildTranscriptText()`/`getSpeakerName()` lösen die echten Namen korrekt auf (bestätigt, da andere eigene Prompts auf demselben Transkript korrekt funktionierten) – das Problem lag am Ausgabe-Feldtyp. Feldtypen wie `list_with_person` bekommen über `FIELD_TYPE_CONFIG` (`js/prompts.js`) einen expliziten Hinweis, für das `person`-Feld einen echten Namen zu verwenden ("nur wenn eindeutig erkennbar"). Frei formulierte Feldtypen wie `table` haben dagegen keine Spalten-Semantik und keinen Namens-Hinweis – das Modell hat sich bei einem `table`-Feld ohne definierte Spaltennamen eigene Spalten samt generischen Platzhaltern wie "Sprecher A" ausgedacht, obwohl die echten Namen im mitgeschickten Transkript standen. Fix: `runCustomPrompt()` (`js/prompts.js`) hängt dem `promptText` jetzt eine generelle, für alle eigenen Prompts geltende Anweisung an, echte Transkript-Namen statt Platzhaltern wie "Sprecher A/B/C" zu verwenden – unabhängig vom Feldtyp.

## v6.72 (Stand: 24.08.2026)
- UI: Sitzungs-Archiv-Toolbar auf zwei Filter reduziert. `folderFilter` (Ordner) und `tagFilter` (Tags) entfernt, neuer `contactFilter` (Kontexte) ergänzt `projectFilter` (Projekte) – filtert über `getProjectsForContact(contactId)` auf alle Sitzungen der zugeordneten Projekte, da Sitzungen nicht direkt mit Kontakten verknüpft sind, sondern nur über ihr Projekt. `renderBrowser()` (`js/ui.js`) entsprechend angepasst, `updateFolderDropdown()` durch neue `updateContactFilterDropdown()` ersetzt. Die drei jetzt verwaisten Aufrufe von `updateFolderDropdown()` in `js/sessions.js` (`loadFromDrive()`) und `js/drive.js` (`onSubfolderSelectChange()`, `selectDriveSubfolder()`) entfernt – die Funktion existiert nicht mehr, sie hätten sonst einen ReferenceError geworfen. Suchfeld (Freitextsuche) bewusst unverändert gelassen. Zugrunde liegende Daten (Ordner-Zuordnung auf der Sitzungskarte, Tag-Chips) bleiben unangetastet, nur die beiden Filter-Dropdowns sind weg.

## v6.71 (Stand: 24.08.2026)
- Fix: Kontexte/Projekte-Sync – der eigentliche Umbau, nachdem v6.69 das Problem nicht vollständig gelöst hat. v6.69 hat nur das Zeitfenster beim App-Start abgesichert (`_initialSettingsLoaded`-Guard). Das reicht nicht: ein Gerät, das bereits einmal erfolgreich von Drive geladen hat und danach offen bleibt, während anderswo ein Projekt/Kontakt angelegt oder gelöscht wird, lädt bei seinem nächsten eigenen Speichern weiterhin seinen (inzwischen veralteten) lokalen Stand hoch – `loadSettingsFromDrive()` hat `projects`/`contacts` seit v4.95/v5.42 bewusst komplett ersetzt statt zusammenzuführen ("Drive ist autoritativ"), was genau diesen Fall ungeschützt lässt. Das war die tatsächliche Ursache, die nach v6.69 in der Praxis weiter bestand. Fix: `loadSettingsFromDrive()` (`js/sessions.js`) führt `projects` und `contacts` jetzt per ID zusammen (Drive-Einträge ∪ lokal-only Einträge), nach demselben Muster wie `userPrompts.custom` seit v5.86. Damit gelöschte Einträge durch dieses Zusammenführen nicht wieder auftauchen, gibt es zwei neue Lösch-Listen (Tombstones): `deletedProjectIds`/`deletedContactIds` (`js/storage.js`, in IndexedDB persistiert über `saveDeletedProjectIds()`/`saveDeletedContactIds()`, geladen in `initStorage()`, Teil von `distill_settings.json` in `saveSettingsToDrive()`). `deleteProject()` (`js/sessions.js`) und `deleteContact()` (`js/contacts.js`) tragen die ID vor dem Entfernen aus dem Array zusätzlich in die jeweilige Lösch-Liste ein; `loadSettingsFromDrive()` vereint beim Laden die lokale und die Drive-Lösch-Liste (Union) und filtert damit sowohl aus den Drive- als auch aus den lokalen Einträgen jede bereits (auf irgendeinem Gerät) gelöschte ID heraus, bevor gemerged wird. Bewusst nicht angegangen: Aufräumen/Pruning der Lösch-Listen (wachsen unbegrenzt) – für die zu erwartende Anzahl gelöschter Projekte/Kontakte über Jahre kein relevantes Datenvolumen, nicht priorisiert.

## v6.70 (Stand: 24.08.2026)
- Fix: Sitzungsname fehlte in mehreren Exporten (Dateiname und teils auch Inhalt). `_mdFilename()` (`js/claude.js`, MD-Export für Transkript + alle Analysen inkl. eigener Prompts) baute den Dateinamen aus Datum + Sprechernamen – der eigentliche Sitzungsname (`session.label`) wurde nur genutzt, wenn keine Sprecher gesetzt waren, fiel bei normalen Sitzungen also komplett weg. Nutzt jetzt immer `session.label`, wie `exportSection()` es an anderer Stelle bereits korrekt macht. `exportCustomResultPdf()` (PDF-Export für Ergebnisse eigener Prompts) enthielt weder im Browser-Tab-Titel (→ PDF-Dateiname) noch in der H1-Überschrift im Dokument den Sitzungsnamen, nur den Prompt-Namen aus der UI-Blocküberschrift – jetzt vorangestellt. `printSingleChatGedanke()` (`js/sessions.js`, Druck/PDF für gemerkte Chat-Gedanken) las den falschen Feldnamen `session.name` (existiert nicht, Sitzungen nutzen `.label`) – griff dadurch immer auf den generischen Fallback "Chat-Gedanken" zurück, nie auf den echten Sitzungsnamen; betraf Titel UND Inhalt. `exportCustomResultText()` ("Ergebnis kopieren" für eigene Prompts, Zwischenablage) begann direkt mit dem Prompt-Namen ohne Sitzungsbezug – jetzt ergänzt. Geprüft und bereits korrekt: `exportSection()` (TXT+PDF der 6 eingebauten Analysen), `exportTranscriptPdf()`, Mindmap-Export, `printSingleProjChatGedanke()` (Projekte nutzen korrekt `.name`), Prompt-Bibliothek-Export (kein Sitzungsbezug).

## v6.69 (Stand: 24.08.2026)
- Fix: Neue Kontexte/Projekte konnten durchs Arbeiten auf einem zweiten Gerät wieder verschwinden. Kontexte (`contacts.js`) und Projekte (`projects.js`) werden zusammen als komplette Liste in `distill_settings.json` synchronisiert; seit v4.95 gilt beim Laden bewusst "Drive ist autoritativ" (komplettes Ersetzen statt Zusammenführen, damit gelöschte Projekte nicht wieder auftauchen). Das ist nur sicher, wenn jedes Gerät vor dem eigenen Hochladen garantiert erst den neuesten Drive-Stand geladen hat – war aber nicht sichergestellt: `init()` (App-Start) läuft komplett unabhängig vom Drive-Settings-Download (`enterApp()` → `loadFromDrive()` → `loadSettingsFromDrive()`), und der Lade-Bildschirm lässt nach 20s Timeout mit "lokale Daten werden verwendet" schon weiterarbeiten. Wurde in diesem Zeitfenster (typisch: Smartphone, langsameres Netz) irgendetwas mit einem Projekt/Kontakt gemacht, lud das Gerät seine noch veraltete lokale Liste hoch und überschrieb damit neuere, nur auf einem anderen Gerät angelegte Kontexte/Projekte in Drive unwiderruflich – auch der bereits bestehende "Pending-Save vor dem Laden flushen"-Mechanismus (v5.85) trug dazu bei, da er beim allerersten Sync einer Sitzung ebenfalls den noch veralteten lokalen Stand hochlud. Fix: neue Variable `_initialSettingsLoaded` (`js/sessions.js`) – `saveSettingsToDrive()` bricht jetzt ganz am Anfang ab, solange in der aktuellen Sitzung noch kein einziges Mal erfolgreich von Drive geladen wurde (oder feststeht, dass noch keine Settings-Datei existiert, gesetzt in `loadSettingsFromDrive()` an beiden Erfolgsstellen). Bewusst nicht angegangen: der seltenere Rand-Fall, dass eine ganz frische lokale Änderung in genau diesem Zeitfenster durch den nachfolgenden Drive-Download überschrieben wird – dafür bräuchte es echtes Zusammenführen mit Lösch-Markierungen (Tombstones) statt komplettem Ersetzen, größerer Umbau, aktuell nicht priorisiert.

## v6.68 (Stand: 24.08.2026)
- Fix: Tabellen im MD-Export ohne Kopfzeile + Mehrzeiler konnten Markdown-Struktur zerbrechen. Der `table`-Feldtyp schrieb die Kopf-/Trennzeile (`| --- | --- |`) nur, wenn `s.columns` gesetzt war – im Prompt-Editor gibt es dafür aber gar kein Eingabefeld, `s.columns` war bei echten Prompts also immer leer, wodurch Obsidian die Zeilen nie als Tabelle erkannte (nur rohe Pipe-Zeilen). Fallback ergänzt: fehlen `columns`, werden Spaltenanzahl + generische Namen aus der ersten Datenzeile abgeleitet – derselbe Fallback wie im bestehenden HTML-Renderer `renderCustomSchemaResult()`. Zusätzlich neue Hilfsfunktion `_mdInline()` (`js/claude.js`): enthielt ein Wert (Zitat, Aufgabenbeschreibung, Tabellenzelle, …) einen Zeilenumbruch, brach das bisher die Markdown-Struktur mitten im Listenpunkt/Blockzitat/in der Tabellenzeile – betraf potenziell jede Bullet-/Zitat-/Zellen-Zeile im MD-Export (`_buildAnalysisMdContent()`: Gesprächs-/Arbeitsanalyse, Stimmung, Kapitel, Themen, 360°, alle Custom-Feld-Typen). `_buildSectionText()` (TXT-Export/Kontext) bewusst unverändert – dort keine Markdown-Syntax betroffen.

## v6.67 (Stand: 24.08.2026)
- Fix: MD-Export ignorierte 6 der 11 Ausgabe-Feld-Typen eigener Prompts. `_buildAnalysisMdContent()` (`js/claude.js`, MD-Export) und `_buildSectionText()` (TXT-Export + Kontext für Folgegespräch/Projekt-Assistent) hatten im `custom:`-Zweig nur `text`, `list`/`list_with_person`, `checklist` und `table` mit echter Formatierung hinterlegt – bei `boolean`, `rating`, `quote`, `key_value`, `list_with_date`, `tag_list` wurde die Feld-Überschrift geschrieben, der Wert danach aber mangels passendem `else if`-Zweig stillschweigend verworfen (in Obsidian erschienen diese Felder dadurch leer/unformatiert statt strukturiert, während gleichzeitig vorhandener Inhalt wie reiner Fließtext wirkte). Beide Funktionen um die 6 fehlenden Typen ergänzt – Datenstruktur pro Typ (z.B. `{wert, begruendung}` bei `rating`, `{datum, text}` bei `list_with_date`) 1:1 aus dem bereits vollständigen HTML-Renderer `renderCustomSchemaResult()` übernommen: im MD-Export als Markdown (Bold, Blockzitat `>`, Listen), im TXT-Export als reiner Text.

## v6.66 (Stand: 21.08.2026)
- Feature: Bis zu 4 Sprecher pro Sitzung statt fest 2. AssemblyAI erkennt bei der Diarization (`speaker_labels`) tatsächlich beliebig viele Stimmen (A, B, C, D, …) – bisher wurde alles über Sprecher C hinaus verworfen, nicht umbenennbar. Neue Funktion `_applyExtraSpeaker()` (`js/assemblyai.js`, aufgerufen in `processFile()` und `resumePendingTranscriptions()` direkt nach dem Setzen von `session.utterances`) übernimmt erkannte Sprecher C/D ins bereits bestehende `session.speakers`-Array – dasselbe Datenmodell, das der Samsung-Mehrsprecher-Import schon länger nutzt. Dadurch greift die gesamte vorhandene Infrastruktur automatisch mit: `renderExtraSpeakerFields()` zeigt Umbenennungsfelder inkl. Namensvorschlägen, `getSpeakerName()`/`getSpeakerColor()`/`renameSpeaker()` sind bereits generisch für beliebige Sprecher-IDs geschrieben. `speakerA`/`speakerB` bleiben unangetastet, kein Sonderfall für den normalen 2-Sprecher-Fall (kein `speakers`-Array wird angelegt, wenn nur A/B vorkommen). `checkSpeakersNamed()` (`js/claude.js`) prüft jetzt zusätzlich, ob erkannte Sprecher C/D benannt sind. `toggleUtteranceSpeaker()` (Klick auf den Sprecher-Namen einer Passage, `js/claude.js`) war bisher ein starrer A↔B-Tausch – schaltet jetzt reihum durch das feste Sprecher-Roster der Sitzung (A→B→C→D→A…). Bewusst als festes Roster aus A/B + `session.speakers` und nicht live aus den aktuell in den Utterances vorkommenden Sprechern abgeleitet – sonst würde ein Sprecher aus dem Zyklus verschwinden, sobald sein letzter Abschnitt gerade umgeschaltet wird (per Test verifiziert). `swapAllSpeakers()`/`swapSpeakersFromIndex()` bleiben bewusst unverändert auf A↔B beschränkt – für ein Mehr-Sprecher-„alles tauschen" gibt es keine eindeutige Logik, deckt aber weiterhin den häufigsten Fall ab.

## v6.65 (Stand: 15.08.2026)
- Fix: PWA-Startadresse zeigte auf das alte Original-Repo (`Transkriptions-Dashboard-Cloud`) statt auf diese Kopie (`distill-voice-test`). `manifest.json` (`start_url`, `share_target.action`), `js/app.js` (Service-Worker-Registrierung) und `sw.js` (`APP_PATH`) hatten den alten Repo-Pfad fest verdrahtet – als App/PWA installiert öffnete sich dadurch tatsächlich das alte Original-Projekt ohne Mistral/Ollama, nicht diese Version. Behoben mit relativen/dynamischen Pfaden statt eines erneut hart codierten Namens: `start_url: "."`, `share_target.action: "share"`, Service-Worker-Registrierung relativ (`sw.js`), `APP_PATH` in `sw.js` zur Laufzeit aus `self.registration.scope` abgeleitet (Funktion `getAppPath()`) – funktioniert damit unabhängig vom tatsächlichen Deploy-Pfad/Repo-Namen, auch bei künftigen Forks/Umzügen.

## v6.64 (Stand: 15.08.2026)
- Neue Markenfarbe: Orange statt Violett. `--accent`/`--accent2` in `css/styles.css` (Dark: `#ff7a1a`/`#ffb066`, Light: `#e8630a`/`#fb923c`, vorher `#6c63ff`/`#a78bfa` bzw. `#5148d4`/`#7c3aed`). Alle ~60 hartkodierten `rgba(108,99,255,…)`/`rgba(139,92,246,…)`-Transparenzwerte durch `color-mix(in srgb, var(--accent[2]) N%, transparent)` ersetzt statt einer zusätzlichen `--accent-rgb`-Variable – eine Variable weniger, kein Sync-Risiko zwischen zwei Farbwerten. Nebeneffekt (Bugfix): diese Stellen nutzten vorher immer den Dark-Theme-Hex unabhängig vom aktiven Theme, `color-mix()` mit `var(--accent)` passt sich jetzt korrekt an. Gleiches Muster in `help.html`, `news.html`, `index.html`, `js/ui.js`, `js/persons.js`, `js/features.js`, `js/claude.js`, `js/prompts.js`, `js/contacts.js` angewendet. Bewusst **unverändert** gelassen: Farben, die nur zufällig denselben Hex-Wert wie der alte Akzent hatten, aber eine eigene kategoriale Bedeutung tragen – Sprecherfarbe `--speaker-extra` (Dark-Theme, `#a78bfa`), die violette "Schlüsselbegriff"-Markierung in Notizen/Hervorhebungen (`.hl-*-schluessel`, `js/notes.js`), die Sitzungstyp-Farbverläufe in `js/audio.js` (arbeit/privat/wissen/gedanken), die Kategorie-Farben im Systemarchitektur-Diagramm (`js/ui.js`, `archBox`/`flowCard`-Aufrufe) und die 3 Rollenfarben der Experten-Runde (`js/claude.js`, `_renderRoundtableAnswer`).
- Header-Hintergrund von Magenta (`#a21caf`) auf Schwarz (`#0f1117`) umgestellt – wie zuvor in Dark und Light Mode identisch (`header { }` + `[data-theme="light"] header` in `css/styles.css`).
- `img/icon-192.png`, `img/icon-512.png`, `img/apple-touch-icon.png` neu erzeugt (Python/Pillow, gleiche Maße, gleiches Mikrofon-Motiv, jetzt Orange statt Violett) – wirkt automatisch auch auf die Social-Preview-Bilder (`og:image`/`twitter:image` in `news.html`), da diese dieselben Dateien referenzieren. `theme-color`-Meta-Tag (`index.html`) und `manifest.json` (`theme_color`) ebenfalls auf `#ff7a1a`.

## v6.63 (Stand: 15.08.2026)
- Ollama als dritter KI-Anbieter neben Claude und Mistral: lokal (Standard-Endpunkt `http://localhost:11434`), kein API-Key, keine Kosten. Neuer Adapter `callOllamaAPI()` (aiProvider.js) nach demselben Muster wie `callMistralAPI()` – spricht Ollamas `/api/chat`-Endpunkt (kein Auth-Header, kein Retry nötig da lokal/kein Rate-Limit), liest Token-Zahlen aus `prompt_eval_count`/`eval_count`. `_effectiveProvider()`/`_hasActiveAiKey()` um den dritten Zweig erweitert (Ollama braucht nie einen Key). Neue gemeinsame Helfer `_providerLabel(provider)` und `_providerOverrideFromValue(value)` (aiProvider.js) ersetzen ~5 bzw. 4 bisher verstreute Claude/Mistral-Ternaries in claude.js/features.js/projects.js – Ollama musste dadurch nur an einer Stelle (dem Helfer selbst) ergänzt werden statt an jeder einzelnen. Dritte Option in allen bestehenden Provider-Dropdowns (Standard-KI-Anbieter, Analysen-Tab, Analyse-Chat, Gesprächs-Chat, Projekt-Assistent) sowie neue Endpunkt-/Modell-Felder + Erreichbarkeits-Test im API-Modal. `PRICING.ollama` mit 0€, Kosten-Seite zeigt Ollama-Card + farbige Chips (dabei einen Bug behoben: `_providerChips()` filterte bisher auf `eur > 0`, wodurch ein 0€-Ollama-Lauf nie als genutztes Modell sichtbar geworden wäre). Wichtig für den Eigenbetrieb: Ollama muss mit `OLLAMA_ORIGINS` gestartet werden, sonst blockt der Browser die Anfrage per CORS. Qualitäts-Hinweis: lokale Modelle sind bei Deutsch/strikten JSON-Analysen tendenziell unzuverlässiger als Claude/Mistral – bewusst kostenlose Zusatzoption, kein Ersatz. Vision bleibt weiterhin bewusst außen vor.

## v6.62 (Stand: 15.08.2026)
- Modell-Historie + Pillen-Switcher: Läuft eine der 6 eingebauten Analysen (Gesprächs-/Arbeits-Analyse, Stimmung, Kapitel, Themen, 360°) oder ein eigener Prompt (`customResults`) erneut mit einem anderen KI-Anbieter, wird der bisherige Stand nicht mehr überschrieben, sondern archiviert. Kleine Pillen ("Claude"/"Mistral") direkt im jeweiligen Analyse-Block erlauben das Umschalten zwischen den archivierten Ständen – der jeweils aktive Stand bleibt wie gewohnt über den bestehenden Inline-Edit-Code editierbar. Datenmodell pro Analysetyp: unverändertes aktives Feld (z.B. `session.privateAnalysis`) + neues `*Meta`-Feld (Provider/Modell/Zeitstempel des aktiven Standes) + neues `*Runs`-Array (archivierte Stände). Bewusst **kein** Referenz-Trick zwischen aktivem Feld und Archiv-Eintrag – das hätte bei jedem Neuladen aus IndexedDB/Drive (JSON dupliziert Objekte beim Serialisieren) die Kopplung stillschweigend gebrochen. Stattdessen ein expliziter Swap beim Pillen-Klick (`switchAnalysisRun()`/`switchCustomResultRun()`, sessions.js), verifiziert per Node-Testskript inkl. des Falls "Bearbeitung nach Wechsel darf den archivierten Stand nicht verändern". Gemeinsamer Helfer `_archiveAnalysisRun()` (claude.js) archiviert an allen 6 Schreibstellen + `customResults` (prompts.js, verschachtelt pro Prompt-ID). Bestehender Edit-Code (`editAnalysisItem` u.a.) bleibt komplett unangetastet.

## v6.61 (Stand: 15.08.2026)
- Eigene KI-Anbieter-Wahl in den drei Chat-/Assistenten-Bereichen: Analyse-Chat (`askFollowUp()`, claude.js), Gesprächs-Chat (`sendAskQuestion()`, features.js) und Projekt-Assistent (`sendProjectChatMessage()`, projects.js) bekommen je ein kompaktes Claude/Mistral-Dropdown im Panel-Header (`#followUpProviderSelect`, `#askProviderSelect`, `#projAssistProviderSelect`) – vorbelegt mit dem seit v6.60 globalen Standard-KI-Anbieter, pro Nachricht umschaltbar, ohne den globalen Standard zu verändern. Technisch derselbe `_aiProviderOverride`-Mechanismus wie beim Analysen-Tab-Dropdown (v6.58): vor dem jeweiligen `callClaudeAPI()`-Aufruf gesetzt, im `finally`-Block zurückgesetzt. `populatePersonaSelects()` (features.js) synct alle drei neuen Selects bei jedem Panel-Öffnen auf den globalen `aiProvider`. Neue CSS-Klasse `.ai-mini-select` (styles.css, an `.rolle-select` angelehnt, `max-width` statt `flex:1`, zusätzliche Verkleinerung ≤480px) – responsiv in die bereits mobil-sicheren Header (`persona-select-bar`, `proj-assist-header`) eingefügt, ohne deren bestehendes Verhalten zu verändern. Letzter Teil der KI-Anbieter-Neutralität für die interaktiven Bereiche (siehe KI-ANBIETER-LEITFADEN.md).

## v6.60 (Stand: 15.08.2026)
- Standard-KI-Anbieter gilt jetzt für die ganze App: `_effectiveProvider()` (aiProvider.js) fällt ohne explizite Auswahl nicht mehr hart auf Claude zurück, sondern auf die globale "Standard-KI-Anbieter"-Einstellung. Stellst du Mistral als Standard ein, nutzen automatisch auch Analyse-Chat (inkl. Experten-Runde), Gesprächs-Chat, Mindmap, Kalender, E-Mail-Entwürfe, Projekt-Assistent, Personen-Synthese (Mein Profil/Beziehungskontext), Semantiksuche, Präsentations-Generator, Kapitel-Tiefenanalyse und der KI-Prompt-Generator Mistral – ohne eigenes Dropdown in jeder dieser Funktionen (die kamen selektiv in v6.61 für die drei Chat-/Assistenten-Bereiche). Rund 15 Stellen, die bisher hart `if (!anthropicKey)` geprüft haben, prüfen jetzt providerbewusst über die neuen Helfer `_hasActiveAiKey()`/`_missingAiKeyMessage()` (aiProvider.js) – sonst hätten sie fälschlich einen fehlenden Anthropic-Key gemeldet, obwohl Mistral korrekt eingerichtet war. Bewusst ausgenommen: Vision (Foto-Analyse, Scan-Import) bleibt Claude-only bis Pixtral geprüft ist; "Senden an Claude"/"In Claude Design öffnen" (Design-Tab) bleibt Claude-spezifisch, da reine Weiterleitung zu claude.ai (Artifacts), kein Mistral-Äquivalent vorhanden. Kosmetische "Claude"-Texte bei jetzt providerneutralen Funktionen wurden mit angepasst. Teil 3 der KI-Anbieter-Neutralität (siehe KI-ANBIETER-LEITFADEN.md).

## v6.59 (Stand: 15.08.2026)
- Kosten-Seite providerbewusst: `renderCostsView()` (persons.js) zeigt eine Card pro tatsächlich genutztem KI-Anbieter statt einer fest verdrahteten Claude-Card (Anbieter ohne Nutzung erscheinen nicht). Sitzungstabelle: Spalte "Claude" ersetzt durch "Modell(e)" – farbige Chips pro tatsächlich für diese Sitzung genutztem Anbieter samt Betrag (z.B. Claude-Kernbefund + spätere Mistral-Folgeanalyse nebeneinander sichtbar). Intern: `providerEur`-Objekt (je Monat und je Sitzung) ersetzt das bisherige feste `claudeEur`-Feld, neue Helfer `addProviderEur()`/`sumProviderEur()`/`_providerChips()`. Rechengrundlage bleibt die seit v6.58 providerbewusste `calcLogEntryCost()` – hier wurde nur die Darstellung nachgezogen. Teil 2 von 3 der KI-Anbieter-Neutralität (siehe KI-ANBIETER-LEITFADEN.md) – v6.60 verhindert als letzter Teil, dass eine erneute Analyse mit anderem Modell das vorherige Ergebnis überschreibt.

## v6.58 (Stand: 15.08.2026)
- KI-Anbieter-Wahl: Mistral Large 3 als Alternative zu Claude im Analysen-Tab. Neues js/aiProvider.js als Vermittlungsschicht – callClaudeAPI()/callClaudeAPIVision() bleiben die einzigen Aufrufstellen, callClaudeAPI() routet über `_effectiveProvider()` an Claude oder Mistral. Ohne explizite Auswahl (neuer Modell-Dropdown links neben "Starten" im Analysen-Tab) läuft alles unverändert über Claude – kein globaler Zwangswechsel, andere Features (Semantiksuche, Kalender, Fotoanalyse, Projekt-Assistent) bleiben bewusst Claude-only, bis sie einzeln angebunden werden. API-Modal: neues Feld "Mistral API-Key" + "Standard-KI-Anbieter"-Auswahl (nur Vorauswahl fürs Dropdown). Kosten-Log (`session.claudeCostLog`) bekommt `provider`/`model`-Feld pro Eintrag, `calcLogEntryCost()`/`calculateSessionCost()` rechnen providerbewusst (config.js: neue `PRICING.mistral`, 0,50 €/1,50 € pro 1M Token, intern als USD-Äquivalent gespeichert). Vision bleibt bewusst Claude-only (Scan-Import läuft standardmäßig über lokales PaddleOCR, siehe KI-ANBIETER-LEITFADEN.md Abschnitt 6). Teil 1 von 3 der KI-Anbieter-Neutralität (siehe KI-ANBIETER-LEITFADEN.md) – v6.59 macht die Kosten-Seite providerbewusst, v6.60 verhindert dass eine erneute Analyse mit anderem Modell das vorherige Ergebnis überschreibt.

## v6.57 (Stand: 14.08.2026)
- Sitzungssuche filtert jetzt auch nach Sprechern: Sofortsuche (search.js: `runInstantSearch()`) durchsucht zusätzlich `speakerA`/`speakerB`/`speakers[]` (C/D) – unabhängig vom `persons`-Feld. Eigenes Treffer-Feld "Sprecher" in den Suchergebnissen.
- Profilbilder für Personen: Klick auf den Avatar im Personen-Profil (`_avatarHtml()`, persons.js) öffnet `#personPhotoInput` (index.html), Bild wird per Canvas auf 200×200 zugeschnitten (Cover-Crop, JPEG q=0.85) und als rundes Vorschaubild auf Personen-Karte + Profil-Header angezeigt (ohne Foto: Initialen-Kreis). Speicherung in `localStorage.personPhotos` (Schlüssel = Anzeigename, gleiches Muster wie `personRelationships`), per `queueSettingsSave()`/`loadSettingsFromDrive()` mit Drive synchronisiert (`distill_settings.json`, lokal hat beim Merge Priorität). Neue Funktionen: `loadPersonPhotos()`, `savePersonPhoto()`, `getPersonPhoto()`, `removePersonPhoto()`, `triggerPersonPhotoUpload()`, `handlePersonPhotoSelected()`.

## v6.56 (Stand: 14.08.2026)
- Bug behoben: `syncPersonsFromSpeakers()` und `renameSpeaker()` prüften bisher nur Sprecher B/C/D auf externe Personen – Sprecher A wurde immer stillschweigend als "das ist Daniel" übersprungen. Bei Sitzungen, wo die externe Person tatsächlich Sprecher A ist (z.B. nach "Tauschen"/swapAllSpeakers()), wurde ihr Name dadurch nie ins `persons`-Feld übernommen. Beide Funktionen prüfen jetzt alle Sprecher-Slots (A, B, C, D) symmetrisch per `_isMyName()` statt fest anzunehmen, A sei immer Daniel.
- Neue Platzhalter-Erkennung `_isUnclearSpeakerName(name)` ("Sprecher A/B/C/D", "Gesprächspartner/in", "Kollege/Kollegin", "?", "unbekannt", "unklar", leer) – verhindert dass z.B. ein Sprecher namens "?" fälschlich als Person übernommen wird. `getSessionsUnclearSpeakers()` prüft Sprecher A jetzt symmetrisch zu B (vorher nur der Literal-Platzhalter "sprecher a"). `syncPersonsFromSpeakers()` schließt Platzhalter auch bei C/D aus, die von `getSessionsUnclearSpeakers()` nicht geprüft werden.

## v6.55 (Stand: 14.08.2026)
- Personen aus bereits benannten Sprechern nachtragen: Neuer Button „Personen aus Sprechern nachtragen" in der Personen-Ansicht (`syncPersonsFromSpeakers()`/`runSyncPersonsFromSpeakers()`, persons.js) trägt für Sitzungen mit eindeutig benannten Sprechern (nicht in `getSessionsUnclearSpeakers()`) den Namen von Sprecher B bzw. C/D als "Beteiligte Person" nach – ergänzt nur, löscht/überschreibt nie. Neue Erkennung `_isNoSecondSpeaker()` für bewusst eingetragenes "keinen"/"keiner"/"niemand"/"kein"/"none"/"-"/"0" (kein zweiter Sprecher), damit das nicht fälschlich als Person oder als unklar gilt. Einmalige Migration für Bestandsdaten.
- Künftig automatisch: `renameSpeaker()` (claude.js) trägt einen umbenannten Sprecher B/C/D direkt bei der Umbenennung als Person ein. Bei Korrektur (z.B. Tippfehler) wird der alte Name im `persons`-Array ersetzt statt verdoppelt zu werden (alter Name wird vor dem Überschreiben gemerkt und entfernt).
- Namensvarianten derselben Person zusammenführen (z.B. "Jan" und "Jan R." → ein Profil): neuer Merge-Schlüssel `_personKey(name)` (erstes Wort, kleingeschrieben – gleiche Heuristik wie `_resolvePersonKey` in projects.js) verwendet in `getAllPersons()`, `getPersonData()`, `deletePersonPermanently()`, `unhidePerson()` und `syncPersonsFromSpeakers()`. Längere Namensform gewinnt als Anzeigename. `getAllPersons()` zählt eine Sitzung nur einmal, auch wenn mehrere Namensvarianten im `persons`-Array stehen (seenKeys-Set pro Sitzung).
- Namensvorschläge (Autocomplete) jetzt auch bei den Sprecher-Namensfeldern: `editSpeakerA`/`editSpeakerB` (index.html) und die dynamischen C/D-Felder (`renderExtraSpeakerFields()`, claude.js) nutzen dieselben generalisierten Autocomplete-Helfer aus sessions.js wie das "Beteiligte Personen"-Feld (eigene Autocomplete-Container: `speakerAAutocomplete`, `speakerBAutocomplete`, `speakerExtraAutocomplete_<id>`). Gilt automatisch auch für frisch erstellte Sitzungen, da derselbe Transkript-Header verwendet wird.

## v6.54 (Stand: 14.08.2026)
- Korrektur zu v6.53: Die Liste in der Personen-Ansicht zeigte Sitzungen ohne "Beteiligte Personen"-Eintrag – nicht hilfreich, da Sprecher A/B meist schon klar sind. `getSessionsMissingPersons()` ersetzt durch `getSessionsUnclearSpeakers()` (persons.js): zeigt Sitzungen, bei denen `speakerA`/`speakerB` noch auf dem unbenannten Platzhalter stehen ("Sprecher A/B", "Gesprächspartner/in", "Kollege/Kollegin"). Gedanken-Sitzungen und Scan-Import ausgenommen (kein Sprecherkonzept). Zeigt pro Zeile zusätzlich die aktuellen Sprecher-A/B-Werte.
- Bug behoben: "Mein Profil" zählte bisher ALLE abgeschlossenen Sitzungen unabhängig davon, ob Daniel tatsächlich Sprecher war (Text-/Share-Importe und Scan-Notizen liefen fälschlich mit rein). `getMeinProfilData()` filtert jetzt auf Sitzungen bei denen `speakerA` ODER `speakerB` "Ich"/"Daniel"/`ownerName` entspricht (oder Typ 'gedanken'). Neue Hilfsfunktion `_isMyName(name)`. Die `meName`-Ermittlung für Wünsche/Aufgaben-Zuordnung berücksichtigt jetzt auch den Fall, dass Daniel Sprecher B ist.

## v6.53 (Stand: 14.08.2026)
- Personen nachträglich zu Sitzungen zuordnen: Das `persons`-Feld einer Sitzung konnte bisher nur beim Hochladen (Schritt 2) gesetzt werden. Neu: editierbares Feld „Beteiligte Personen" im Transkript-Header (`#editSessionPersons`, neben den Sprecher-Feldern), speichert per `updateSessionPersons()` (claude.js) in `session.persons` + Drive. Personen-Ansicht (`renderPersonsView()`, persons.js) zeigt oben eine Liste aller abgeschlossenen Sitzungen ohne Personen-Zuordnung (`getSessionsMissingPersons()`) – Gedanken-Sitzungen (`type==='gedanken'`) sind ausgenommen, da sie immer zu Daniel selbst gehören. Die Autocomplete-Helfer in sessions.js (`showPersonsAutocomplete`, `selectPersonSuggestion`, `hidePersonsAutocomplete`, `handlePersonsKey`) nehmen jetzt eine optionale Element-ID entgegen, damit sie sowohl im Upload-Formular (`#sessionPersons`) als auch im Transkript-Header (`#editSessionPersons`) funktionieren.

## v6.52 (Stand: 14.08.2026)
- Fix: Sidenav-Button „Personen" (unter „Analyse") war seit der Umbenennung „Kontakte" → „Kontexte" per `style="display:none"` fest ausgeblendet, obwohl `js/persons.js` (Profile, Beziehungskontext, Kosten-Aufschlüsselung) weiterhin voll funktionsfähig war. Button in index.html wieder sichtbar gemacht. Zusätzlich behoben: doppeltes `id`-Attribut (`id="navPersons" id="headerPersonsBtn"`) auf demselben Button – der Browser nutzte nur die erste ID, wodurch `_setHeaderBtn()`/`_showOverlay()` (ui.js) das Element per `headerPersonsBtn` nicht fanden. Jetzt nur noch `id="headerPersonsBtn"`.

## v6.51 (Stand: 12.08.2026)
- Transkript-Header umgebaut: „Bearbeiten"-Button direkt neben dem Wort „Transkript" (links). Im Bearbeitungsmodus: Speichern + Abbrechen ersetzen ihn (links). Export-Buttons MD + PDF rechts, im `insights-export-btn`-Stil (border, hover). Neue Funktion `exportTranscriptPdf()` (claude.js): baut HTML mit H1-Überschrift = Sitzungsname + Datum, öffnet `window.open()` + `window.print()`. Neue Hilfsfunktion `_resetTranscriptEditButtons()` wird in `toggleTranscriptEdit()` und `saveTranscriptEdits()` aufgerufen.

## v6.50 (Stand: 09.08.2026)
- Feature: Transkript-Abschnitte löschen. Im Bearbeitungsmodus erscheint neben jedem Utterance ein Papierkorb-Icon (`utt-delete-btn`, `display:none` im Normal-View). Neue Funktion `deleteUtterance(idx)` (claude.js): ruft `_applyTextareaEdits(session)` → `splice(idx,1)` → `saveSessions()` → `renderUtterances()` → `toggleTranscriptEdit()`. Kein Undo. Funktioniert für normale Sitzungen (Sprecher-Name-Zeile) und Scan-Import (Seite-N-Zeile).

## v6.49 (Stand: 09.08.2026)
- Vollständiges Kosten-Tracking. Neu: `addToGlobalCostLog(inputTokens, outputTokens, label)` (config.js) für Calls ohne Session-Kontext → localStorage `distill_globalCostLog`. Session-Tracking nachgezogen in: scan.js (Claude Vision OCR-Tokens nach Session-Erstellung), calendar.js (Termine + E-Mail), claude.js (Kernbefund + Auto-Tags), photos.js (Foto-Analyse), projects.js (Projekt-Analyse auf projSessions[0]). Kostenseite: neue Sektion "Sonstige API-Kosten" nach Label aufgeschlüsselt. Gesamt-Total inkludiert jetzt alle Calls.

## v6.48 (Stand: 09.08.2026)
- UI: Systemarchitektur-Ansicht überarbeitet. `flowCard()` begrenzt Beschreibungstext auf max-height:4.5em + ▼/▲-Button zum Aufklappen — alle Karten jetzt einheitlich hoch. Neue Karte `embeddings.js` (lokale Semantiksuche). `search.js`-Karte: lokale Semantiksuche via embeddings.js ergänzt. `scan.js`-Karte: langen Changelog durch kompakte Zustandsbeschreibung ersetzt. Modul-Liste: scan.js, embeddings.js, templateLibrary.js ergänzt.

## v6.47 (Stand: 08.08.2026)
- Fix: `calculateSessionCost()` (config.js) berechnet AssemblyAI-Kosten jetzt nicht mehr für `source === 'scan_import'` — kein Audio, keine Transkription über AssemblyAI. Gilt auch für bestehende Sitzungen mit fiktiver Dauer. Claude-Kosten (claudeCostLog) bleiben unverändert korrekt.

## v6.46 (Stand: 08.08.2026)
- Fix: Scan-Sitzungen zeigen korrekte Metadaten. Chronik + Grid zeigen "Dokument · X Seiten" statt "Ich & B · 3 min 15 s". Datenmodell: `duration: null` (kein echtes Audio), `pageCount: N` als neues Feld. Upload-Zone: "Foto(s) oder PDF auswählen". Betroffen: audio.js (renderTimeline), ui.js (renderBrowser), scan.js (startScanImport).

## v6.45 (Stand: 08.08.2026)
- Feature: PDF-Upload im Scan-Import. Scan-Tab akzeptiert jetzt auch PDFs (`accept="image/*,application/pdf"`). Neue Funktion `_pdfToImageFiles()` (scan.js) rendert jede Seite per PDF.js auf Canvas (scale 2.0 ≈ 144 dpi) und erzeugt ein JPEG — identisch zur Bildverarbeitung danach. `handleScanFileSelect()` ist jetzt async und erkennt PDFs automatisch. Rest der Pipeline (PaddleOCR/Claude Vision, Reflow, Session) bleibt unverändert. PDF.js war bereits geladen.

## v6.44 (Stand: 08.08.2026)
- Feature: Scan-Text wird zu echtem Fließtext zusammengezogen. OCR erkennt Buchseiten zeilenweise wie gedruckt – jede Druckzeile landete bisher als eigene Zeile im Text, auch mitten im Satz. Neue Funktion `_reflowOcrText()` (scan.js) zieht Zeilen zusammen, inkl. korrekter Silbentrennungs-Auflösung (Zeile endet auf "-" → Bindestrich weg, direkt anhängen statt Leerzeichen). Nummerierte Listenpunkte bleiben bewusst eigene Zeilen (sonst würden Aufzählungen verschmelzen, siehe v6.38-Test). Läuft komplett lokal, keine API. Betrifft nur neue Scans.

## v6.43 (Stand: 08.08.2026)
- Fix: Regression durch Small-Modell zurückgerollt. Lokaler Vergleichstest (gleiches Foto, außerhalb der App nachgestellt) bestätigte: Small-Modell liest bei diesem Dokument an mehreren Stellen schlechter als Tiny (z.B. "Einigkeit"→"Einigkit"), Medium-Modell (auch getestet) sogar noch schlechter und 3x langsamer. Die abgesenkte Erkennungsschwelle (0.4) war dabei NICHT die Hauptursache. Zurückgerollt auf Tiny-Modell + Standard-Schwelle 0.5. models/paddleocr/ enthält jetzt Tiny- statt Small-Dateien. Zusätzliche Einstell-Tests (Detection-Fläche, Auflösung, Padding) brachten keine Verbesserung für die eine hartnäckig fehlende Zeile – per Diagnose (isolierter Crop erneut erkannt) bestätigt: Erkennungssicherheit liegt für diese Zeile knapp an der Schwelle (~0.55), Text bleibt auch bei niedrigerer Schwelle unleserlich/falsch statt korrekt – ein Modell-Grenzfall, keine Einstellungssache. Empfehlung: Restfehler bei schwierigen Zeilen manuell im Text-Editor korrigieren.

## v6.42 (Stand: 08.08.2026)
- PaddleOCR-Modell-Dateien (Detection, Recognition, Wörterbuch) fest ins Repo vendort (models/paddleocr/, von Daniel heruntergeladen und Format-verifiziert). _getPaddleOcrService() (scan.js) lädt sie jetzt von dort statt von der externen GitHub-Quelle (PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models) – Distill Voice ist damit unabhängig von deren Fortbestand. Nur die Bibliothek selbst (Code) bleibt CDN-geladen.

## v6.41 (Stand: 08.08.2026)
- PaddleOCR: Modell-Stufe "Small" statt "Tiny" (volles Wörterbuch, robuster bei Fotos/schlechtem Licht laut PaddleOCR-eigener Empfehlung), Erkennungs-Schwelle (minimumConfidence) von 0.5 auf 0.4 gesenkt – Ursache für den bei v6.40 beobachteten komplett fehlenden Einleitungsabsatz (Seite-40-Test) war vermutlich ein unter der Schwelle verworfener Textblock. Neuer Ordner `models/paddleocr/` mit README + Download-Links angelegt (Vorbereitung fürs Modell-Vendoring, siehe Memory project_scan_import) – Daniel lädt die 3 Dateien selbst herunter, danach Umstellung von CDN auf lokale Pfade in _getPaddleOcrService() (scan.js).

## v6.40 (Stand: 08.08.2026)
- PaddleOCR jetzt Standard-Engine im Scan-Tab, Tesseract komplett entfernt (scan.js: _ocrImageTesseract() gelöscht, index.html: Tesseract.js-CDN-Script-Tag entfernt, Dropdown-Option entfernt). Grund: Test mit echtem Buchfoto (Spalten-/Label-Layout, Seite 40) zeigte PaddleOCR liest die Reihenfolge korrekt (Label + zugehörige Frage zusammen), Tesseract hat das durcheinandergebracht. Claude Vision bleibt als Alternative für Handschrift. Offen: Modell-Vendoring ins eigene Repo weiterhin nicht umgesetzt – PaddleOCR lädt sein Modell aktuell noch von externer GitHub-Quelle.

## v6.39 (Stand: 08.08.2026)
- Feature: PaddleOCR als dritte, experimentelle Scan-Engine neben Claude Vision und Tesseract (scan.js: _ocrImagePaddleOCR(), Bibliothek "ppu-paddle-ocr" + KI-Modell per CDN geladen, quelloffen/Apache-2.0, komplett lokal im Browser). Grund: Tesseract liest Spalten-/Label-Layouts oft in falscher Reihenfolge (Text als durchgehender Strom); PaddleOCR erkennt Textblöcke einzeln (Detection-Modell zuerst), sollte dadurch robuster sein. Konnte im Entwicklungs-Sandbox nicht vorab getestet werden (Netzwerk-Einschränkung dort, siehe Memory feedback_sandbox_network_limits) – als "experimentell" markiert bis Daniel es live testet. Modell-Vendoring ins eigene Repo (Daniels Wunsch wegen Abhängigkeit von externer Quelle) noch nicht umgesetzt, siehe Memory project_scan_import.

## v6.38 (Stand: 08.08.2026)
- Fix: startScanImport() (scan.js) hat den OCR-Text aller Fotos zusammengeklebt und an parsePlainText() übergeben – diese Funktion splittet an jeder Leerzeile, wodurch eine einzelne fotografierte Seite mit mehreren Absätzen/Listenpunkten fälschlich als mehrere "Seiten" angezeigt wurde. Fix: pro Foto (bzw. Bildhälfte bei Doppelseite) wird jetzt direkt genau eine Utterance/"Seite" gebaut, kein Re-Splitting mehr. css/styles.css: .utterance-text hat jetzt white-space:pre-line, damit Absätze innerhalb einer Seite weiterhin als eigene Zeilen lesbar bleiben.

## v6.37 (Stand: 08.08.2026)
- Fix: "Aufnahme"-Sektion (Audioplayer, "Audiodatei nicht verknüpft"-Warnung) und "Sprecher"-Sektion (Sprecher-A/B-Felder, "Tauschen"-Button) im Text-Tab jetzt für source==='scan_import' komplett ausgeblendet (index.html: #transkriptAufnahmeBlock/#transkriptSprecherBlock, Logik in showTranscript() claude.js). Zusätzliches Sektions-Label über der Textliste zeigt ebenfalls "Text" statt "Transkript" bei Scan-Sessions (sdcSectionTranskriptLabel).

## v6.36 (Stand: 08.08.2026)
- Fix: renderUtterances() (claude.js) zeigte im Text-Tab bei Scan-Sessions vor jedem Absatz "Ich" als Sprecher-Label inkl. Tausch-Icon und fiktivem Zeitstempel/Play-Button – irreführend ohne Dialog/Audio. Für source==='scan_import' jetzt kein Sprecher-Label mehr pro Absatz, stattdessen "Seite N"-Markierung (gleiches Muster wie MD-Export seit v6.32). Bearbeiten-Funktion bleibt unverändert (indiziert über .utterance-text, unabhängig vom Sprecher-Markup).

## v6.35 (Stand: 08.08.2026)
- Bugfix: Tesseract-Texterkennung erzeugte Wortsalat bei Fotos mit EXIF-Rotation (z.B. Handyfotos "liegend" gespeichert). _ocrImage() (Claude Vision) normalisiert das schon über _resizePhoto() (Canvas respektiert EXIF-Ausrichtung), _ocrImageTesseract() bekam das Foto bisher ungefiltert – jetzt läuft auch der Tesseract-Pfad zuerst durch _resizePhoto() (2000px statt 1600px, Tesseract profitiert stärker von Bildschärfe als ein Vision-Modell).

## v6.34 (Stand: 08.08.2026)
- Feature: Scan-Import Foto-Vorschau-Liste mit manuellem Umsortieren (▲▼-Buttons, _scanMoveFile()), Foto entfernen (×, _scanRemoveFile()) und "Zurücksetzen" (_scanResetFiles()). openScanTab() rendert die Liste jetzt beim erneuten Öffnen neu. Batch-Sortierung bei neuer Auswahl betrifft nur die neuen Dateien, nicht mehr die gesamte Liste (verhindert Überschreiben einer manuellen Umsortierung).
- Feature: Checkbox "Doppelseite" – teilt jedes Foto vor der OCR per Canvas exakt vertikal in linke/rechte Hälfte (_splitImageHalves() in scan.js), beide Hälften werden als zwei separate Seiten behandelt. Funktioniert engine-unabhängig (reine Bildvorverarbeitung).

## v6.33 (Stand: 08.08.2026)
- Fix: Scan-Import sortiert Fotos jetzt automatisch nach file.lastModified (Aufnahmezeitpunkt), bevor die Texterkennung startet – bei Mehrfachauswahl lieferte der Browser vorher oft alphabetische statt chronologische Reihenfolge. handleScanFileSelect() in scan.js sortiert _scanFiles[], neue Vorschau-Liste #scanFileList (_renderScanFileList()) zeigt die Reihenfolge vor dem Start zur Kontrolle an.

## v6.32 (Stand: 08.08.2026)
- Fix: Scan-Import MD-Export war kaputt bei mehreren Fotos – exportTranscriptMd() verschmolz alle Seiten zu einem "Ich:"-Block (Sprecher-Zusammenfassungslogik griff, da Scan-Sessions nur einen Sprecher haben). Jetzt für source==='scan_import': jede Seite eigener Absatz mit "Seite N"-Markierung statt Sprecher-Label, typ:"notiz" statt "transkript" im Frontmatter (_buildMdFrontmatter), keine Teilnehmer-Liste, Dateiname aus Sitzungsname statt "ich" (_mdFilename).
- Feature: Zweite OCR-Engine Tesseract.js (js/scan.js: _ocrImageTesseract(), CDN cdn.jsdelivr.net/npm/tesseract.js, quelloffen, läuft im Browser, kein API-Key) wählbar im Scan-Tab neben Claude Vision. Grund: Claude Vision verweigert bei umfangreicher Wiedergabe aus veröffentlichten Büchern die wortwörtliche Transkription (Copyright), Tesseract als reine Zeichenerkennung hat diese Einschränkung nicht (dafür schwächer bei Handschrift).

## v6.31 (Stand: 08.08.2026)
- Feature: Neuer Sitzungstyp "Wissen" neben Privat/Arbeit/Gedanken. Option in allen drei Upload-Tabs (sessionType/importType/scanType) + 4. Button im Session-Header-Typ-Pill (changeSessionType('wissen'), brain-Icon). Verhält sich funktional wie Privat/Arbeit (zwei Sprecher, volles Gesprächsanalyse-Schema builtin_private) – keine Logik-Änderung nötig, da checkSpeakersNamed()/analysePrivate() nur explizit auf 'gedanken' verzweigen. Icon (brain) + Farbe (Teal, sc-type-wissen) ergänzt in ui.js, audio.js, persons.js (2×), projects.js, search.js, css/styles.css.

## v6.30 (Stand: 08.08.2026)
- Vorlagen-Datenbank Korrekturen: (1) Kategorien werden über TEMPLATE_CATEGORY_LABELS_DE/_catLabelDe() (templateLibrary.js) auf Deutsch angezeigt – Chips, Karten, Sortierung; interner Schlüssel bleibt Englisch für Filter/data-cat. (2) "Als Prompt erstellen" öffnet zuerst den bestehenden Kategorie-Picker (openPromptCategoryPickerModal('library') → selectPromptCategory() → _startGeneratorFromTemplate()), damit der Nutzer die Ziel-Sektion (Analyse/Design/Foto-Analyse/Standard/Rolle) wählt, bevor der KI-Generator befüllt wird. (3) Vorlagen sind jetzt bearbeitbar (openTemplateEditModal/saveTemplateEdit, Override in localStorage distill_template_overrides) und löschbar (deleteTemplateFromLibrary, Soft-Delete in localStorage distill_hidden_templates, Confirm-Dialog nach bestehendem Muster). _effectiveTemplates() führt Basis + Overrides zusammen und blendet Gelöschtes aus – wird jetzt überall statt der rohen TEMPLATE_LIBRARY verwendet.

## v6.29 (Stand: 08.08.2026)
- Feature: Vorlagen-Datenbank in der Prompt-Bibliothek. js/templateLibrary.js (neu): TEMPLATE_LIBRARY[] – 220 eigene, umformulierte Prompt-Vorlagen-Zusammenfassungen in 15 Kategorien (General, Meeting, Speech, Call, Interview, Medical, Sales, Consulting, Education, Construction, IT & Engineering, Legal, Real Estate, Financial, Functional). prompts.js: neuer Tab "Vorlagen-Datenbank" neben "Meine Prompts" (_switchPromptsSubView, _renderTemplateLibrary, _renderLibraryResults) – filterbar nach Kategorie + Volltextsuche, sortierbar A-Z/Kategorie, Favoriten (localStorage distill_template_favorites), aufklappbare Gliederung pro Karte, "bereits verwendet"-Badge mit Link zum Prompt (abgeleitet aus sourceTemplateId, keine harte Sperre). useTemplateAsPrompt() befüllt den bestehenden KI-Modus des Prompt-Generators – Rolle/Ton/Grenzen/Kontext werden frisch generiert, nicht 1:1 übernommen.

## v6.28 (Stand: 08.08.2026)
- Feature: Scan-Import – neuer dritter Tab "Scan" im Upload-Panel. Fotos/Kamera-Aufnahmen von handschriftlichen Notizen/Dokumenten werden per Claude Vision (scan.js: _ocrImage(), OCR-Prompt für Notiz statt Dialog) zu Text erkannt, mit parsePlainText() zu einer Session zusammengefasst (mehrere Fotos = mehrseitige Notiz). session.source = 'scan_import', ein Sprecher, kein Dialog. claude.js: checkSpeakersNamed() behandelt scan_import wie Typ "gedanken". Session-Detail-Tab zeigt "Text" statt "Transkript" bei Scan-Sitzungen (sdcTabTranskriptLabel-Span, gesetzt in showTranscript()).

## v6.27 (Stand: 07.08.2026)
- Icon-Feld eigener Prompts nutzt volles Lucide-Set (~1600 Icons) statt fester 62-Icon-Liste: iconLucide() in icons.js rendert über <i data-lucide> + lucide.createIcons() (CDN bereits geladen), icon() bleibt für feste UI-Icons bestehen

## v6.26 (Stand: 06.08.2026)
- max_tokens 8192 → 32000 (claude.js) – lange Analysen wurden vorher abgeschnitten
- Freitext-Ergebnisse eigener Prompts: echtes Markdown-Rendering (_parseMarkdown) + Anker-Links ([Text](#thema-N) → _jumpToAnchor())
- Eigene Prompts duplizierbar (duplicatePromptById() in prompts.js)

## Pflichtregeln bei jeder Änderung (IMMER, keine Ausnahme)
1. Versionsnummer in `index.html` erhöhen (Header-Badge + alle `?v=X.XX` Script-Tags)
2. Changelog-Eintrag in `index.html` einfügen (vor dem vorherigen Eintrag)
3. `renderArchView()` in `ui.js` aktualisieren – Versionsnummer + neue Features/Module
4. Diese `CLAUDE.md` aktualisieren – Version + Architektur-Änderungen
5. Git-Befehl am Ende automatisch anzeigen
6. Erst Plan erklären, dann auf Daniels Go warten – NIEMALS direkt loslegen

## Projektübersicht
- **App-Name:** Distill Voice (ehemals Transkriptions-Dashboard-Cloud)
- **GitHub:** dndesi/Transkriptions-Dashboard-Cloud
- **Hosting:** GitHub Pages · `dndesi.github.io/Transkriptions-Dashboard-Cloud/`
- **Stack:** Vanilla JS (ES2022), HTML5, CSS Custom Properties – kein Framework, kein Build-Step
- **KI-Modell:** claude-sonnet-4-6 (Browser-Fetch, direkt)
- **Speicher:** IndexedDB (Sessions + Projekte via `storage.js`), localStorage (API-Keys, Prompts, Theme)

## JS-Module (27 Dateien)
| Datei | Aufgabe |
|---|---|
| `app.js` | Initialisierung, Theme, Drag & Drop |
| `config.js` | Globaler State: API-Keys, Sessions[], Drive-Token, Preise |
| `aiProvider.js` | KI-Anbieter-Vermittlungsschicht (v6.58): Claude/Mistral-Auswahl, callMistralAPI() |
| `storage.js` | IndexedDB: initStorage(), saveSessions(), saveProjects(), Auto-Migration |
| `auth.js` | Google OAuth 2.0 (GIS), progressive Auth, Werbeblocker-Fallback |
| `claude.js` | KI-Analyse, _buildFollowUpContext(), askFollowUp(), Präsentation, Anonymisierung |
| `assemblyai.js` | Transkription, Speaker Diarization, EU-Endpunkt |
| `recorder.js` | MediaRecorder API, Mikrofon, WebM |
| `drive.js` | Google Drive API v3, Session-JSON speichern/laden/löschen |
| `sessions.js` | Session-Verwaltung, Analyse-Felder editieren/speichern |
| `features.js` | Gesprächs-Chat, 360°, Mind Map (D3.js v7), Rollen-Logik, populatePersonaSelects() |
| `projects.js` | Projektarbeit, Projekt-Assistent, _buildProjectAnalysisContext() |
| `prompts.js` | Prompt-Bibliothek: System/Standard/Feature/Eigene/Rollen, assemblePromptText() |
| `templateLibrary.js` | Vorlagen-Datenbank: TEMPLATE_LIBRARY[] – 220 Prompt-Vorlagen-Zusammenfassungen, 15 Kategorien |
| `ui.js` | Rendering, Sidenav, Systemarchitektur-Seite, renderArchView() |
| `search.js` | Globale Suche (Text + Claude-Semantiksuche + lokale Vektorsuche) |
| `embeddings.js` | Lokale Semantiksuche: Transformers.js, IDB-Cache, embSearch() |
| `calendar.js` | Google Calendar API v3, Gmail API v1 |
| `persons.js` | Personen-Profile, Beziehungskontext, Kosten |
| `contacts.js` | Kontakte-Ebene über Projekten |
| `audio.js` | Audio-Player, Sync zu Utterances, Zeitstrahl |
| `tags.js` | Tag-System, Chips-UI, Filter |
| `notes.js` | Notizen pro Sitzung, Auto-Save |
| `import.js` | Samsung-Transcript, Plain Text, PDF.js – Multi-File |
| `scan.js` | Scan-Import: Foto/Kamera → Claude Vision OCR → Session (kein Dialog, ein Sprecher) |
| `photos.js` | Foto-Upload, Komprimierung, Claude-Bildanalyse |
| `icons.js` | Inline Lucide SVG via icon(), kein CDN |

## Kontext-Aufbau der drei Assistenten
Alle drei nutzen dieselben Rollen via `populatePersonaSelects()` (features.js).
Der Unterschied liegt AUSSCHLIESSLICH im Kontext, der an Claude übergeben wird.

| Assistent | Datei | Kontext-Funktion | Was wird mitgegeben? |
|---|---|---|---|
| Gesprächs-Chat | `features.js` | direkt | Rohes Transkript der aktuellen Sitzung |
| Analyse-Chat (Folgegespräch) | `claude.js` | `_buildFollowUpContext(session)` | Alle Analyse-Felder + eigene Prompt-Ergebnisse (session.customResults) – KEIN Rohtranskript |
| Projekt-Assistent | `projects.js` | `_buildProjectAnalysisContext(projectId, question)` | v5.87: Session-Name erkannt → nur diese, kein Limit · Fallback: alle Sitzungen, max 100k Zeichen, neueste zuerst |

## Rollen-System
- Rollen = Prompts mit `category === 'rolle'` in der Prompt-Bibliothek
- Aufbau via `_buildRoleSystemPrompt(promptId)` in `features.js`
- Felder: Rolle, Tonalität, Grenzen, Kontext/Prompt-Text
- Built-in Rollen in `EDITABLE_PROMPT_DEFAULTS`, Custom-Rollen in localStorage

## Datenschutz (DSGVO)
- Vor jedem Claude-API-Call: `anonymizeText()` → API → `deanonymizeText()`
- API-Keys verlassen den Browser nie (localStorage only)
- Session-Daten in persönlicher Google Drive des Nutzers

## UI-Struktur & Views
Die App hat eine **linke Sidenav** + einen **Hauptbereich** + optionale Panels.

### Sidenav-Navigation
| Nav-Button | ID | Öffnet |
|---|---|---|
| + Neue Sitzung | — | Upload-Panel (openUploadPanel) |
| Kontakte | navKontakte | contactsView |
| Projekte | navProjects | projectsView (fixed, z-index:10) |
| Sitzungen | navGrid | browserView (Timeline/Grid) |
| Kosten | navCosts | costsView |
| Prompts | navPrompts | promptsView |
| Hilfe | — | help.html (neues Tab) |
| API-Keys | — | openApiModal() |
| Architektur | navArch | archView |
| Theme | themeToggleBtn | toggleTheme() |

### Haupt-Views (im Main-Bereich)
- `heroView` — Startseite mit Hero-Banner, 4 Cards, News-Slider
- `browserView` — Session-Browser (Timeline / Grid)
- `timelineView` — Zeitstrahl nach Monat
- `costsView` — Token-Kosten-Übersicht
- `personsView` — Personen-Profile
- `contactsView` — Kontakte-Verwaltung
- `archView` — Systemarchitektur (renderArchView in ui.js)
- `promptsView` — Prompt-Bibliothek
- `projectsView` — Projektarbeit (fixed overlay)

### Session-Detail (Einzelsitzung)
Öffnet via `showTranscript()` als Overlay mit Tabs:
- Transkript / Analysen / Mindmap / Design / Notizen / Tags
- Analysen-Sub-Tabs: Gespräch / Arbeit / Stimmung / Kapitel / Themen / 360°
- **Assistent-Sidebar** (sdc-flap, `sdcFlap`): einklappbare Sidebar mit zwei Tabs:
  - **Analyse-Chat** (`followUpMessages`) — `_buildFollowUpContext()`, `followupPersonaSelect`
  - **Gesprächs-Chat** (`askChatHistory`) — Rohtranskript, `askPersonaSelect`

### Projekt-Assistent
- Fähnchen: `projAssistFlap` (sichtbar wenn Projekt-Detail geöffnet)
- Panel: `projAssistPanel` (slide-in von rechts)
- `projAssistPersonaSelect` — Rollen-Auswahl
- `projAssistHelpBox` — Info-Box zur Sitzungserkennung (v5.88)
- `projAssistContextInfo` — zeigt aktiven Modus (Gezielt / Alle)

### Upload-Panel
Slide-in Panel mit zwei Tabs:
- **Audio-Tab**: 4 Schritte (API-Key → Sitzungsname → Drive → Datei/Aufnahme)
- **Import-Tab**: Samsung/Plain Text/PDF Import, Multi-File, Sprecher benennen

### Hero News-Slider
Kacheln mit aktuellen Features, verlinken auf news.html Anker.
Aktuelle Kacheln: Rollen (v5.89), Foto-Analyse, Lesezeichen, Kontakte/Themen, Ausgabe-Felder, Design-Versionen

## Changelog-Highlights (letzte Versionen)
| Version | Datum | Feature/Fix |
|---|---|---|
| v6.66 | 21.08.2026 | Feature: Bis zu 4 Sprecher statt fest 2 – C/D aus AssemblyAI-Diarization ins bestehende speakers-Array (_applyExtraSpeaker), checkSpeakersNamed()/toggleUtteranceSpeaker() erweitert |
| v6.65 | 15.08.2026 | Fix: PWA start_url/SW-Pfade zeigten auf altes Original-Repo statt auf diese Kopie – jetzt relativ/dynamisch (getAppPath()) |
| v6.64 | 15.08.2026 | Neue Markenfarbe Orange statt Violett – --accent/--accent2, color-mix() statt --accent-rgb, Header schwarz, Favicon/Icons neu |
| v6.63 | 15.08.2026 | Feature: Ollama als dritter KI-Anbieter – lokal, 0€, kein API-Key (callOllamaAPI, _providerLabel) |
| v6.62 | 15.08.2026 | Feature: Modell-Historie + Pillen-Switcher – erneute Analyse mit anderem Anbieter überschreibt Ergebnis nicht mehr (_archiveAnalysisRun, switchAnalysisRun) |
| v6.61 | 15.08.2026 | Feature: Eigenes Claude/Mistral-Dropdown in Analyse-Chat, Gesprächs-Chat, Projekt-Assistent (.ai-mini-select, _aiProviderOverride) |
| v6.60 | 15.08.2026 | Feature: Standard-KI-Anbieter gilt global – ~15 Key-Gates providerbewusst, Vision + Claude-Design-Export bewusst ausgenommen |
| v6.59 | 15.08.2026 | Feature: Kosten-Seite providerbewusst – Cards + Modell-Chips pro Sitzung statt fester Claude-Spalte (persons.js) |
| v6.58 | 15.08.2026 | Feature: Mistral Large 3 als Anbieter-Alternative im Analysen-Tab (js/aiProvider.js, Modell-Dropdown, providerbewusstes Kosten-Log) |
| v6.47 | 08.08.2026 | Fix: Keine AssemblyAI-Kosten für scan_import – calculateSessionCost() prüft jetzt source |
| v6.46 | 08.08.2026 | Fix: Scan-Sitzungen zeigen "Dokument · X Seiten" statt Teilnehmer/Dauer, pageCount im Datenmodell |
| v6.45 | 08.08.2026 | Feature: PDF-Upload im Scan-Import – automatische Seitenkonvertierung via PDF.js |
| v6.44 | 08.08.2026 | Feature: Scan-Text wird zu Fließtext zusammengezogen (Silbentrennung korrekt aufgelöst) |
| v6.43 | 08.08.2026 | Fix: Regression durch Small/Medium-Modell zurückgerollt, zurück auf Tiny (nachweislich bestes Ergebnis) |
| v6.42 | 08.08.2026 | PaddleOCR-Modell fest im Repo vendort (models/paddleocr/) – unabhängig von externer Quelle |
| v6.41 | 08.08.2026 | PaddleOCR: Modell "Small" statt "Tiny" + Erkennungsschwelle gesenkt, models/paddleocr/-Ordner für Vendoring vorbereitet |
| v6.40 | 08.08.2026 | PaddleOCR jetzt Standard-Engine, Tesseract entfernt (bewährt bei Spalten-/Label-Layouts) |
| v6.39 | 08.08.2026 | Feature: PaddleOCR als dritte, experimentelle Scan-Engine (Spalten/Layout-robuster als Tesseract) |
| v6.38 | 08.08.2026 | Fix: Scan-Import zählte Absätze statt Fotos als "Seiten" – jetzt 1 Foto = 1 Seite |
| v6.37 | 08.08.2026 | Fix: Scan-Notizen im Text-Tab ohne "Aufnahme"- und "Sprecher"-Bereich (kein Audio, kein zweiter Sprecher) |
| v6.36 | 08.08.2026 | Fix: Scan-Notizen im Text-Tab ohne wiederholtes "Ich"-Sprecher-Label, stattdessen "Seite N" |
| v6.35 | 08.08.2026 | Bugfix: Tesseract-Wortsalat bei EXIF-rotierten Fotos – jetzt auch über _resizePhoto() normalisiert |
| v6.34 | 08.08.2026 | Feature: Scan-Import manuelles Umsortieren/Entfernen/Zurücksetzen + Doppelseiten-Split |
| v6.33 | 08.08.2026 | Fix: Scan-Import sortiert Fotos automatisch nach Aufnahmezeitpunkt + Kontroll-Liste |
| v6.32 | 08.08.2026 | Fix: Scan-Import MD-Export (Seiten-Markierung statt "Ich"-Verschmelzung) + Tesseract.js als zweite OCR-Engine |
| v6.31 | 08.08.2026 | Feature: Neuer Sitzungstyp "Wissen" neben Privat/Arbeit/Gedanken — verhält sich wie Privat/Arbeit |
| v6.30 | 08.08.2026 | Vorlagen-Datenbank: deutsche Kategorien, Kategorie-Picker vor Prompt-Erstellung, Vorlagen bearbeiten/löschen |
| v6.29 | 08.08.2026 | Feature: Vorlagen-Datenbank — 220 Prompt-Vorlagen, filterbar (templateLibrary.js, prompts.js) |
| v6.28 | 08.08.2026 | Feature: Scan-Import — Foto/Kamera → Claude Vision OCR → Session, kein Dialog (scan.js, neuer Upload-Tab) |
| v6.25 | 03.08.2026 | Feature: Lokale Semantiksuche — Transformers.js, embeddings.js, Vektoren in IDB, kein API-Call |
| v6.24 | 01.08.2026 | Fix: MD-Überschrift — Perspektive bereinigt via _translitUmlaute() (kein & oder Sonderzeichen) |
| v6.23 | 01.08.2026 | Fix: MD-Dateiname — Teilnehmer durch Bindestrich getrennt (speakerA-speakerB statt session.label) |
| v6.22 | 01.08.2026 | Fix: MD-Export Teilnehmer — &lt;unbekannt&gt; statt ? für nicht identifizierbare Sprecher |
| v6.21 | 01.08.2026 | Fix: MD-Export SeBr-Qualität II — Perspektive sauber (nur a-z+Bindestriche), Teilnehmer unbekannt, Vorspann 1 Satz/25 Wörter, kein Duplikat |
| v6.20 | 01.08.2026 | Fix: MD-Export SeBr-Qualität — Tags (SeBr-Regeln), CodeFences, Perspektive bereinigt, Datum-Präfix im Dateinamen |
| v6.19 | 01.08.2026 | Feature: MD-Export — Transkript & Analysen als Markdown-Datei (YAML-Frontmatter, kernbefund, Second Brain) |
| v6.18 | 28.07.2026 | UX: Tooltip im Analyse-Dropdown — Kurzbeschreibung bei Mouseover (title-Attribut auf option-Element) |
| v6.17 | 26.07.2026 | Bugfix: Custom Prompt Ausgabe-Felder — extractJSON() statt regex, robust gegen ```json Wrapper und Präambel |
| v6.15 | 29.06.2026 | Bugfix: Sitzungs-Assistent Rollen-Persistenz wiederhergestellt — per-Sitzungs-Hooks aus claude.js entfernt, globale Persistenz wieder aktiv |
| v6.14 | 29.06.2026 | Feature: Pro-Chat Rollen-Persistenz — Projekt-Assistent merkt eigene Rollen per localStorage-Key mit Projekt-ID |
| v6.13 | 29.06.2026 | Bugfix: Root-Cause-Fix Rolle im Projekt-Assistenten — Rollen-Intro aus Nutzernachricht entfernt wenn Rolle aktiv (nur kontext-Teil wird gesendet) |
| v6.12 | 29.06.2026 | Bugfix: Einzelne Rolle kennt sich selbst (Meta-Hint in System-Prompt, claude.js + projects.js) + @-Direktansprache im Projekt-Assistenten (Autocomplete-Dropdown, sendProjectChatMessage) |
| v6.11 | 29.06.2026 | Bugfix: Rollen-Persistenz im Projekt-Assistenten — save on close, double restore on open, save on send |
| v6.10 | 29.06.2026 | Bugfix: Edit-Icon (edit-2), Print pro Karte, Markdown-Parser im Print-Fenster (Tabellen korrekt) |
| v6.9 | 29.06.2026 | Feature: Chat-Gedanken bearbeiten (Stift-Icon) + Drucken/PDF-Export (sessions.js + projects.js) |
| v6.8 | 28.06.2026 | Feature: Pause/Resume Direktaufnahme + Bugfix: Button-SVG pointer-events, touch-action, Textarea z-index |
| v6.7 | 28.06.2026 | UX: Design-Links — Vorschau/Paste-Zone links, Link rechts |
| v6.6 | 28.06.2026 | Feature: Screenshot-Paste für Design-Links — Clipboard → Paste-Zone → Cmd+V → gespeichert |
| v6.5 | 28.06.2026 | Feature: Design-Inhalts-Vorschau aus version.data über gespeicherten Links |
| v6.4 | 28.06.2026 | Feature: @Rollen-Direktansprache im Analyse-Chat — Autocomplete + Single-Call |
| v6.3 | 28.06.2026 | Bugfix: 360°-Analyse als eigener Tab — render360Block() ruft _refreshAnalysenSubtabs() auf |
| v6.2 | 27.06.2026 | News: 3 Blogartikel (Chat-Gedanken, Experten-Runde, Session-Erkennung) + 3 Hero-Kacheln |
| v6.1 | 27.06.2026 | UX: Chat-Gedanken — farbige Chips, Stichpunkte, ganze Karte klickbar |
| v6.0 | 27.06.2026 | Feature: Chat-Gedanken im Projekt-Assistenten — Merken-Button + Header-Button + Karten-View |
| v5.99 | 27.06.2026 | UX: Chat-Gedanken — kein Teaser, nur Headline + Quelle als Label |
| v5.97 | 27.06.2026 | UX: Chat-Gedanken — Teaser klickbar, Details inline aufklappbar (toggleChatGedanke) |
| v5.96 | 27.06.2026 | UX: Chat-Gedanken Teaser-Liste — Frage + 120-Zeichen-Vorschau statt vollständige Antwort |
| v5.95 | 27.06.2026 | Feature: Chat-Gedanken — Merken-Button in Analyse/Gesprächs-Chat, neuer Tab, session.chatGedanken[] |
| v5.94 | 27.06.2026 | Feature: Rollen-Persistenz via localStorage (distill_analyse_rollen, distill_proj_rollen) |
| v5.93 | 27.06.2026 | Markdown-Renderer, Emoji-Verbot, Fähnchen „Sitzungs-/Projekt-Assistent", Sichtbarkeits-Fix |
| v5.92 | 27.06.2026 | Fix: Farbige Rollen-Badges im Projekt-Assistenten (m.roles + Renderer) |
| v5.91 | 27.06.2026 | Fix: Farbige Rollen-Badges in Roundtable-Antworten (_renderRoundtableAnswer) |
| v5.90 | 27.06.2026 | Experten-Runde: 3 Rollen im Analyse-Chat + Projekt-Assistent, Roundtable-Modus |
| v5.89 | 26.06.2026 | Hero News-Kachel "Rollen" eingefügt |
| v5.88 | 25.06.2026 | ? Hilfe-Icon beim Projekt-Assistenten (toggleProjAssistHelp) |
| v5.87 | 25.06.2026 | Smarte Session-Erkennung + 100k Zeichenlimit im Projekt-Assistenten |
| v5.86 | 25.06.2026 | Bugfix: Neue Prompts verschwinden nicht mehr (Merge-Strategie) |
| v5.85 | 24.06.2026 | Bugfix: Debounce-Flush vor Drive-Sync |
| v5.84 | 24.06.2026 | Bugfix: Drive-Fetch-Timeout (15s), Lade-Overlay-Timeout 20s |
| v5.83 | 23.06.2026 | Bugfix: customResults Feldnamen-Fix (entry.text, entry.promptName) |
| v5.82 | 23.06.2026 | Bugfix: Projekt-Assistent-Fähnchen nach Sitzungswechsel |
| v5.81 | 23.06.2026 | Bugfix: Projekt-Assistent schließt beim Sitzungswechsel |
| v5.80 | 23.06.2026 | Feature: Mehrere Claude Design Links pro Design-Version |

## Externe Dienste
- **AssemblyAI** – Transkription (EU-Endpunkt, REST API v2)
- **Claude Sonnet** – `claude-sonnet-4-6` via Browser-Fetch
- **Mistral Large 3** – `mistral-large-latest` via Browser-Fetch (v6.58, optional, Analysen-Tab)
- **Ollama** – lokales Modell (Standard `llama3.1:latest`), `http://localhost:11434` via Browser-Fetch (v6.63, optional, kein API-Key, 0€) – kein externer Dienst, läuft auf dem eigenen Rechner
- **Google Drive API v3** – Session-Archiv als JSON
- **Google Calendar API v3** – Termine eintragen
- **Gmail API v1** – E-Mail-Entwürfe (Base64url)
- **Cloudflare Worker** – CORS-Proxy für DELETE-Requests (optional)
