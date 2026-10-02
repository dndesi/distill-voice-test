# Distill Voice – Projekt-Zusammenfassung

> Erstellt am 06.09.2026 als externe Prüfgrundlage. Beschreibt Zweck, Architektur, Funktionsumfang und aktuellen Stand der App "Distill Voice" (vormals "Transkriptions-Dashboard-Cloud") zum Zeitpunkt v6.84.

---

## 1. Was ist Distill Voice?

Distill Voice ist eine private, im Alltag täglich genutzte Web-App zum Aufnehmen, Transkribieren und KI-gestützten Auswerten von Gesprächen, Notizen und Dokumenten. Sie läuft als Single-Page-App direkt im Browser (bzw. installiert als PWA auf dem Smartphone/Desktop), ohne eigenes Backend – die einzige "Serverseite" sind externe APIs (Transkription, KI-Analyse) und Google Drive als persönlicher Datenspeicher.

- **Entwickler/Nutzer:** Ein Einzelentwickler (Daniel) für den eigenen Gebrauch, kontinuierlich weiterentwickelt (aktuell Version 6.84, über 60 Versionssprünge Historie).
- **Repository:** `dndesi/Transkriptions-Dashboard-Cloud` auf GitHub, gehostet über GitHub Pages.
- **Charakter:** Kein kommerzielles Produkt, kein Team, keine externen Nutzer – ein persönliches Werkzeug, das organisch über viele kleine Iterationen gewachsen ist.

## 2. Wozu dient sie? (Zweck & Use Cases)

Der Kerngedanke: gesprochene oder handschriftliche Inhalte in strukturiertes, durchsuchbares, KI-analysiertes Wissen verwandeln – eine Art persönliches "Second Brain" für Gespräche.

Konkrete Anwendungsfälle:

1. **Gespräche aufnehmen/importieren** – eigene Mikrofonaufnahme, Teilen-Funktion vom Smartphone (Share-Target), oder Import bestehender Aufnahmen/Transkripte (z. B. Samsung-Transkript-Export, Klartext, PDF).
2. **Automatische Transkription** mit Sprechererkennung (bis zu 4 Sprecher).
3. **KI-Analyse der Transkripte**: Gesprächs-/Arbeitsanalyse, Stimmungsanalyse, Kapitel-Erkennung mit Tiefenanalyse pro Kapitel, Themen-Extraktion, eine "360°-Analyse", sowie frei definierbare eigene Prompts mit strukturierten Ausgabefeldern (Text, Liste, Tabelle, Bewertung, Checkliste u. a.).
4. **Scan-Import**: Fotos/PDFs von handschriftlichen Notizen oder Dokumenten werden per OCR (lokal via PaddleOCR oder per Bildanalyse) zu Text.
5. **Organisation**: Sitzungen lassen sich zu Projekten bündeln, Projekte zu Kontexten/Kontakten; es gibt Personenprofile mit Beziehungskontext über mehrere Sitzungen hinweg.
6. **Interaktive Nachbearbeitung**: Drei verschiedene KI-Chat-Assistenten (siehe Abschnitt 6), eine Mindmap-Ansicht, Notizen, Tags, eine globale Suche (Volltext + semantische Vektorsuche).
7. **Weiterverarbeitung**: Export als Markdown/TXT/PDF (u. a. für Obsidian-artige "Second Brain"-Nutzung), Ableitung von Kalendereinträgen und E-Mail-Entwürfen aus Gesprächsinhalten (Google Calendar/Gmail-Integration).
8. **Kostenkontrolle**: Eigene Kostenübersicht, die API-Nutzung (Transkription + KI) pro Sitzung/Monat/Anbieter aufschlüsselt.

Kurz gesagt: Distill Voice ist gleichzeitig Diktiergerät, Transkriptions-Tool, KI-Analyseplattform und persönliches Wissensarchiv in einer App.

## 3. Technischer Stack & Architektur-Grundsätze

