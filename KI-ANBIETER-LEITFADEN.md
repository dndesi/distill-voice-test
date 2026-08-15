# KI-Anbieter-Neutralität – Plan

> Lebendes Dokument. Stand: 15.08.2026 (v1)
> Zweck: Planungsgrundlage, um DiVo von einem festen Claude-API-Call auf frei wählbare Anbieter umzustellen – Priorität: lokal, Mistral (EU), sichere offene Modelle. Claude bleibt als weitere Option wählbar.

---

## 1. Ausgangslage – im Code verifiziert (15.08.2026)

- Alle KI-Aufrufe laufen durch genau zwei Funktionen in `claude.js`: `callClaudeAPI(prompt, systemPrompt)` und `callClaudeAPIVision(messageContent)`. Beide reichen an `_claudeFetchWithRetry()` (Zeile 5) weiter, die den Anthropic-Endpunkt, die Header und das Anthropic-Antwortformat kennt.
- 29 Aufrufstellen in 9 Dateien (`claude.js`, `features.js`, `prompts.js`, `persons.js`, `projects.js`, `calendar.js`, `search.js`, `scan.js`, `photos.js`) rufen ausschließlich diese zwei Funktionen auf – niemand baut sich selbst einen `fetch()`-Call. Das ist der entscheidende Hebel: der Umbau betrifft ein Nadelöhr, nicht 29 Stellen.
- Modellname ist zweimal hart codiert: `'claude-sonnet-4-6'` (claude.js Zeile 79 und 91).
- API-Key: `anthropicKey` aus `localStorage.getItem('anthropic_key')` (config.js Zeile 128). Es existiert bereits ein `proxyUrl`-Feld (`localStorage.getItem('proxy_url')`) – vermutlich Rest eines früheren Cloudflare-Proxy-Versuchs, laut Notizen aktuell nicht funktionsfähig für claude.ai (Bot-Schutz).
- Kostenrechnung (`PRICING` in config.js, Zeile 14–33) kennt nur AssemblyAI + Anthropic-Preise fest verdrahtet. `calculateSessionCost()`/`calcLogEntryCost()` rechnen ausschließlich mit `PRICING.claude`.
- Anonymisierung (`anonymizeText()`/`deanonymizeText()`) passiert im aufrufenden Code, **bevor** `callClaudeAPI()` aufgerufen wird – bereits anbieterneutral, hier ist nichts zu ändern.
- Antwortformat, auf das sich der ganze restliche Code verlässt: `{ text, inputTokens, outputTokens }`.

## 2. Zielbild

Anbieter frei umschaltbar, mit klarer Priorität:

1. **Lokal** (über Ollama, läuft auf dem MacBook selbst) – keine Daten verlassen das Gerät, kein DSGVO-Auftragsverarbeiter, keine laufenden Kosten.
2. **Mistral** – EU-Unternehmen (Frankreich), Datenverarbeitung auf EU-Infrastruktur, außerhalb US CLOUD Act.
3. **Sichere offene Modelle** – lokal über Ollama, siehe Abschnitt 3a (Modellwahl).
4. **Claude/Anthropic soll komplett raus** (Entscheidung vom 15.08.2026) – kein Fallback, kein Dauerzustand als Option. Praktisch heißt das: Anthropic-Adapter wird zwar als letzter Schritt technisch entfernt, bleibt aber während der Umsetzung so lange nutzbar, bis Mistral/Lokal nachweislich für alle Analyse-Typen brauchbare Ergebnisse liefern – sonst reißt die App während des Umbaus ab.

## 3. Hardware-Kontext (aus dem Angebot, 11.08.2026)

MacBook Pro 14" M5 Pro, 15-Core CPU / 16-Core GPU, **48 GB LPDDR5X** Unified Memory, 307 GB/s Speicherbandbreite, 1 TB SSD.

Bei Apple Silicon teilen sich CPU und GPU denselben Speicherpool – die 48 GB sind also gleichzeitig "RAM" und "VRAM". Abzüglich macOS + laufender App bleiben grob geschätzt 30–38 GB nutzbar für ein lokales Modell, je nachdem was sonst noch offen ist. Für lokale LLM-Inferenz zählt vor allem Speicherbandbreite + Kapazität, nicht die reine CPU-Kernzahl – die 48-GB-Variante ist für diesen Zweck unabhängig davon, welche Chip-Bin-Variante (schwächere/stärkere GPU) gewählt wird, weil Bandbreite und RAM-Kapazität bei beiden identisch sind.

