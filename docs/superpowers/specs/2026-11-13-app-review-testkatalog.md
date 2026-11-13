# Review-Zweig: was von Hand zu prüfen ist

Stand 13.11.2026, Zweig `claude/app-review-optimization-2d57f8`. Automatisiert belegt sind die
reinen Logik-Bausteine (Vitest), die Backend-Suite (1897 Tests, 0 Fehler, 0 übersprungen; `*HttpIT`
51 von 51) sowie Build und Lint des Frontends. **Nicht** belegt ist alles, was man sehen muss:
das Verhalten im Browser, auf dem Telefon, mit eingeschränkten Rollen, mit abgerissenem Netz und im
Betrieb hinter Proxy. Genau dafür ist diese Liste. Was hier offen steht, ist nicht verifiziert.

Konventionen: Jeder Fall hat Kennung, Vorbedingung, Schritte und erwartetes Ergebnis. Abhaken
(`[x]`) nur, wenn es in der laufenden App gesehen wurde. „390" und „1280" meinen die Fensterbreite
in Pixeln, „768" die Tablet-Breite. Vor jedem Befund im Browser-Pane `document.visibilityState`
prüfen (ein verdecktes Dokument drosselt Timer und friert Transitions ein).

## Bereits in der laufenden App belegt

Nur, was die Abschlussnotizen ausdrücklich als gesehen nennen:

- Seitenleiste und Veranstaltungsseite auf dem Seed „Zeitnahme- und Streamtest" bei 1280 und 390:
  Wettkämpfe 1–3 der Durchführung, Zustände In Vorbereitung, Läuft, Beendet, Überfällig.
- Wettkampfseite und `/config`: sieben Reiter, `react-pdf` und Worker werden erst beim Reiter
  „Dokumente & Bedingungen" geladen, bei 390 kein Querscrollen; Schublade „Wettkämpfe" öffnet und
  schließt; unbekannte Wettkampf-ID zeigt ErrorState mit „Erneut versuchen".
- Lauf-Karte: „Partie bearbeiten" gespeichert (PUT 200, Snackbar „Partie gespeichert"); „Ergebnis
  eintragen" als Primärknopf öffnet das Formular direkt; Menüeinträge für XLS, RaceClocker, Startliste
  PDF/CSV, „Lauf in Klärung", „Lauf zurücksetzen" sichtbar (Menüeintrag, nicht Ausführung);
  Leerzustand im DM-Seed; Akkordeon „Ummeldungen"; Startliste der Runde (CSV).
- Schnellsprung: 1280 und 390, Sprünge zu Veranstaltung, Bereich und Wettkampf, aktueller
  Wettkampfreiter bleibt, eine Anfrage bei schnellem Tippen, `/` und Escape.
- Meldung: Anlegen (3 Meldungen, 85 €) und Ändern (95 €) als Vereinsvertreter über eine eigene
  Origin, 1280; 390 px Schritte 1, 2 und 4.
- Öffentliche Oberfläche: Reiter-Unterstrich bei `?tab=schedule`, „Mein Event" läuft bei 390 nicht
  mehr aus dem Bild, `<p>` in `<p>` im Lauf-Dialog behoben (jeweils im Browser gesehen).

## Testdaten in der lokalen Lauf-Datenbank

Die Meldeprobe hat Einträge hinterlassen (nichts gelöscht):

| Was | Wert |
|---|---|
| Nutzer (Vereinsvertreter) | `r1test-verein@example.invalid`, Id `a1a1a1a1-0000-0000-0000-000000000001` |
| Veranstaltung | „r1test Meldeprobe", Id `ad9ca81d-713a-40f1-99df-2e6f23a848a3`, öffentlich sichtbar |
| Zubehör | Gebühren, Teilnehmertyp, Wettkämpfe R1 und R2, eine Meldung (`07b7d309-…`) |
| Sitzung | per SQL in `app_user_session` anlegen (`token` ist `char(30)`, `expires_at` großzügig wegen UTC), dann in `localStorage['session.admin']` als `{"token":…,"lastUsedAt":…}` ablegen |

Weitere Teststände: Seed `docs/superpowers/seeds/2026-08-30-seed-zeitnahme-livestream.sql` (Präfix
`71ed`, Zeiten relativ zum Einspielzeitpunkt, Geräte-Token `71ed…`), `docs/seeds/seed-dm-coastal-2026.sql`
(braucht Basiszeilen), `docs/seeds/seed-block-l-wertungskategorien.sql`. Einspielen:
`docker exec -i backend-db-1 psql -U developer -d ready2race -v ON_ERROR_STOP=1 < seed.sql`.
Kein Seed enthält Teilnahmebedingungen, Challenge-Veranstaltungen mit Flag oder Rollen mit
eingeschränkten Rechten; wo ein Fall sie braucht, steht es dabei. Testdaten, die per API angelegt
werden, danach wieder löschen.

Rollen für die eingeschränkten Fälle (Block K) per Benutzerverwaltung anlegen: Vereinsvertreter
(`READ REGISTRATION OWN`), nur `STREAM`, nur `BOARD`, nur Schiedsrichter (`LIVE_DASHBOARD`), nur
`READ EVENT`, ohne `READ WEB_DAV`.

---

## A — Navigation und Veranstaltungsseite

Vorbedingung, wenn nicht anders genannt: Seed `71ed`, Admin angemeldet.