| Aspekt | Wert |
|---|---|
| Frontend | Vanilla JavaScript (ES2022), HTML5, CSS Custom Properties |
| Framework | **Keines** – bewusst kein React/Vue/Build-Step |
| Hosting | GitHub Pages (statisch, `dndesi.github.io/Transkriptions-Dashboard-Cloud/`) |
| Persistenz lokal | IndexedDB (Sessions, Projekte), localStorage (API-Keys, Prompts, Theme, diverse Settings) |
| Persistenz remote | Google Drive des Nutzers (Session-Daten als JSON, Audiodateien) |
| Icons | Ausschließlich Lucide Icons, inline via `icon()`/`iconLucide()`, keine Emojis im Code |
| Mobile | Mobile-first: App muss auf dem Smartphone vollständig nutzbar sein |

Architektur-Grundsätze (aus `DECISIONS.md`, verbindlich):

- Single-Page-App, eine `index.html`, kein Build-System.
- Keine externen Abhängigkeiten außer Lucide (CDN), AssemblyAI, KI-APIs (Claude/Mistral/Ollama), Google APIs.
- Datenhaltung ausschließlich im eigenen Google Drive des Nutzers – kein eigener Server, keine fremde Datenbank.
- Kein direkter Push auf `main` – Feature-Branches + PR.

## 4. Datenfluss (High-Level)

```
Audio/Foto/Text-Import
        │
        ▼
Transkription (AssemblyAI, EU-Endpunkt) oder OCR (PaddleOCR lokal / Claude Vision)
        │
        ▼
Anonymisierung (anonymizeText) ── Pflichtschritt vor JEDEM KI-Call, kein Opt-in
        │
        ▼
KI-Analyse (aktuell primär Claude Sonnet, optional Mistral Large 3 oder lokal Ollama)
        │
        ▼
Deanonymisierung (deanonymizeText)
        │
        ▼
Ergebnis in Session-Objekt gespeichert → IndexedDB (lokal) + Google Drive (Sync, JSON)
        │
        ▼
Darstellung in der UI (Analysen-Tabs, Chat-Assistenten, Export, Suche, Mindmap …)
```

Wichtig: Alle KI-Aufrufe laufen technisch durch **zwei zentrale Funktionen** in `claude.js` (`callClaudeAPI()`, `callClaudeAPIVision()`), die intern über eine Vermittlungsschicht (`aiProvider.js`) an den jeweils gewählten Anbieter weiterreichen. Es gibt aktuell 29 Aufrufstellen in 9 Dateien, aber keine einzige baut sich einen eigenen `fetch()`-Call – das ist architektonisch relevant für den laufenden Umbau (siehe Abschnitt 9).

## 5. Modulübersicht (27 JS-Dateien)

