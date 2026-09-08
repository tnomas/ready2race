# ADR-0099: Helfer-App: Scannen zuerst, Veranstaltung und Modus im Gedächtnis, Entscheidungen als reine Funktionen

- Status: angenommen
- Datum: 2026-09-02
- Bereich: frontend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Die Helfer-App unter `/app` ([ADR-0039](0039-helfer-app-eigener-bereich-unter-app.md)) verlangte vor dem ersten Scan drei Entscheidungen: Veranstaltung, Aufgabe und Modus. Upstream hatte die Reihenfolge schon einmal umgedreht (erst Funktion, dann Veranstaltung; ab 2025-09-24 erst Veranstaltung, dann Funktion). Das Band gibt aber fast alles vor, und die Zeitnahme hatte eine eigene Veranstaltungswahl in ihrer Adresse. Zusätzlich starb die Kamera-Vorschau auf der Regatta, weil instabile Effekt-Abhängigkeiten den Stream bei jedem Render neu öffneten.

## Entscheidung

- `/app` beginnt mit dem Scanner. Die Weiche `resolveEntry` (`frontend/src/components/qrApp/appEntry.ts`) leitet aus Rechten und Bestand ab, wohin es geht: gibt es eine Welt, direkt hin; gibt es mehrere, Kacheln. Welten sind `SCAN`, `TIMING` und `DASHBOARD`; Scan-Rechte werden als `ScanMode` geführt.
- Das Scan-Ergebnis hat eine echte Adresse `/app/scan/$qrCodeId`; die Band-Id reist in der Adresse. `decideScan` (`scanDecision.ts`) entscheidet aus Band, Rechten und gemerktem Modus, was passiert. Ein Band einer fremden Veranstaltung wird abgefangen.
- Gedächtnis in `localStorage` (`appMemory.ts`): die Veranstaltung (`eventId`) und der Stationsmodus unter `app.scanMode` als `{userId, eventId, mode}`. Der Modus wird beim ersten Scan gefragt und gemerkt; ein Chip am Scanner macht ihn sichtbar. Die Veranstaltung wird nur in den Einstellungen (`/app/einstellungen`) gewechselt.
- Zeitnahme-Adressen tragen keine Veranstaltung mehr; alte Adressen (`/app/scanner`, `/app/function`, `/app/user`, `/app/participant`, `/app/assign`, `/app/timing/$eventId/...`) fallen auf die Weiche zurück. Genau eine Stelle kennt Umleitungen.
- Entscheidungen sind reine, getestete Funktionen mit injizierbarem Storage (`appEntry.test.ts`, `scanDecision.test.ts`); Entprellung gehört dem Scanner, nicht dem Context ([ADR-0030](0030-tests-testcontainers-und-reine-logik.md)).
- Scanner-Härtung (seit 15.08.): Aufbau nur bei Mount oder Kamerawechsel, Callbacks über Refs, kein eigener `getUserMedia` neben der Bibliothek, Kamera per `facingMode` statt Label-Raten, race-freies Aufräumen unter StrictMode, Wiederversuch mit Backoff und sichtbarer Neustart-Knopf statt schwarzem Bild.

## Verworfene Alternativen

- **Nachfrage je Scan:** gegen den sichtbaren Modus-Chip abgewogen; das Gedächtnis gewinnt.
- **Kacheln je App-Funktion als Einstieg** (Posten-Muster vom 18.08.): durch Welten und Scan-zuerst ersetzt.
- **Reihenfolge Veranstaltung → Funktion** (Upstream 2025-09-24): Vorgeschichte; das Band ersetzt die Wahl.
- **Eigener Kamerastream parallel zur Bibliothek** und ein ungenutzter Worker: Ursache der sterbenden Vorschau.
- **Ausdrücklich nicht Teil:** Timing-Boards, Live-Dashboard, Backend und API, PWA-Mechanik ([ADR-0077](0077-helfer-app-als-pwa.md)) und Rechte.

## Konsequenzen

- Das Backend ist unverändert; alle Regeln liegen im Frontend. Ein neuer Scan-Fall ist ein Fall in `decideScan` plus Test.
- Das Gedächtnis ist je Gerät und Nutzer; ein Helfer, der das Gerät wechselt, beantwortet die Modusfrage erneut.
- Ein gemerkter Modus kann falsch sein, wenn die Station wechselt; der Chip ist die einzige Warnung.
- Alte Lesezeichen und QR-Aushänge mit den entfallenen Adressen landen auf der Weiche, nicht in einer Fehlerseite.
- Der System-Admin steht nicht in den Rollen-Sichten; Helferbänder zum Testen brauchen einen Nutzer mit Rolle.

## Quellen

- Commits: `d366cf98` (Scannen zuerst), `a685e05b` (Kamera per facingMode), `108b00c1` (Kamera-Lebenszyklus); Vorgeschichte upstream `0332e5bd` (Funktion zuerst), `0418e706` (Veranstaltung zuerst)
- Specs: `docs/superpowers/specs/2026-09-02-helfer-app-ablauf-design.md`, `docs/superpowers/plans/2026-09-02-helfer-app-ablauf.md`
- Code: `frontend/src/components/qrApp/appEntry.ts`, `frontend/src/components/qrApp/scanDecision.ts`, `frontend/src/components/qrApp/appMemory.ts`
- Verwandte ADRs: [ADR-0030](0030-tests-testcontainers-und-reine-logik.md), [ADR-0039](0039-helfer-app-eigener-bereich-unter-app.md), [ADR-0041](0041-checkin-checkout-ereignisprotokoll-arena.md), [ADR-0077](0077-helfer-app-als-pwa.md), [ADR-0085](0085-betrieb-ab-je-veranstaltungstag.md), [ADR-0093](0093-betrieb-reiter-als-renntag-einstieg.md)