**Aktuell (Web-Recherche 15.08.2026) für die 48-GB-Klasse empfohlen:** Gemma 4 31B (Allzweck: Reasoning, Schreiben) oder Qwen3.6 35B-A3B (Coding/agentische Aufgaben), jeweils in Q4-Quantisierung. Das ist eine Momentaufnahme – lokale Modell-Empfehlungen verschieben sich schnell, vor der Umsetzung nochmal aktuell prüfen. Wichtig für DiVo speziell: **deutsche Sprachqualität selbst testen** – die meisten Benchmarks sind englischlastig, und DiVo-Analysen (Gesprächsanalyse, Stimmung, Arbeitsanalyse) laufen komplett auf Deutsch.

### 3a. Kimi K3 geprüft – passt nicht auf diese Hardware

Kimi K3 (Moonshot AI, veröffentlicht 16./27.07.2026) wurde als Kandidat genannt und am 15.08.2026 gegengecheckt: **2,8 Billionen Parameter** (MoE, 104 Mrd. aktiv pro Token), 1M-Token-Kontext, offene Gewichte (Kimi K3 License, "open-weight" aber nicht OSI-zertifiziert Open Source).

Selbst die kleinste bekannte quantisierte Community-Version (594 GB, ~1-Bit) braucht noch **~610 GB kombinierten RAM/VRAM**. Auf der 48-GB-Maschine ist das um mehr als das 12-fache zu groß – auch die kleineren Kimi-Geschwister (K2.6 mit 1 Billion Parametern) liegen in einer völlig anderen Größenklasse als das, was ein MacBook lokal stemmen kann. Ollama/LM Studio können die Datei aktuell ohnehin noch nicht laden (llama.cpp-Unterstützung nur als offener Pull-Request, Stand 15.08.2026).

**Fazit:** Kimi K3 fällt als lokales Modell auf dieser Hardware raus. Realistische offene Alternativen für 48 GB bleiben Gemma 4 31B / Qwen3.6 35B-A3B (siehe oben) – deutlich kleiner, aber tatsächlich lokal lauffähig. Falls dir "möglichst leistungsstark und offen" wichtiger ist als "auf diesem MacBook lokal" – dafür bräuchte es einen gemieteten GPU-Server (Cloud-Hosting eines offenen Modells), das wäre dann kein rein lokaler Betrieb mehr und eine andere Kostenrechnung.

## 4. Mistral – Anbieter-Fakten (Web-Recherche 15.08.2026, Preise ändern sich – vor Umsetzung erneut prüfen)

| Modell | Input/1M Token | Output/1M Token | Hinweis |
|---|---|---|---|
| Mistral Large 3 | ~0,50 € | ~1,50 € | Flaggschiff, seit Dez. 2025 |
| Mistral Medium 3.5 | ~1,50 € | ~7,50 € | offene Gewichte, April 2026 |
| Mistral Small 4 | ~0,15 € | ~0,60 € | Budget-Modell |

Zum Vergleich: Claude Sonnet aktuell 3,00 $ / 15,00 $ pro 1M Token (aus `config.js`, Stand 03.06.2026). Mistral ist je nach Modell deutlich günstiger.

## 5. Architektur-Vorschlag

Neues Modul `js/aiProvider.js` als Vermittlungsschicht:

- Eine Einstellung `aiProvider` (`'claude' | 'mistral' | 'local'`, in localStorage) + pro Anbieter eigener Key/Endpoint (Anthropic-Key bleibt wie heute, dazu `mistralKey`, `localEndpoint` mit Default `http://localhost:11434`).
- `callClaudeAPI()`/`callClaudeAPIVision()` bleiben als Funktionsnamen bestehen (keine der 29 Aufrufstellen muss angefasst werden) – intern leiten sie an den aktuell gewählten Provider-Adapter weiter. Alternative: neutral umbenennen zu `callAI()`/`callAIVision()` mit den alten Namen als Kompatibilitäts-Alias, falls dir das sauberer ist – deine Entscheidung.
- Jeder Adapter übersetzt Anfrage (System-Prompt-Handling unterscheidet sich: Anthropic nutzt eigenes `system`-Feld, Mistral/OpenAI-kompatible APIs eine System-Message in der Message-Liste, Ollama je nach Modus ähnlich wie OpenAI) und Antwort auf das gemeinsame Format `{ text, inputTokens, outputTokens }` zurück. Bei lokalen Modellen ohne Token-Abrechnung: 0 einsetzen, Kosten-Log zeigt dann "lokal – keine Kosten".
- `PRICING` in config.js um Mistral-Sätze erweitern; jeder `claudeCostLog`-Eintrag bekommt ein Feld `provider`, damit die Kostenhistorie auch nach einem Anbieterwechsel korrekt bleibt.
- Settings-UI (vermutlich in `features.js`/`index.html`, gleiche Stelle wie der bestehende API-Key-Dialog): Dropdown "KI-Anbieter", darunter je nach Auswahl die passenden Felder.

## 6. Offene Punkte / Herausforderungen

- **Vision** (`callClaudeAPIVision`, für Scan-Import optional): Bildformate unterscheiden sich je Anbieter. Da Scan-Import ohnehin standardmäßig lokal über PaddleOCR läuft (nicht über die KI-Vision), ist das kein dringender Fall – Vision-Multi-Provider kann später kommen.
- **Fehlerbehandlung**: Der 529-Retry (`_claudeFetchWithRetry`) ist Anthropic-spezifisch (Overloaded-Code). Andere Anbieter nutzen andere Statuscodes (i.d.R. 429 für Rate-Limit) – Retry-Logik muss pro Adapter angepasst werden.
- **Prompt-Qualität**: Bestehende Prompts sind auf Claude Sonnet abgestimmt. Andere Modelle (v.a. kleinere lokale) liefern bei identischem Prompt ggf. schwächere Ergebnisse, besonders bei komplexen Analysen (Psychologische Analyse, 360°) – reines Software-Thema, kein Codefehler, sondern Nachjustierungsbedarf nach dem Wechsel.
- **Ollama-Verfügbarkeit prüfen**: Lokaler Adapter braucht einen Verbindungstest (läuft Ollama gerade, ist das gewählte Modell überhaupt heruntergeladen) mit klarer Fehlermeldung, sonst wirkt die App "kaputt" statt "Modell fehlt".

## 7. Vorschlag für die Umsetzungsreihenfolge (grob, ohne feste Versionsnummern – die vergeben wir beim Start der Umsetzung)

1. Provider-Layer + Settings-UI bauen, vorerst Claude + Mistral als Cloud-Optionen (schnell testbar, kein Ollama-Setup nötig).
2. Lokalen Adapter (Ollama) ergänzen, inkl. Verbindungs-/Modell-Check.
3. Kosten-Log providerbewusst machen (`PRICING` erweitern, `provider`-Feld im Log).
4. Prompt-Qualität pro Anbieter/Analyse-Typ gegenchecken, wo nötig nachjustieren.
5. Vision optional später, falls gewünscht.

## 8. Offene Fragen an Daniel

- ~~Bleibt Claude dauerhaft als wählbare Option bestehen?~~ **Geklärt (15.08.2026): Claude soll komplett raus.** Bleibt technisch nur solange drin, bis Mistral/Lokal für alle Analyse-Typen verlässlich funktionieren (siehe Abschnitt 2, Punkt 4) – reine Übergangslösung, kein Zielzustand.
- ~~Was heißt "sichere offene Modelle"?~~ **Geklärt: lokale Modelle.** Kimi K3 als konkreter Vorschlag geprüft und verworfen (Abschnitt 3a) – passt mit ~610 GB Speicherbedarf nicht auf die 48-GB-Maschine. Bleibt bei Gemma 4 31B / Qwen3.6 35B-A3B als realistische Kandidaten, final vor Umsetzung nochmal prüfen.
- Noch offen: Soll der Mistral-Zugang direkt in Schritt 1 mit rein, oder erstmal nur der Provider-Layer + Ollama?