| Datei | Aufgabe |
|---|---|
| `app.js` | Initialisierung, Theme, Drag & Drop |
| `config.js` | Globaler State: API-Keys, Sessions-Array, Drive-Token, Preistabellen |
| `aiProvider.js` | KI-Anbieter-Vermittlungsschicht: Claude/Mistral/Ollama-Auswahl, `callMistralAPI()`, `callOllamaAPI()` |
| `storage.js` | IndexedDB: Initialisierung, Speichern von Sessions/Projekten, Auto-Migration |
| `auth.js` | Google OAuth 2.0 (GIS), progressive Auth |
| `claude.js` | KI-Analyse-Kern, Kontextaufbau für Analyse-Chat, Anonymisierung, Exporte |
| `assemblyai.js` | Transkription inkl. Speaker Diarization, EU-Endpunkt |
| `recorder.js` | MediaRecorder API, Mikrofonaufnahme (WebM) |
| `drive.js` | Google Drive API v3 – Session-JSON speichern/laden/löschen |
| `sessions.js` | Session-Verwaltung, Bearbeiten/Speichern von Analysefeldern |
| `features.js` | Gesprächs-Chat, 360°-Analyse, Mind Map (D3.js), Rollen-Logik |
| `projects.js` | Projektarbeit, Projekt-Assistent, Kontextaufbau für Projekt-Fragen |
| `prompts.js` | Prompt-Bibliothek (System/Standard/Feature/Eigene/Rollen) |
| `templateLibrary.js` | 220 vorgefertigte Prompt-Vorlagen in 15 Kategorien |
| `ui.js` | Rendering, Sidenav, Systemarchitektur-Ansicht |
| `search.js` | Globale Suche: Volltext + KI-Semantiksuche + lokale Vektorsuche |
| `embeddings.js` | Lokale Semantiksuche via Transformers.js, Vektor-Cache in IndexedDB |
| `calendar.js` | Google Calendar API v3, Gmail API v1 |
| `persons.js` | Personenprofile, Beziehungskontext, Kostenaufschlüsselung |
| `contacts.js` | Kontakte-Ebene oberhalb von Projekten |
| `audio.js` | Audio-Player, Sync zu Transkript-Abschnitten, Zeitstrahl |
| `tags.js` | Tag-System, Filter |
| `notes.js` | Notizen pro Sitzung, Auto-Save |
| `import.js` | Import: Samsung-Transkript, Klartext, PDF (Multi-File) |
| `scan.js` | Scan-Import: Foto/Kamera → OCR → Session |
| `photos.js` | Foto-Upload, Komprimierung, Bildanalyse |
| `icons.js` | Inline Lucide-SVGs, kein CDN-Zwang |

## 6. Die drei KI-Assistenten

Alle drei nutzen dieselbe Rollen-Auswahl, unterscheiden sich aber im Kontext, der an die KI übergeben wird:

| Assistent | Datei | Kontext-Funktion | Was wird mitgegeben? |
|---|---|---|---|
| Gesprächs-Chat | `features.js` | direkt | Rohes Transkript der aktuellen Sitzung |
| Analyse-Chat (Folgegespräch) | `claude.js` | `_buildFollowUpContext()` | Alle Analyse-Felder + Ergebnisse eigener Prompts – **kein** Rohtranskript |
| Projekt-Assistent | `projects.js` | `_buildProjectAnalysisContext()` | Erkennt genannte Sitzungsnamen → nur diese; sonst Fallback auf alle Sitzungen (max. 100.000 Zeichen, neueste zuerst) |

## 7. Rollen-System

- "Rollen" sind Prompts mit `category === 'rolle'` in der Prompt-Bibliothek (z. B. bestimmte Beratertypen, Tonalitäten).
- Felder pro Rolle: Rollenbezeichnung, Tonalität, Grenzen, Kontext/Prompt-Text.
- Eingebaute Rollen sind fest im Code hinterlegt, eigene Rollen werden in localStorage gespeichert.
- Es gibt eine "Experten-Runde" (Roundtable-Modus): mehrere Rollen antworten gemeinsam auf eine Frage.

## 8. Datenschutz (DSGVO) – nicht verhandelbar

- **AssemblyAI:** EU-Server ist verpflichtender Standard (`api.eu.assemblyai.com`); Transkripte werden nach Verarbeitung sofort dort gelöscht.
- **KI-Analyse:** Weder Claude noch Mistral gelten für diesen Zweck als DSGVO-konform – echte Namen dürfen nie an die KI-API gehen, unabhängig vom gewählten Anbieter.
- **Anonymisierung ist immer aktiv, kein Opt-in, keine Ausnahme.** Pflicht-Pattern vor jedem KI-Call: `anonymizeText()` → API-Call → `deanonymizeText()`.
- API-Keys verlassen den Browser nie (nur localStorage).
- Sämtliche Nutzerdaten liegen ausschließlich im persönlichen Google Drive des Nutzers – kein eigener Server, kein Drittanbieter-Speicher.

## 9. KI-Anbieter: aktueller Stand und laufender Umbau

**Aktueller Stand (v6.84):** Drei wählbare KI-Anbieter für die Analysen:

| Anbieter | Modell | Kosten | Besonderheit |
|---|---|---|---|
| Claude (Anthropic) | `claude-sonnet-4-6` | kostenpflichtig | bisheriger Standard, Vision/OCR bleibt vorerst Claude-only |
| Mistral | `mistral-large-latest` | kostenpflichtig, günstiger | EU-Anbieter (Frankreich) |
| Ollama | z. B. `llama3.1:latest` | 0 €, lokal | läuft auf dem eigenen Rechner, kein API-Key nötig |

Umschaltbar global (Standard-Anbieter) und pro einzelnem Chat/Assistenten; ein erneuter Analyse-Lauf mit anderem Anbieter überschreibt das vorherige Ergebnis nicht mehr, sondern archiviert es (umschaltbar über kleine "Pillen" in der UI).

**Laufendes Projekt "KI-Anbieter-Neutralität"** (siehe `KI-ANBIETER-LEITFADEN.md`, Stand 15.08.2026 – **reine Planungsphase, noch kein Code umgesetzt**):

- Ziel: Claude/Anthropic soll komplett aus der App raus – kein Dauer-Fallback, nur Übergangslösung während des Umbaus.
- Ziel-Anbieter: lokal (Ollama auf dem MacBook, M5 Pro, 48 GB RAM) + Mistral (EU).
- Geprüfte lokale Modell-Kandidaten: Kimi K3 wurde verworfen (2,8 Billionen Parameter, ~610 GB RAM nötig – passt nicht auf 48 GB). Realistische Kandidaten: Gemma 4 31B, Qwen3.6 35B-A3B (Empfehlung vor Umsetzung erneut prüfen, da sich das schnell ändert).
- Architektonischer Vorteil: Alle KI-Aufrufe laufen bereits durch nur zwei zentrale Funktionen (29 Aufrufstellen in 9 Dateien müssen selbst nicht angefasst werden) – der Umbau betrifft ein Nadelöhr, keine 29 Einzelstellen.
- **Offene Entscheidung** (Stand des letzten Gesprächs): Soll der Umbau direkt im laufenden Projekt passieren oder isoliert? Drei Optionen im Raum: (1) neues Projekt bei null, (2) Klon des aktuellen Stands als eigenes, isoliertes Projekt (favorisierte Empfehlung), (3) Feature-Branch im selben Repo. Ungeklärt: wofür der zweite Git-Remote `testperson` (`github.com/dndesi/distill-voice-test.git`) angelegt wurde – könnte ggf. direkt als Basis für Option 2 dienen.
- Regel für diesen Umbau: Erst Plan kurz erklären, auf Go warten – nie direkt loslegen.

## 10. UI-Struktur

Die App hat eine linke Sidenav, einen Hauptbereich und mehrere Slide-in-Panels.

**Sidenav:** Neue Sitzung, Kontakte, Projekte, Sitzungen, Kosten, Prompts, Hilfe, API-Keys, Architektur, Theme-Umschalter.

**Haupt-Views:** Startseite (Hero-Banner + News-Slider), Session-Browser (Timeline/Grid), Zeitstrahl, Kostenübersicht, Personenprofile, Kontakteverwaltung, Systemarchitektur-Ansicht, Prompt-Bibliothek, Projektarbeit.

**Session-Detail (Overlay):** Tabs für Transkript, Analysen, Mindmap, Design, Notizen, Tags. Analysen-Unter-Tabs: Gespräch, Arbeit, Stimmung, Kapitel, Themen, 360°. Einklappbare Assistenten-Sidebar mit Analyse-Chat und Gesprächs-Chat.

**Upload-Panel:** Audio-Tab (API-Key → Sitzungsname → Drive → Datei/Aufnahme) und Import-Tab (Samsung/Klartext/PDF, Sprecher benennen) sowie ein Scan-Tab.

## 11. Kapitel-Workflow (Beispiel für einen vollständigen Analyse-Ablauf)