- [ ] **A1** Eingeschränkte Rollen: Mit Vereinsvertreter, nur `STREAM`, nur Schiedsrichter und nur `READ EVENT` anmelden. Erwartet: Die Seitenleiste zeigt nur die Bereiche, die `visibleEventSections` für die Rolle vorsieht; kein Eintrag führt auf eine leere oder verbotene Seite; ohne mehr als fünf sichtbare Bereiche keine Gruppenüberschriften.
- [ ] **A2** Tastatur und Screenreader: Seitenleiste mit Tab durchlaufen. Erwartet: ein Tabstopp je Eintrag, sichtbarer Fokusring, `aria-current="page"` auf dem aktiven Eintrag, `<nav>` mit Beschriftung; Breadcrumbs per Tastatur erreichbar.
- [ ] **A3** Basepath: Frontend unter einem Unterpfad ausliefern (z. B. `/r2r/`). Erwartet: Aktiver Seitenleisteneintrag, Breadcrumbs und Zurück-Pfeile stimmen (`sectionForRoute` mit `basepath`).
- [ ] **A4** Browsersprache `de-DE`: Browser auf Deutsch (Deutschland) stellen, Seite neu laden. Erwartet: Oberfläche und MUI-Texte deutsch, Sprachwähler zeigt Deutsch (nicht Englisch).
- [ ] **A5** Ungültiger Reiter: `/event/<id>?tab=xyz` öffnen. Erwartet: erster sichtbarer Bereich ist aktiv, die Seite funktioniert; in der Adresszeile bleibt `xyz` stehen (bekannt).
- [ ] **A6** Unsichtbarer Reiter: Als Vereinsvertreter `?tab=betrieb` öffnen. Erwartet: Rückfall auf den ersten sichtbaren Bereich, kein Panel des Betriebs.
- [ ] **A7** Breadcrumb-Links: Auf Unterseiten (Wettkampf, Tag, Meldung, Boards) die Breadcrumb anklicken. Erwartet: Links gehen auf den richtigen Bereich mit `?tab=`; der Link auf die Elternseite trägt kein `aria-current="page"` (offen: `activeOptions={{exact: true}}`).
- [ ] **A8** Challenge-Veranstaltung: Veranstaltung mit Challenge-Flag öffnen. Erwartet: Im Betrieb fehlen „Laufende Läufe verwalten" und „Prüfungen verwalten" (`visibleBetriebActions` mit `challengeEvent`); sonst nichts fehlt.
- [ ] **A9** Bereich „Ergebnisse & Urkunden": Als Admin und als Vereinsvertreter öffnen. Erwartet: Karte „Öffentlich" (Link, kopierbare URL), Karte „Dokumente" (Ergebnisse, Ergebnisliste, Siegerehrungsbogen, Urkunden); bei Challenge die Teilnahmeurkunden-Knöpfe; Downloads liefern Dateien mit sinnvollem Namen.
- [ ] **A10** Einstellungen: Sprungleiste (Chips) anklicken. Erwartet: Scrollt zum Block, schreibt `#anker` in die URL; Neuladen mit Anker springt zum Block.
- [ ] **A11** Bearbeiten im Seitenkopf: „Bearbeiten" mit `UPDATE EVENT` OWN/GLOBAL öffnet `EventDialog`; ohne Recht kein Knopf. Speichern ändert Name und Chips ohne Neuladen.
- [ ] **A12** Veranstaltungstag: Seite `/event/<id>/eventDay/<tag>` mit nur `UPDATE EVENT`. Erwartet: „Bearbeiten" öffnet `EventDayDialog`; nach Speichern aktualisiert sich der Titel.
- [ ] **A13** Anonyme Sicht: Abgemeldet `/event/<id>` bzw. Veranstaltungsliste öffnen. Erwartet: Weiterleitung zum Login oder öffentliche Ersatzseite, keine Seitenleiste mit Verwaltungseinträgen.
- [ ] **A14** 768: Tablet-Breite. Erwartet: Seitenleiste, Bereichsauswahl (unter `md`) und Kopf überlappen nicht; keine abgeschnittenen Aktionen.
- [ ] **A15** Mein Verein: Als Vereinsvertreter prüfen, ob es einen Direktweg zum eigenen Verein gibt. Erwartet: Eintrag „Mein Verein" in der Seitenleiste (nur mit `clubId`).
- [ ] **A16** Schnellsprung, echte Tastatur: `/` drücken, mit Pfeiltasten durch Treffer, Enter. Erwartet: Fokus im Feld, Auswahl wandert, Sprung klappt, Escape schließt.
- [ ] **A17** Schnellsprung, Rollen und Fehler: Als Vereinsvertreter, anonym (nicht sichtbar) und mit abgeschaltetem Backend. Erwartet: Vereinsvertreter sieht nur erlaubte Treffer; anonym kein Feld; bei Backend-Fehler ein Fehlerzustand, kein Absturz.
- [ ] **A18** Schnellsprung auf Posten-Seiten: Leitstand, Regie, Startanzeige öffnen. Erwartet: kein Schnellsprung in der Kopfleiste.
- [ ] **A19** Dashboard „Aktuelle Veranstaltungen": Als Admin und als Vereinsvertreter. Erwartet: Laufende zuerst, drei Direktlinks (Übersicht, Zeitplan, Betrieb nur bei sichtbarer Kachel); Vereine sehen „Aktuelle" und „Anstehende" Veranstaltungen (Überschneidung); Leerzustand, wenn nichts ansteht.
- [ ] **A20** Aktuelle Veranstaltungen, Menge: Mit mehr als 200 Veranstaltungen (oder künstlich kleinem Limit). Erwartet: Die Auswahl bleibt sinnvoll sortiert; die Liste lädt nicht spürbar langsam.
- [ ] **A21** Administration: `/administration?tab=smtp|theme|email-templates`. Erwartet: Reiter folgen dem Parameter; Seitenkopf mit Titel „System".
- [ ] **A22** Übersicht ohne Doppelkarten: Veranstaltungsübersicht öffnen. Erwartet: zwei Verweiskarten (Renntag und Meldung), keine doppelten Karten „Öffentliche Anzeigen" und „Schiedsrichter-Dashboard".
- [ ] **A23** Layoutfehler `/event/<id>/register`: Seitenleiste zeigt „Übersicht" als aktiv (bekannt, ist hier festzuhalten); `RootLayout` schiebt bei zwei Wurzelkindern den Inhalt nicht an den Boden.
- [ ] **A24** Boards- und Szenen-Seite: `BoardsPanel` und `StreamScenesPanel` zeigen keinen zweiten Titel unter dem Seitenkopf mehr (offen: eigener h5 entfernen).

## B — Wettkampfseite und Vorlagen

