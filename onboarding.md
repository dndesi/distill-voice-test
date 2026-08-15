# Onboarding – Fortsetzung: KI-Anbieter-Neutralität

> Für den Start eines neuen Chats. Stand: 15.08.2026. Zweck: Diese Datei bringt einen frischen Chat direkt auf den aktuellen Stand des Themas "DiVo KI-anbieterneutral machen", ohne dass Daniel alles nochmal erklären muss.

## Zuerst lesen (in dieser Reihenfolge)

1. **CLAUDE.md** – Pflichtregeln für dieses Projekt + aktueller Versionsstand. Bei jeder neuen Coding-Session Pflicht (siehe dort: `distill-voice-onboarding`-Skill starten, falls an Code gearbeitet wird).
2. **KI-ANBIETER-LEITFADEN.md** – der vollständige Plan: Architektur-Analyse (alle KI-Aufrufe laufen über 2 zentrale Funktionen, 29 Aufrufstellen in 9 Dateien müssen nicht angefasst werden), Hardware-Kontext (MacBook Pro 14" M5 Pro, 48 GB), geprüfte Modelle, Mistral-Preise, Umsetzungsreihenfolge.

## Status: reine Planungsphase, noch kein Code angefasst

## Bereits entschiedene Punkte

- Claude/Anthropic soll **komplett raus** – kein Dauer-Fallback, nur Übergangslösung während der Umsetzung.
- Ziel-Anbieter: **lokal** (Ollama, auf dem MacBook selbst) + **Mistral** (EU-Anbieter, Frankreich).
- Kimi K3 als lokales Modell **geprüft und verworfen**: 2,8 Billionen Parameter, braucht selbst stark komprimiert noch ~610 GB RAM – passt nicht auf die 48-GB-Maschine (Faktor 12 zu groß). Realistische lokale Kandidaten stattdessen: Gemma 4 31B, Qwen3.6 35B-A3B (vor Umsetzung nochmal aktuell prüfen, Empfehlungen verschieben sich schnell).

## Offene Entscheidung (letzter Stand des Gesprächs)

Frage: Soll der Umbau direkt im laufenden DiVo-Projekt passieren, oder isoliert? Daniels Sorge: ein gut laufendes, täglich genutztes System nicht kaputt machen.

Drei besprochene Optionen:

1. **Neues Projekt bei null** – sauberste Trennung, aber Risiko des "Second-System-Effekts": über 60 Versionen an Feature-Reife (Personen, Scan-Import, Kalender-Sync, Drive-Sync, Projekte, Embeddings …) müssten neu gebaut werden.
2. **Klon des aktuellen Stands als eigenes Projekt** – meine Empfehlung: volle Funktionsparität ab Tag 1, komplett isoliert vom täglich genutzten Original, später entweder Umbenennung zum neuen Haupt-DiVo oder Rück-Merge der Änderungen.
3. **Feature-Branch im selben Repo** – wurde in diesem Projekt früher schon genutzt (`feature/v4.14-...` usw.), technisch sauber von `main` getrennt.

**Noch offene Rückfrage an Daniel:** Wofür wurde der zweite Git-Remote `testperson` → `github.com/dndesi/distill-voice-test.git` angelegt? Falls das bereits ein Testklon ist, könnte er direkt als Basis für Option 2 dienen – müsste noch geklärt werden, bevor die finale Entscheidung fällt.

## Repo-Fakten (verifiziert 15.08.2026)

- Git-Status zu diesem Zeitpunkt: `main` sauber, letzter Commit `v6.57`.
- Remote `origin`: `https://github.com/dndesi/Transkriptions-Dashboard-Cloud.git`
- Remote `testperson`: `https://github.com/dndesi/distill-voice-test.git`

## Nächster Schritt

Sobald geklärt ist, **wo** gebaut wird (Klon / Branch / neues Projekt), aus dem KI-ANBIETER-LEITFADEN.md konkrete Versionsschritte machen und mit Schritt 1 starten – erst nach Daniels ausdrücklichem Go.

## Regeln, die weiterhin gelten

- Erst Plan kurz erklären, auf Go warten – nie direkt loslegen.
- Bei jeder Codeänderung: Versionsnummer + Changelog + `renderArchView()` + CLAUDE.md aktualisieren.
- Am Ende jeder Coding-Einheit den fertigen git-Befehl ausgeben (`distill-voice-git-push`-Skill).
- Bei neuem Programmcode: `karpathy-coding-principles`-Skill nutzen.