1. **Kapitel-Erkennung** – KI teilt das Transkript in Abschnitte (Titel, Zusammenfassung, Zeitstempel).
2. **Kapitel-Auswahl** – Nutzer wählt/entfernt Kapitel per Checkbox.
3. **Tiefenanalyse** – pro gewähltem Kapitel ein eigener KI-Call, mit Kontext-Brücke zu vorherigen Kapitel-Ergebnissen.
4. **Synthese** – abschließender KI-Call fasst alle Kapitel zu einem Gesamtbild zusammen.

## 12. Wichtige technische Parameter

| Parameter | Wert | Begründung |
|---|---|---|
| Transkript-Input-Limit | 300.000 Zeichen | entspricht ca. 5h Gespräch |
| KI-Output-Limit | 32.000 Tokens | verhindert abgeschnittene JSON-Antworten |
| Projekt-Assistent-Kontextlimit | 100.000 Zeichen (Fallback ohne erkannte Sitzung) | |
| KI-Fetch-Timeout | 300 Sekunden (alle drei Anbieter) | lange Transkripte können providerunabhängig länger dauern |
| Bis zu 4 Sprecher pro Sitzung | A–D | seit v6.66, vorher fest 2 |

## 13. Bewusste Nicht-Ziele / explizite Entscheidungen

- Kein Opt-in für Anonymisierung – immer aktiv.
- Kein direkter Push auf `main`.
- Keine Emojis im Code.
- Kein US-Server bei AssemblyAI als Standard.
- Vision/Bildanalyse (Foto-Analyse, Scan-Import per KI) bleibt bewusst Claude-only, bis ein Alternativmodell (z. B. Pixtral bei Mistral) geprüft ist.
- "Senden an Claude" / "In Claude Design öffnen" bleibt Claude-spezifisch (reine Weiterleitung zu claude.ai, kein Anbieter-Äquivalent).

## 14. Offene / geplante Features (laut `DECISIONS.md`, teils älter, Status kann sich verschoben haben)

- Vollständige Personenprofile mit psychologischer Auswertung über mehrere Sitzungen (teilweise umgesetzt, siehe `persons.js`).
- Wissensarchiv-Export nach Notion/Obsidian – Werkzeugentscheidung noch offen (MD-Export existiert bereits seit v6.19).
- Systematischer Funktionsvergleich mit plaud.ai (ursprüngliche Referenz-App beim Projektstart) – noch nicht durchgeführt.

## 15. Externe Dienste (Stand v6.84)

| Dienst | Zweck |
|---|---|
| AssemblyAI | Transkription, EU-Endpunkt, REST API v2 |
| Claude Sonnet (`claude-sonnet-4-6`) | KI-Analyse, Browser-Fetch direkt |
| Mistral Large 3 (`mistral-large-latest`) | optionale KI-Analyse-Alternative, EU-Anbieter |
| Ollama (lokal, `localhost:11434`) | optionale lokale KI-Analyse, kostenlos, kein API-Key |
| Google Drive API v3 | Session-Archiv als JSON |
| Google Calendar API v3 | Termine aus Gesprächen eintragen |
| Gmail API v1 | E-Mail-Entwürfe aus Gesprächen |
| Cloudflare Worker | optionaler CORS-Proxy für DELETE-Requests |

## 16. Repo-Fakten

- Hauptbranch `main`, aktueller Stand v6.84.
- Remote `origin`: `github.com/dndesi/Transkriptions-Dashboard-Cloud.git`
- Zweiter Remote `testperson`: `github.com/dndesi/distill-voice-test.git` (Zweck zum Stand dieser Zusammenfassung noch ungeklärt – siehe Abschnitt 9).
- Kein Build-Prozess, direktes Deployment über GitHub Pages aus dem Repo.

---

*Diese Zusammenfassung basiert auf `CLAUDE.md`, `DECISIONS.md`, `KI-ANBIETER-LEITFADEN.md`, `onboarding.md`, `README.md` und `manifest.json` im Projektordner "Distill-Voice-KI-Neutral" (Stand 06.09.2026, App-Version v6.84).*