- [ ] **B1** Vereinssicht Wettkampfseite: Als Vereinsvertreter `/event/<id>/competition/<id>`. Erwartet: nur erlaubte Reiter, Rückfall bei `?tab=` auf unsichtbaren Reiter.
- [ ] **B2** Anonym und Challenge: Wettkampfseite anonym (öffentliche Variante) und bei Challenge-Veranstaltung. Erwartet: keine Verwaltungsaktionen; Challenge-Reiter korrekt.
- [ ] **B3** Reiter Teams, Zeitnahme, Durchführung: Je Reiter öffnen, `?tab=` setzen, Neuladen. Erwartet: Reiter bleibt, Inhalt lädt, Schublade „Wettkämpfe" aktualisiert sich nach Anlegen/Löschen (`listVersion`).
- [ ] **B4** Wettkampf bearbeiten: „Bearbeiten" im Kopf, ändern, speichern. Erwartet: Dialog öffnet auf der Wettkampfseite (nutzt `eventRoute.useParams()`), Änderung erscheint ohne Neuladen.
- [ ] **B5** Layoutsprung: Wettkampfseite frisch laden. Erwartet: Steuerelemente im Kopf erscheinen erst nach der Liste (bekannter Sprung); Platzhalter-Gruppe der Navigation mit `aria-busy` während des Ladens.
- [ ] **B6** `/config` ohne `READ WEB_DAV`: Erwartet: Reiter mit WebDAV-Inhalt fehlt oder ist leer erklärt; kein Fehler.
- [ ] **B7** `/config` Speichern: In je einem Dialog je Reiter (Vorlagen, Bausteine, Listen & Zeitnahme, Dokumente & Bedingungen, Organisation) anlegen und speichern. Erwartet: Eintrag erscheint, Dialog schließt, keine Dirty-Rückfrage ohne Änderung.
- [ ] **B8** Alte Anker: `/config?tab=startlists` und `?tab=worktypes`. Erwartet: Landen auf `lists-timing` bzw. `organisation`.
- [ ] **B9** Rechnungs-Link: Im Rechnungs-Bereich den Link auf `/config`. Erwartet: Er trägt `tab: 'organisation'`, nicht den alten Schlüssel `event-elements` (offen: `InvoicesTab.tsx`).
- [ ] **B10** PDF-Editor mit Datei: Dokumentvorlage mit Lückentext-PDF im Editor öffnen. Erwartet: Editor lädt mit neuem Worker, Vorschau erscheint, kein Konsolenfehler.
- [ ] **B11** Vorschau-Dialog Lückentext: `GapDocumentTemplatePreviewDialog` öffnen, schließen, erneut öffnen, Sprache wechseln. Erwartet: Vorschau lädt, keine veraltete URL, keine Konsolenwarnung zu Blob-URLs.
- [ ] **B12** Urkundentyp-Select: `GapDocumentTemplateDialog` neu anlegen. Erwartet: Keine Konsolenwarnung „uncontrolled value state of Select"; Auswahl funktioniert.
- [ ] **B13** `ShiftDialog` (Zeitplan verschieben): öffnen, ändern, speichern. Erwartet: Funktioniert wie vorher; Datensatz wird gespeichert (Typkorrektur ohne `@ts-expect-error`).
- [ ] **B14** Teams-Tabelle (`CompetitionRegistrationTeamTable`): Sprachwechsel, Filtern, Aktionen, Download (2×). Erwartet: Spalten aktualisieren sich, Aktionen treffen die richtige Zeile, Download-Dateien stimmen.
- [ ] **B15** Rundenstruktur Desktop: `CompetitionSetupRound` bei 1280 und unter 768. Erwartet: Unter `md` bricht die Zeile um; auf Desktop keine Layoutveränderung gegenüber vorher.
- [ ] **B16** Rundenstruktur 390: `CompetitionSetupForEvent` bei 390. Erwartet: Spalte „Gesamtplatzierung" läuft nicht aus dem Bild (bekannt offen).
- [ ] **B17** Tabelle „… anlegen" doppelt: leere `EntityTable` mit Anlegen-Knopf. Erwartet: Eine einzige Schaltfläche (offen: erscheint im Kopf und im Leerzustand).
- [ ] **B18** Freigabe-Dialog Teilnahmebedingungen (nachgeladene Daten): öffnen, ohne Änderung schließen, dann mit Änderung schließen. Erwartet: ohne Änderung keine Dirty-Rückfrage; mit Änderung Rückfrage.
- [ ] **B19** Dirty-Fehlalarm: Dialoge, deren Felder beim Öffnen selbst Werte setzen (außerhalb der sieben geprüften). Erwartet: Beim Schließen ohne Eingabe keine Rückfrage.
- [ ] **B20** Dialoge unter 768/390: Dialoge öffnen. Erwartet: Vollbild auf xs, Schließen und Speichern erreichbar.
- [ ] **B21** Tabellen: Durchführungs-, Rechnungs- und Board-Tabellen mit Suche, Sortierung, Löschen. Erwartet: Seite springt auf 0 bei Suche und Sortierung, `clampPage` nach Löschen der letzten Zeile, rote Lösch-Bestätigung „{Objektart} löschen?".

## C — Durchführung und Lauf-Karte

Vorbedingung: Wettkampf mit mehreren Runden (Seed `71ed` oder DM-Seed).

