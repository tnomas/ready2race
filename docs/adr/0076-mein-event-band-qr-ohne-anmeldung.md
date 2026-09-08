# ADR-0076: „Mein Event": persönliches Dashboard per Band-QR ohne Anmeldung, Code nicht in der URL, Bedingungen nur mit Freigabe

- Status: angenommen
- Datum: 2026-08-09
- Bereich: domäne, frontend, api
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Athleten sollen auf dem eigenen Handy ihre Läufe, Ergebnisse und offenen Teilnahmebedingungen sehen. Der Einstieg ist der QR-Code auf dem Teilnehmerband (`/results/<qrCodeId>`), der bisher nur weiterleitete und den Code verwarf. Die Seite wird auf fremden Geräten geöffnet, und personenbezogene Links dürfen nicht durch Chatgruppen wandern. `participant` hat keine Spalte für ein Konto; bei Regatten meldet der Verein, nicht die Person.

## Entscheidung

1. **Einstieg ohne Anmeldung.** `/results/{qrCode}` ist eine Einstiegsseite: Sie legt `{qrCode, eventId, displayName}` als Liste im `localStorage` ab (`frontend/src/utils/myEventStorage.ts`) und leitet ohne Code auf `/results/event/{eventId}` mit aktivem Reiter „Mein Event" weiter. Der Code steht nie in der Adresse einer Seite, die man teilt.
2. **Öffentlicher Endpunkt** `GET /event/{eventId}/info/my-event/{qrCode}` im `publicInfo`-Rate-Limit (ADR-0009); 404 für unbekannte Codes, fremde Veranstaltungen und Helferbänder. Die ganze Ergebnisseite trägt `noindex`. Caching mit derselben TTL-Regel wie das Athleten-Board (ADR-0062).
3. **Bedingungen nur mit Freigabe:** `participant_requirement.publicly_visible` (`V202608101000`, Vorgabe `false`), beschränkt auf die Rollen der Person. Die interne Notiz wird in keiner Antwort ausgeliefert; nach außen geht `requirement.public_note` (`V202608111600`) statt der internen Beschreibung, dazu das Erledigungsfenster `checkFrom/checkUntil` aus dem ersten Lauf des Rahmens.
4. **Wer im Boot sitzt, entscheidet `getActuallyParticipatingParticipants`** – dieselbe Funktion wie Ausführung, Startliste und Scan-Übersicht. Die Match-Abfrage greift bewusst zu weit (gemeldet oder eingewechselt); Rollen kommen aus Meldung und Einwechslung, ausgewechselte Rollen fallen nicht weg (die Bedingung gilt für die Veranstaltung, die Einwechslung nur für die Runde).
5. **Gerätespeicher:** Gescannte Codes bleiben mit `lastSeenAt` auf dem Gerät (stabile Reihenfolge, zuletzt gescannter aktiv); `localStorage`-Zugriffe sind gegen den Safari-Privatmodus abgesichert; Helferbänder werden nicht gemerkt. Der Reiter bleibt ohne Code sichtbar mit Hinweis; ein unverknüpftes Band ist ein erwarteter Zustand, kein Fehler.
6. Das Feld eines getippten Ergebnisses kommt aus dem bestehenden `/latest-match-results` mit `matchId`-Filter, damit `publicResultsVisibility` (ADR-0045) unverändert gilt; einmal geladen, nicht gepollt. Abmeldungen werden mit Grund gezeigt, nicht versteckt.
7. **Persönliche Daten bleiben ohne Anmeldung.** Eine Konto-Bindung an `participant` ist zurückgestellt (`2026-08-10-backlog-anmeldung-persoenliche-daten.md`); der Band-Scan ist das Konzept.

## Verworfene Alternativen

- Code in der URL: personenbezogener Link, der weitergegeben wird.
- Reine Anmeldelösung: sperrt den Großteil der Athleten aus (Jugendliche ohne E-Mail, Vereinsmeldung).
- Standard `publicly_visible = true`: Freigabe ist eine bewusste Handlung des Veranstalters, kein Nebeneffekt einer Migration.
- Manuelle Code-Eingabe: der Leerzustand verspricht keinen Code.
- Neuen Code an den Anfang der Liste rücken: Knöpfe würden unter dem Finger wandern (`9e1aaa5f`).
- Zweite Kettenauflösung im Service (`75e1ac50`) und zweite Zuordnungsregel für Bedingungen: Dopplung.
- E-Mail-Versand und Check-in/-out-Anzeige, Challenge-Veranstaltungen, Vereinskontext, Ansagen, Lageplan, Urkunden-Download: nicht gebaut, Platz freigehalten.
- Engere Rate-Limit-Gruppe: nur nötig bei erratbaren Codes.

## Konsequenzen

- Die Sicherheit hängt an der Entropie der gedruckten Band-Codes (Lieferant). Erratbare Codes würden persönliche Daten öffnen.
- Ein strittiger Lauf (ADR-0070) erscheint weiter unter „läuft gerade" – bewusst offen.
- Ersatzleute (`225d4e24`) und Tagesgruppierung kamen nach; Testkatalog Block N ist offen; das Codeformat der Bänder ist zu prüfen.
- Wer die Zuordnungsregel ändert, ändert sie für Ausführung, Startliste und Scan mit.

## Quellen

- Commits: `e78a666e`, `2122f48d`, `81b63862`, `fa641710`, `534a9f72`, `8d945137`, `858d8e8d`, `1ac42552`, `9e1aaa5f`, `3eb97dc5`, `75e1ac50`, `7088de45`, `8a70b2a9` (Mein Event); `225d4e24` (Ersatzleute); `b054324f`, `b253579f`, `448448c8`, `11b497f9`, `90e06bb9`, `710d91d3` (öffentliche Notiz, Fenster, Feld)
- Migrationen: `V202608101000__participant_requirement_publicly_visible.sql`, `V202608111600__requirement_public_note.sql`
- Code: `eventInfo.kt` (`get("/my-event/{qrCode}")`), `frontend/src/utils/myEventStorage.ts`, `frontend/src/components/results/myEvent/`
- Specs: `docs/superpowers/specs/2026-08-09-mein-event-design.md`, `docs/superpowers/specs/2026-08-10-backlog-anmeldung-persoenliche-daten.md`, `docs/superpowers/plans/2026-08-09-mein-event.md`
- Verwandte ADRs: [ADR-0009](0009-rate-limiting-im-server.md), [ADR-0038](0038-ersatzleute-als-eigene-entitaet.md), [ADR-0039](0039-helfer-app-eigener-bereich-unter-app.md), [ADR-0045](0045-oeffentliche-ergebnisse-live-tab-freigabe.md), [ADR-0062](0062-oeffentliche-anzeigen-cache-marker-rate-limit.md), [ADR-0070](0070-laufzustaende-preparing-running-klaerung.md), [ADR-0084](0084-bedingungen-geltungsbereich-und-protokoll.md)