- [ ] **C1** Freilos-Tabelle: Wettkampf mit Freilos (im Seed nicht vorhanden, per Setup herstellen). Erwartet: Akkordeon „Teams mit Freilos" mit Zähler-Chip, Tabelle (`ExecutionByeTable`) stimmt.
- [ ] **C2** Zustand Klärung: Lauf in Klärung setzen (⋮ → „Lauf in Klärung setzen", Grund). Erwartet: Primärknopf „Klärung aufheben" (gefüllt), Klärung erscheint in der Karte.
- [ ] **C3** „Beenden zurücknehmen": Beendeten Lauf, ⋮ → Beenden zurücknehmen. Erwartet: Lauf wieder offen, Ergebnisse geklärt.
- [ ] **C4** „Lauf zurücksetzen": ⋮ → Zurücksetzen mit Bestätigung. Erwartet: Menüeintrag zuletzt, rot, hinter Linie; Bestätigung; danach Zustand wie vor dem Start.
- [ ] **C5** „Runde löschen" und „Runde entfällt": Rundenkopf-⋮. Erwartet: Beide sind erreichbar (2 Klicks), Löschen mit rotem OK, „Runde entfällt" nur unter der bisherigen Bedingung.
- [ ] **C6** RaceClocker-Wege: ⋮ „RaceClocker holen" und „RaceClocker-Datei". Erwartet: Funktionieren wie vorher; Hinweise mit lesbarer Farbe.
- [ ] **C7** XLS-Upload: „Ergebnis eintragen" → XLS-Weg (`MatchResultUploadDialog`). Erwartet: Datei lädt, Ergebnis übernommen; Webscorer-Filter wie bisher.
- [ ] **C8** Downloads: Startliste PDF/CSV, Ergebnis-Datei, Rundenstartliste. Erwartet: Datei kommt mit Dateiname aus der Kopfzeile an, Blob-URL wird freigegeben (kein Speicherwachstum bei wiederholtem Download).
- [ ] **C9** ErrorState und Netzfehler: Backend stoppen, Durchführung öffnen, dann Handler (aktivieren, beenden) bei gekapptem Netz. Erwartet: ErrorState mit „Erneut versuchen"; bei Handlern Meldung `common.error.network`, Sperre löst sich.
- [ ] **C10** Sprung aus dem Zeitplan: `focusMatchId` aus dem Zeitplan (Lauf anklicken). Erwartet: Durchführung öffnet, springt zur Karte (`executionMatchDomId`), Karte hervorgehoben.
- [ ] **C11** Direktaktionen: aktivieren, deaktivieren, „Läuft", „Lauf beenden", „Partie bearbeiten". Erwartet: Unverändert direkte Knöpfe, Zustand wechselt.
- [ ] **C12** Doppelklick-Schutz: Einen Primärknopf schnell doppelt klicken. Erwartet: Genau eine Anfrage (`runRequest`), Knopf gesperrt bis zur Antwort.
- [ ] **C13** Handtest der Folgerunden und Ummeldungen in der neuen Anordnung (`Substitutions`, `RoundProgressionSetting`): öffnen, ändern, speichern. Erwartet: wie bisher.
- [ ] **C14** Zeitplan-Nachladen bei offenem Dialog: Slot-/Verschiebe-/Vorziehen-/Import-Dialog offen halten, während das Backend Änderungen pusht. Erwartet: Zeitplan lädt nicht nach, solange der Dialog offen ist; beim Schließen ein Nachholen.
- [ ] **C15** Zustandsableitung öffentlich: Lauf „In Vorbereitung" auf Ergebnisseite (Zeitplan-Reiter und Live-Reiter). Erwartet: Beide Reiter zeigen denselben Zustand. Bekannter Befund: Zeitplan zeigt „Läuft", Live „In Vorbereitung" (Backend `buildProgram` leitet nicht über die eine Stelle ab); hier den Ist-Stand festhalten.

## D — Schiedsrichter-Dashboard

Vorbedingung: Seed `71ed`, 390 und 1280. Rolle mit `LIVE_DASHBOARD`.

- [ ] **D1** „Läuft": An Karte „In Vorbereitung" „Läuft" drücken. Erwartet: Sperre und Spinner, Zustand wechselt, keine Doppel-Anfrage.
- [ ] **D2** „Lauf beenden": drücken. Erwartet: 5-s-Rückgängig; einmal zurücknehmen, einmal durchlaufen lassen; bei offenen Booten Dialog DNS/DNF/DSQ/„Offen lassen".
- [ ] **D3** „In Klärung": ⋮ → „In Klärung" mit Grund. Erwartet: Klärungs-Abschnitt erscheint; „Klärung aufheben" dort und in der Läufe-Spalte; „Lauf beenden" aus der Klärung.
- [ ] **D4** Deaktivieren und Aktivieren: ⋮ „Lauf deaktivieren", dann „Lauf aktivieren". Erwartet: Zustand wechselt, Menüeinträge stimmen zum Zustand.
- [ ] **D5** Beendete Karte: ⋮ „Lauf aktivieren". Erwartet: Eintrag vorhanden und wirksam.
- [ ] **D6** Bootszeile: Boot antippen → Team-Dialog, Notiz anlegen und löschen. Erwartet: Funktioniert, Notiz bleibt nach Neuladen.
- [ ] **D7** Netz weg: Netzwerk kappen. Erwartet: Chip „Keine Verbindung" in der Kopfzeile, Handler melden Netzfehler, bei Rückkehr heilt sich die Ansicht.
- [ ] **D8** Sperre je Lauf: Während eine Anfrage für Lauf A läuft, Lauf B bedienen. Erwartet: B bleibt bedienbar, A gesperrt.
- [ ] **D9** Verdeckter Tab: Dashboard in verdecktem Tab, dann nach vorn. Erwartet: Polling pausierte, Ansicht lädt beim Zurückkehren neu.
- [ ] **D10** Titel bei 390: Kopf „Schiedsrichter-Dashboard". Erwartet: Titel nicht abgekürzt (bekannt offen) oder zumindest erkennbar.
- [ ] **D11** Dashboard in der Helfer-App: Dashboard über die Helfer-App öffnen. Erwartet: Zurück-Ziel stimmt (kein Betrieb-Ziel ohne Recht), Darstellung im `LegacyThemeScope`.
- [ ] **D12** Eingeschränkte Rolle: Nur Schiedsrichter-Recht. Erwartet: Dashboard erreichbar, keine unerlaubten Aktionen sichtbar.
- [ ] **D13** Challenge: Dashboard bei Challenge-Veranstaltung. Erwartet: sinnvolle Anzeige oder Hinweis.
- [ ] **D14** Zurück-Pfeil: Aus dem Betrieb geöffnet. Erwartet: zurück nach `?tab=betrieb`.

## E — Sprecher und Regie

- [ ] **E1** Sprecher „Als Nächstes": Sprecher-Board öffnen, Lauf wählen. Erwartet: Kasten „Als Nächstes" zeigt den nächsten Lauf, gewählter Lauf zuerst unter `lg`, kein Überlauf bei 390.
- [ ] **E2** Sprecher „Live folgen": einschalten. Erwartet: Ansicht folgt dem laufenden Lauf; Verbindungsanzeige (`speaker.connection.*`) bei Netzverlust.
- [ ] **E3** Sprecher „In Vorbereitung": Lauf „In Vorbereitung". Erwartet: Er erscheint **nicht** als „● Live" (bekannter Befund aus Feed-Zuordnung / `speakerData`); Ist-Stand festhalten.
- [ ] **E4** Sprecher Zurück: Mit `READ EVENT` zurück zum Betrieb, ohne Recht zurück nach `/speaker`.
- [ ] **E5** Regie „An": `/event/<id>/streamPanel` — „An" mit Laufwahl und Dauer, „Auto", „Aus". Erwartet: Grafik wechselt, Zustand stimmt in der Szene (OBS/Wirecast-Browserquelle).
- [ ] **E6** Regie Testmodus: Testmodus einschalten. Erwartet: Rückfrage vor dem Einschalten; Phasen 1–8 durchschalten; aus. Probemodus hinterlässt keine On-Air-Wirkung.
- [ ] **E7** Regie bei 390 und 820: Seite bedienbar, Knöpfe nicht abgeschnitten.
- [ ] **E8** Stream-Domäne im Wirecast-Handtest (Block 7 des Zeitnahme-Livestream-Katalogs): bleibt offen und wird dort geführt.
- [ ] **E9** Betrieb-Kacheln: Jede Kachel öffnen (Schiedsrichter, Regattabüro, Zeitnahme, Sprecher, Livestream, Anzeigen, Helfer). Erwartet: Reihenfolge wie `BETRIEB_TILE_ORDER`, Vollbild-Arbeitsplätze öffnen in neuem Fenster, Verwaltungsseiten im selben Fenster.
- [ ] **E10** Betrieb „Prüfungen verwalten" und „Laufende Läufe verwalten": Dialoge öffnen, speichern. Erwartet: Funktionieren aus der Schiedsrichter- bzw. Regattabüro-Kachel (nicht mehr aus der Übersicht).
- [ ] **E11** Posten-Tabelle: Anlegen und Teilen eines Postens. Erwartet: Eigene Karte, Hinweis `event.betrieb.timing.stationsHint`, Link-Teilen funktioniert; Konsole ohne MUI-X-Warnung zu `rowCount` (offen).
- [ ] **E12** Reine Board-, Stream- und Schiedsrichter-Rolle: Betrieb zeigt nur die Kacheln mit Recht; die reine STREAM-Rolle sieht „Boards verwalten" und „Sprecher-Board" nicht mehr (bewusst).
- [ ] **E13** Boards: Board mit Kacheln im Browser ansehen (Seed hat keins; eines anlegen). Erwartet: Darstellung im `LegacyThemeScope`, Push im sichtbaren Tab.
- [ ] **E14** Startanzeige: Startanzeige öffnen. Erwartet: unverändertes altes Theme, große Schrift, Alarmfarben.

## F — Helfer-App und Posten

Vorbedingung: Seed `71ed`, 390 px, Gerät oder Emulation mit Kamera nur wo genannt.

- [ ] **F1** Ziel (ARMED), 390: „Scharf schalten" 1 s halten. Erwartet: Zustand wechselt; Boot antippen → Häkchen und Zeitenliste; „Zeit ohne Zuordnung banken" entschärft; „Später zuordnen"; Entschärfen per Halten; Leertaste im entschärften Zustand tut nichts.
- [ ] **F2** Start: „Sequenz starten"; Zurück während der Sequenz. Erwartet: Rückfrage; Pausieren, Fortsetzen, Zurückspulen, Abbrechen funktionieren; Lauf-Menü ⋮ (Neustart, Fehlstart); manueller Stempel „Start".
- [ ] **F3** Zwischenzeit (Boje Nord): Boot per Tipp und Taste 1–6 stempeln. Erwartet: Marke landet am richtigen Boot.
- [ ] **F4** Telefon: Tagesablauf-Symbol oben rechts → Lauf wählen. Erwartet: Schublade schließt, Lauf gewählt.
- [ ] **F5** Zeitenliste: Marke zurücknehmen, Zuordnung ändern. Erwartet: Liste und Ergebnis folgen.
- [ ] **F6** Offline: Netz trennen, stempeln. Erwartet: Banner „n Marken warten"; nach Wiederverbinden Drain, Marken erscheinen am Server.
- [ ] **F7** Geräte-Token-Link: `?token=71edPostenBojeNord…` ohne Anmeldung. Erwartet: Kein Zurück-Pfeil, Erfassung geht.
- [ ] **F8** Token-only-Board: Board nur mit Geräte-Token öffnen. Erwartet: Lädt ohne Sitzung, kein Redirect auf Login.
- [ ] **F9** Postenliste: Fehler- und Leerzustand der Postenliste (`TimingStationList`; Backend aus, Veranstaltung ohne Posten). Erwartet: ErrorState mit Retry bzw. Leerzustand.
- [ ] **F10** Scan-Ergebnis-Seiten: QR-Code scannen (Gerät mit Kamera). Erwartet: Ergebnisseite passend zur Entität; Kamera-Hinweis `qrScanner.camera`. Keine manuelle Eingabe möglich (bekannt: bräuchte Kurzkennung im Backend).
- [ ] **F11** Einstellungen, Veranstaltungswahl, App-Dashboard: öffnen, ändern. Erwartet: Wahl bleibt gemerkt (`app.lastTimingStation`).
- [ ] **F12** Leitstand: Leitstand öffnen. Erwartet: Zeigt beim Laden nicht „Es gibt noch keine Posten" (vorbestehender Fehler: hier Ist-Stand festhalten).
- [ ] **F13** Lauftitel: Läufe mit Runden- und Partiename. Erwartet: Kein „Finale Finale" / „Vorlauf Vorlauf" (offen; Seed oder `matchTitle`).
- [ ] **F14** Boote an-/abmelden: Zwei Tipps ab App-Start (WorldsPage). Erwartet: Ablauf Check-in/-out wie vorher.
- [ ] **F15** Tipps ab App-Start: Zielposten 1 Tipp, Startposten mit Sequenz 2, Leitstand 1, Startanzeige 1, Boote an-/abmelden 1 (WorldsPage „Scannen zuerst", Posten direkt). Erwartet: Zahlen stimmen mit der Funktionsliste.
- [ ] **F16** Theme: Helfer-App im Mandanten-Theme, Board/Leitstand/Startanzeige im alten Theme. Erwartet: Alarmfarben fest, große Schrift draußen lesbar.
- [ ] **F17** Zurück-Pfeil und Rückfrage: `TimingBoardPage` mit laufender Sequenz verlassen. Erwartet: Rückfrage; ohne laufende Sequenz direkt zurück.
- [ ] **F18** Ladezustand statt geratener Ziel-Ansicht: Board laden bei langsamer Leitung. Erwartet: Ladezustand, dann die richtige Ansicht je Posten-Typ.

## G — Meldung

Vorbedingung: Vereinsvertreter `r1test-verein@example.invalid`, Veranstaltung „r1test Meldeprobe".

- [ ] **G1** Nachmeldephase: Veranstaltung mit Nachmeldefrist. Erwartet: Meldeformular zeigt die Nachmeldung, Gebühren stimmen.
- [ ] **G2** Meldeschluss: Nach Meldeschluss absenden. Erwartet: Absenden gesperrt, Hinweis verständlich.
- [ ] **G3** Dokumentbestätigung: Veranstaltung mit Dokument, das bestätigt werden muss. Erwartet: Bestätigung wird abgefragt und gespeichert.
- [ ] **G4** Wertungskategorien: Meldung mit Wertungskategorien. Erwartet: Auswahl in Zusammenfassung korrekt.
- [ ] **G5** Netzabbruch beim Absenden: Netz kappen und absenden. Erwartet: Fehler-Alert, Sperre gelöst, kein Doppelanlegen nach Wiederverbinden.
- [ ] **G6** Sprachen: Meldung in en und da. Erwartet: Texte vollständig, kein Rohschlüssel.
- [ ] **G7** 768: Meldeformular. Erwartet: lesbar, Schritte bedienbar.
- [ ] **G8** 390 Schritte: Alle Schritte, besonders 3 und die Erfolgsseite. Erwartet: Zusammenfassung zeigt Zahlen; Erfolgsseite mit zwei Knöpfen („Zur Veranstaltung", „Meldung ansehen/ändern").
- [ ] **G9** Wegnavigieren: Im halb ausgefüllten Formular weg navigieren (`useBlocker`). Erwartet: Warnung vor Datenverlust.
- [ ] **G10** Jahrgang: Neue Person anlegen. Erwartet: Jahrgang nicht vorbelegt (war 1990).
- [ ] **G11** „Alle Personen zu allen Wettkämpfen": Auswahl-Knopf. Erwartet: Beschriftung und Wirkung stimmen.
- [ ] **G12** Create und Update mit Frontend-Payload: Neu anlegen und ändern; zusätzlich Meldung mit nicht passendem `clubId` ändern. Erwartet: Beide Flüsse laufen; bei fremdem `clubId` 404 (nicht 500).
- [ ] **G13** Meldungs-Kopfknopf: Verein mit bestehender Meldung öffnet die Veranstaltungsseite. Erwartet: Knopf „Meldung ansehen/ändern" (offen: fehlt noch im `EventPage`-Kopf).
- [ ] **G14** Meldungsseite als Verein: Breadcrumb und Rücksprung. Erwartet: Breadcrumb zeigt nicht auf einen für Vereine unsichtbaren Bereich (offen).
- [ ] **G15** Formularlabel: `FormInputLabel` mit Screenreader. Erwartet: Zugänglicher Name vorhanden (offen); `TeamParticipantAutocomplete` verliert beim Tippen den Fokus nicht (Key aus dem Namen, offen).
- [ ] **G16** Vereinsseite mit eingeschränkten Rechten: Verein öffnen. Erwartet: Nur erlaubte Aktionen.
- [ ] **G17** Einladung und Registrierung: Invitation- und Verify-Registration-Seiten (`AcceptInvitationPage`, Verifizierung). Erwartet: Netzfehler wird als Netzfehler gemeldet; kein TypeScript-/Laufzeitfehler auf `error.status`.

## H — Teilnehmende und Bedingungen

Vorbedingung: Teilnahmebedingungen per API anlegen (kein Seed hat welche), danach löschen.

- [ ] **H1** Menü „Teilnehmende": `ParticipantForEventTable` mit Menü „Manuell prüfen", „Protokoll", „Offene exportieren". Erwartet: Alle drei erreichbar und wirksam.
- [ ] **H2** Manuell prüfen mit Ziel: Dialog mit Auswahlfeld Bedingung/Rolle. Erwartet: „Speichern" gesperrt ohne Bedingung, bei Bedingung je Wettkampf ohne Wettkampf; mit Auswahl wird gespeichert.
- [ ] **H3** Protokollfilter: Filter „Alle Bedingungen" und je Bedingung. Erwartet: Filter enthält auch rollengebundene Bedingungen.
- [ ] **H4** Datei-Abgleich: Datei hochladen. Erwartet: Bei einer Bedingung Vorauswahl; Hinweis, dass der Abgleich weder Rolle noch Wettkampf kennt (bekannt).
- [ ] **H5** Offene exportieren: `OpenRequirementExportDialog` öffnen. Erwartet: Funktioniert auf der Veranstaltungsseite (nutzt `eventIndexRoute.useParams()` – auf Unterseiten prüfen), Download mit korrektem Namen.
- [ ] **H6** Freigabe je Bedingung: Dialog mit nachgeladenen Daten. Erwartet: Keine Dirty-Rückfrage ohne Änderung (siehe B18).
- [ ] **H7** Vereinsvertreter und Meldungsliste: Als Verein (OWN) den Bereich „Meldungen" prüfen. Erwartet: Aktuell 403 bzw. Bereich unsichtbar, weil das Backend die Liste nur mit `ReadRegistrationGlobal` liefert (P14b offen). Ist-Stand festhalten.

## I — Öffentliche Oberfläche

- [ ] **I1** Sprachen: Startseite und Ergebnisse in en und da. Erwartet: Alle Schlüssel vorhanden.
- [ ] **I2** Challenge: Challenge-Veranstaltung auf Startseite und Ergebnissen. Erwartet: Sinnvolle Darstellung.
- [ ] **I3** „Mein Event" mit Band: QR-Band scannen/öffnen. Erwartet: Dashboard erscheint, Code nicht in der URL.
- [ ] **I4** Wertungskategorien: Ergebnisse mit Kategorien. Erwartet: Gruppierung und Reihenfolge korrekt.
- [ ] **I5** Zeilen: Ausgeschiedene, abgemeldete und bestrafte Boote in der neuen Ergebniszeile. Erwartet: Status deutlich erkennbar, Verein nur bei Fremdverein in der Besatzung.
- [ ] **I6** ErrorState: Ergebnisse bei gestopptem Backend. Erwartet: ErrorState mit „Erneut versuchen".
- [ ] **I7** „Melden" unangemeldet: Auf der Startseite „Melden" bei offener (Nach-)Meldung. Erwartet: Knopf sichtbar, führt zum Login mit Rücksprung.
- [ ] **I8** 768: Startseite und Ergebnisse. Erwartet: Layout (Canvas, maximale Breite `md`) stimmt.
- [ ] **I9** Startseite für Unangemeldete: Seitenleiste. Erwartet: Keine Verwaltungsseitenleiste (offen: liegt im `RootLayout`, ausblenden).
- [ ] **I10** Leerzustand Veranstaltungsebene: Ergebnisse ohne Ergebnisse. Erwartet: sinnvoller Text (aktuell `results.matchResults.noResults`).
- [ ] **I11** Tab-Zugänglichkeit: Reiter mit Screenreader. Erwartet: `aria-controls` zeigt auf existierende Panel-IDs (offen: IDs passen nicht).
- [ ] **I12** Limit Startseite: Mit mehr als 20 öffentlichen Veranstaltungen. Erwartet: Es werden 20 gezeigt, Link zur Gesamtliste.

## J — Sitzung, Netzfehler, Offline

- [ ] **J1** Sitzung per SQL löschen (FT-01): In `app_user_session` die Zeile des angemeldeten Admins löschen, Seite neu laden. Erwartet: Umleitung auf Login. Gegenprobe: Ein Board mit Geräte-Token läuft weiter.
- [ ] **J2** Backend stoppen (FT-02): Backend beenden, Seite neu laden, dann Backend starten. Erwartet: Token bleibt im `localStorage`, Seite zeigt Wartezustand und heilt sich (Wartezeit wächst bis 30 s); Board heilt sich selbst.
- [ ] **J3** 502 hinter nginx: Backend hinter dem Docker-nginx stoppen, neu laden. Erwartet: Sitzung bleibt erhalten (`retry`), keine Abmeldung.
- [ ] **J4** 404-Seite, Fehlerseite, Ladeseite: Unbekannte Adresse; Routenfehler erzwingen. Erwartet: `NotFoundPage`, `RouteErrorPage`, Ladezustand beim Lazy-Wechsel.
- [ ] **J5** Lazy-Seitenwechsel: Zwischen Seiten wechseln, Netzwerk drosseln. Erwartet: Ladezustand erscheint erst nach 200 ms, kein leerer Bildschirm.
- [ ] **J6** Chunk-Fehler: Nach einem neuen Build die alte Seite offen lassen und navigieren. Erwartet: Genau ein Neuladen (`chunkReload`), keine Schleife.
- [ ] **J7** PWA offline: Helfer-App installiert, Netz weg. Erwartet: Start aus Precache, Schreibaktionen gesperrt mit Hinweis ([ADR-0077](../../adr/0077-helfer-app-als-pwa.md)).
- [ ] **J8** Sprachwechsel in der UI: Sprache umstellen. Erwartet: Texte, MUI-Locale und Sprachwähler konsistent; lazy geladene Sprache de/da erscheint.
- [ ] **J9** Netzfehler bei Absende-Handlern: Je Handler-Gruppe (Event, Verein, Benutzer, Dokumente) Netz kappen und absenden. Erwartet: `common.error.network`, Sperre gelöst, Dialog bleibt offen mit Eingaben.
- [ ] **J10** Download-Netzfehler: Download starten, Netz kappen. Erwartet: Fehlermeldung statt hängender Anzeige; Dateinamen und Blob-Typ stimmen bei erfolgreichen Downloads.
- [ ] **J11** Noch nicht umgestellte Downloads: `ScheduleImportDialog` (Vorlage), `ScheduleStartlistExportButton`, `DocumentTable`, `ChallengeResultDialog`, `OpenRequirementExportDialog`, `CompetitionExecution`, `CompetitionPlaces`, `FinalizeRegistrations`. Erwartet: Jeder Download liefert die richtige Datei; wo noch ohne `runDownload`, ist ein Netzfehler unbehandelt (offen).
- [ ] **J12** Snackbars: Erfolgs-/Fehler-/Warnmeldungen auslösen. Erwartet: Farben passen zu `feedbackSnackbarComponents`, lesbar.
- [ ] **J13** Doppel-Absenden: Dialog bei langsamer Leitung doppelt bestätigen. Erwartet: Eine Anfrage.
- [ ] **J14** Tabellenfehler: `EntityTable` bei Netzfehler. Erwartet: Fehlerzustand mit Retry; vorhandene Daten bleiben stehen, wenn ein späterer Abruf scheitert.
- [ ] **J15** Verdeckter Tab: Polling-Seiten (Schiedsrichter, Durchführung) im Hintergrund. Erwartet: Pausiert und beim Zurückkehren neu geladen.

## K — Eingeschränkte Rollen und Challenge

- [ ] **K1** Vereinsvertreter: Alle Seiten aus A, B, G durchgehen. Erwartet: Nirgends ein Verwaltungsknopf, den die Rolle nicht ausführen darf; kein 403-Rauschen in der Konsole.
- [ ] **K2** Nur `STREAM`: Betrieb, Szenen, Regie. Erwartet: Kachel „Livestream" und Regie erreichbar; „Boards verwalten" und „Sprecher-Board" nicht sichtbar.
- [ ] **K3** Nur `BOARD`: Boards verwalten. Erwartet: Kachel „Anzeigen" erreichbar, sonst nichts.
- [ ] **K4** Nur `READ EVENT`: Betrieb-Kachel „Regattabüro" und Sprecher-Rücksprung. Erwartet: Wie `betriebTiles` es vorsieht.
- [ ] **K5** Ohne `READ WEB_DAV`: `/config`. Erwartet: siehe B6.
- [ ] **K6** Challenge-Veranstaltung: Veranstaltungsseite, Wettkampfseite, Dashboard, Ergebnisse. Erwartet: Challenge-spezifische Knöpfe sichtbar, Betriebsaktionen ausgeblendet (A8).
- [ ] **K7** Anonyme Sicht: Alle öffentlichen Seiten abgemeldet. Erwartet: Keine geschützten Daten, keine Weiterleitungsschleife.
- [ ] **K8** Challenge-Ergebnis: Negatives Challenge-Ergebnis (Backend liefert jetzt 422). Erwartet: Frontend zeigt verständliche Fehlermeldung, kein generisches 500-Verhalten.

## L — Backend im Betrieb

Vorbedingung: Frisch gebautes Jar mit Stand des Zweigs, Wegwerf-Datenbank (Dump der Produktion, sofern möglich). Details zur Einführung: `2026-11-13-app-review-betriebshinweise.md`.

- [ ] **L1** Start mit dem Jar: Jar starten (eigene Env-Datei). Erwartet: Migrationen bis `V202611132020` laufen durch, App antwortet, `GET /api/health` liefert 204.
- [ ] **L2** Migrationsdauer: `V202611132000`, `…2010`, `…2020` gegen einen Produktionsabzug messen. Erwartet: Dauer in Minuten dokumentiert; kein Schreibstau.
- [ ] **L3** `V202611131900`: Vor der Migration Dubletten offener Rechnungsjobs zählen, danach prüfen. Erwartet: Genau ein offener Job je Rechnung bleibt; Verlust ist nachvollziehbar.
- [ ] **L4** `event_view`: `EXPLAIN ANALYZE` der neuen `event_view` und der neuen Indizes gegen den Produktionsabzug. Erwartet: Plan nutzt die Indizes; keine Regression gegenüber der alten Sicht.
- [ ] **L5** Login-Last: Viele gleichzeitige Logins mit 19 MiB je Hash auf dem Produktionshost (Heap). Erwartet: Kein OutOfMemory, Antwortzeiten vertretbar.
- [ ] **L6** Hinter nginx: Docker-Verbund, `TRUSTED_PROXY_HOPS=1`. Erwartet: Client-Adresse in Logs und Rate-Limit ist die echte, nicht die des Proxys; mit 0 wird `X-Forwarded-For` ignoriert.
- [ ] **L7** Mail-Links: Registrierung, Einladung, Passwort-Reset über Docker-nginx und über Hoster-Proxy. Erwartet: Mails tragen die richtige Adresse; bei Abweichung ohne `FRONTEND_ORIGINS` 422, mit gesetztem Schlüssel Erfolg.
- [ ] **L8** `FRONTEND_ORIGINS`-Warnung: Start im Modus `PROD` ohne Schlüssel. Erwartet: Warnung im Log.
- [ ] **L9** Statement-Timeout: Lange Exporte (Bündel-ZIP, WebDAV) gegen 2 Minuten. Erwartet: Export schafft es oder scheitert nachvollziehbar; sonst Wert erhöhen.
- [ ] **L10** Mailversand: Zwei Backend-Instanzen, eine Mail. Erwartet: Genau ein Versand; währenddessen ist eine Pool-Verbindung belegt.
- [ ] **L11** Löschjob für versandte Mails: Aufbewahrungsfrist gegen Produktionsdaten messen. Erwartet: Wirkung bekannt; offene Einladungen/Registrierungen bleiben.
- [ ] **L12** Sitzungsdauer: Sitzung anlegen, 1 min warten, Anfrage, `expires_at` lesen. Erwartet: Verlängerung höchstens einmal je Minute; Ablauf frühestens 6 h − 1 min nach der letzten Anfrage.
- [ ] **L13** Argon2-Umstellung: Login mit Konto mit altem (m=15) Hash. Erwartet: Login klappt, Hash wird neu geschrieben (Format m=19456).
- [ ] **L14** Websocket: Rahmen über 4 KiB senden. Erwartet: Verbindung wird geschlossen (`TOO_BIG`); normale Boards laufen weiter.
- [ ] **L15** Board-Push nach Abmeldung: Board mit Sitzung offen, Nutzer meldet sich ab. Erwartet: Push endet bzw. Board fordert neu an (offen, nicht verifiziert).
- [ ] **L16** Client-Fehler: Kaputtes JSON, zu großer Upload, falscher Content-Type. Erwartet: 400, 413, 415 statt 500; Stacktrace nur in DEV und TEST.
- [ ] **L17** Mailansicht: `/api/dev/emails` in `DEV` und in `PROD`/`STAGING`. Erwartet: nur in `DEV` erreichbar.
- [ ] **L18** Zeitzone: Container ohne `TZ`, `APP_TIMEZONE` leer. Erwartet: Ist-Starts, Countdown-Anker und Board-Zeiten stimmen mit den Zeitplan-Slots (Berlin); mit `APP_TIMEZONE` andere Zone sichtbar.
- [ ] **L19** Healthcheck: Docker-`HEALTHCHECK` auf `/api/health`. Erwartet: healthy bei laufender DB, unhealthy bei gestoppter DB.
- [ ] **L20** Pool: `DATABASE_POOL_SIZE` klein (z. B. 2) bei Mailversand und gleichzeitigen Anfragen. Erwartet: Keine Verklemmung.
- [ ] **L21** Anfrage-Arbeit auf `Dispatchers.IO`: Bei Last Websocket-Boards beobachten. Erwartet: Boards bleiben flüssig, während Abfragen laufen.
- [ ] **L22** Neue 4xx-Antworten im Frontend: 422 bei fremder `callbackUrl`, 403 bei `registrationTemplate` ohne Verein, 404 bei Meldungsänderung mit falschem `clubId`. Erwartet: Das Frontend zeigt je eine verständliche Meldung, keinen Absturz.
- [ ] **L23** Rechenregel Ummeldung (BA-11/BA-10): Ummeldung mit D-Personen auf Männer-/Frauenplätzen. Erwartet: Regel gilt großzügiger als bei der Erstmeldung; die Fachfrage, ob D-Personen beide Plätze füllen dürfen, bleibt zu klären.
- [ ] **L24** Durchführung „Nächste Runde": Wettkampf mit teils erzeugbaren Runden. Erwartet: Erzeugbare Runde bleibt stehen, es wird nicht alles zurückgerollt (BA-13).
- [ ] **L25** Pagination-Reihenfolge: Listen mit gleichen Sortierwerten. Erwartet: Reihenfolge stabil, Primärschlüssel als Nachsortierung.

---

## Zeitnahme-Durchlauf

Stand 14.11.2026. Abgehakt ist, was in der laufenden App gesehen wurde (Seed `71ed`), mit einem
Satz Beleg. Offen bleibt alles andere. Die Punkte überschneiden sich mit F und D.

Übergreifend belegt: Derselbe Laufzustand erscheint in Schiedsrichter-Dashboard, Durchführung,
Zeitplan, Live-Reiter, öffentlichem Programm und Sprecher-Board. Die Zeiten stimmen rechnerisch
(kein Stundenversatz, Zeitstrafe nur ausgewiesen). Der Lebenszyklus wurde einmal ganz durchlaufen,
einschließlich Klärung, „Beenden zurücknehmen" und „Lauf zurücksetzen".

### Posten (Seed `71ed`, 7 Punkte)

- [x] **Z-P1** Belegt: Scharfschalten, Stempeln mit und ohne Zuordnung, Rückgängig und Umhängen am Zielposten. Die Leertaste beim Entschärfen ist nicht eigens geprüft. Ziel (ARMED), 390: „Scharf schalten" 1 s halten; Boot antippen → Häkchen + Zeitenliste; „Zeit ohne Zuordnung banken" entschärft; „Später zuordnen"; Entschärfen per Halten; Leertaste entschärft tut nichts. (= F1)
- [ ] **Z-P2** Teilweise belegt: Die Startsequenz läuft bis „Läuft". Pausieren, Fortsetzen, Zurückspulen, Abbrechen und Fehlstart sind offen. Start: „Sequenz starten", Zurück währenddessen → Rückfrage; Pausieren, Fortsetzen, Zurückspulen, Abbrechen; Lauf-Menü ⋮ (Neustart, Fehlstart); manueller Stempel „Start". (= F2)
- [ ] **Z-P3** Zwischenzeit (Boje Nord): Boot per Tipp und Taste 1–6. (= F3)
- [ ] **Z-P4** Telefon: Tagesablauf-Symbol oben rechts → Lauf wählen → Schublade schließt. (= F4)
- [ ] **Z-P5** Zeitenliste: zurücknehmen, Zuordnung ändern. (= F5)
- [ ] **Z-P6** Offline: Netz trennen, stempeln → Banner „n Marken warten", nach Wiederverbinden Drain. (= F6)
- [ ] **Z-P7** Geräte-Token-Link (`?token=71edPostenBojeNord…`) ohne Anmeldung: kein Zurück-Pfeil, Erfassung geht. (= F7)

### Schiedsrichter (390 und 1280, 7 Punkte)

- [x] **Z-S1** Belegt bei 1280 px, offen bei 390 px. „Läuft" an Karte „In Vorbereitung" (Sperre + Spinner). (= D1)
- [x] **Z-S2** Belegt bei 1280 px (Beenden, Rücknahme), offen bei 390 px. „Lauf beenden" → 5-s-Rückgängig, einmal zurücknehmen, einmal durchlaufen; bei offenen Booten Dialog DNS/DNF/DSQ/Offen lassen. (= D2)
- [x] **Z-S3** Belegt bei 1280 px, offen bei 390 px. ⋮ „In Klärung" mit Grund → Klärungs-Abschnitt; „Klärung aufheben" dort und in der Läufe-Spalte; „Lauf beenden" aus der Klärung. (= D3)
- [x] **Z-S4** Belegt bei 1280 px, offen bei 390 px. ⋮ „Lauf deaktivieren", dann „Lauf aktivieren". (= D4)
- [ ] **Z-S5** Beendete Karte ⋮ „Lauf aktivieren". Erwartet seit 14.11.2026: Das Backend lehnt mit 409 ab, der Lauf bleibt beendet. Wieder geöffnet wird er über „Beenden zurücknehmen" oder „Lauf zurücksetzen" in der Durchführung. Zu prüfen ist auch, ob der Menüeintrag an einer beendeten Karte überhaupt noch erscheinen soll. (= D5)
- [x] **Z-S6** Belegt bei 1280 px, offen bei 390 px. Bootszeile → Team-Dialog, Notiz anlegen/löschen. (= D6)
- [ ] **Z-S7** Netz weg → Chip „Keine Verbindung". (= D7)

### Sprecher

- [ ] **Z-V1** „Als Nächstes" (= E1)
- [ ] **Z-V2** „Live folgen" (= E2)

### Regie

- [ ] **Z-R1** „An" mit Laufwahl und Dauer, „Auto", „Aus" (= E5)
- [ ] **Z-R2** Testmodus an (Rückfrage), Phasen 1–8, aus (= E6)

### Betrieb

- [ ] **Z-B1** Jede Kachel öffnen (= E9)
- [ ] **Z-B2** „Prüfungen verwalten" und „Laufende Läufe verwalten" (= E10)
- [ ] **Z-B3** Posten-Tabelle: Anlegen und Teilen (= E11)

### Nachträge (offen, sofern nicht abgehakt)

- [ ] **Z-N1** Startposten ohne Sitzung (nur Geräte-Token): Statt „Sequenz starten" steht ein Hinweis. Die ARMED-Leiste nennt den Lauf der scharfen Sequenz.
- [ ] **Z-N2** Durchführung ⋮ „Lauf zurücksetzen" mit interner Zeitnahme: Der Dialog nennt, dass die Posten-Marken bleiben, und widerspricht sich nicht („Gelöscht werden …"). Prüfen in de, en und da.
- [ ] **Z-N3** Lauf in Klärung: Der Zeitstrahl und die Liste „Nicht verplant" zeigen die Klärung.
- [ ] **Z-N4** Sprecher-Board: Die Legende „Live (n)" zählt nur Läufe auf dem Wasser, keine gerufenen oder strittigen.
- [x] **Z-N5** Vereinssicht: Der Bereich „Meldungen" erscheint bei READ REGISTRATION OWN, der Kopfknopf heißt „Meldung ansehen und ändern". Mit Vereinsrolle in der App gesehen.
- [x] **Z-N6** CSV-Downloads liefern eine Datei. Am 14.11.2026 im Seed `71ed` mit vorübergehend gesetztem Startlisten-Preset belegt: Startliste je Lauf (⋮ „Startliste herunterladen (CSV)"), Startliste der Runde und Startlisten-Export im Zeitplan (Zweig CSV). Jeweils wurde der Download ausgelöst, Inhaltstyp `text/csv`, CSV-Zeilen. Die Platzierungen-CSV ist nur über denselben Codepfad belegt, nicht über den Knopf: Im Seed gibt es keine Platzierungen, der Knopf ist deshalb ausgeblendet.
- [ ] **Z-N7** Durchführung und Zeitplan: „An den Start rufen" oder „Läuft" an einem inzwischen beendeten Lauf (veralteter Tab) zeigt „Der Lauf ist bereits beendet …". Der Lauf bleibt beendet.
- [ ] **Z-N8** Rückfragen haben in der Verwaltung das Verwaltungs-Theme (Radius 12, Fokusring, dunkler Text auf Rot) und an Posten, Regie und Helfer-App deren eigenes. Die Verwaltung ist an „Lauf zurücksetzen" belegt; Posten, Regie und Helfer-App sind offen.
- [ ] **Z-N9** Meldung halb ausgefüllt, oben rechts „Abmelden": Es kommt keine Rückfrage, die Abmeldung geht durch.
- [ ] **Z-N10** Helfer-App, Bändchen entfernen im Funkloch: Nur „Keine Verbindung" erscheint, kein „Bändchen entfernt", kein Rücksprung.
