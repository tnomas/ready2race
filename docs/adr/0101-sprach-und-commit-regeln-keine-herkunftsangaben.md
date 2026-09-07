# ADR-0101: Sprach- und Commit-Regeln: Deutsch mit Umlauten im Fork, Englisch für Upstream-Merge-Requests, keine KI-Attribution, keine Herkunftsangaben

- Status: angenommen
- Datum: 2026-08-06
- Bereich: prozess
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Der Fork arbeitet auf Deutsch: Specs, Testkataloge, Kommentare und Arbeitsnotizen. Das Upstream-Repository von lambda9 führt dagegen englisch-imperative Commit-Nachrichten ohne Präfixe. Mehrere parallele Sitzungen schrieben deutsche Kommentare mit `ae/oe/ue` statt Umlauten. Beide Repositories sind öffentlich; Konzepte sollen als Projekteigentum erscheinen, nicht als Nachbau von etwas anderem. Nach der Regatta wurden Herkunftshinweise im Zeitnahme-Modul gefunden und samt Historie bereinigt.

## Entscheidung

**Sprache**
- Deutsch mit echten Umlauten (ä, ö, ü, ß) in Kommentaren, Testnamen, i18n-Texten, Specs, Notizen und Fork-Commits. Dateinamen von Migrationen bleiben ASCII (`V202608261210__event_toene_weg.sql`).
- Domänenbegriffe sind sportneutral und folgen [ADR-0081](0081-kurzbezeichner-kennung-kuerzel-sportneutral.md): `identifier` ist die Kennung (Rennnummer), `short_name` das Kürzel; „Arena" statt „Wasser".
- Kommentare erklären das Warum, nicht das Was. Bewusste Abweichungen werden im KDoc oder Testkatalog benannt, damit sie niemand versehentlich „zusammenführt".
- Commit-Texte müssen stimmen; eine falsch behauptete Ursache wird beim Weiterarbeiten richtiggestellt.

**Commits im Fork**
- Fork-Commits sind deutsch mit Umlauten und beschreiben die Wirkung in einem Satz, zum Beispiel `Sprecher-Board: Klärungen sichtbar, Aktualisierungs-Regler entfällt` oder `Helfer-App: Scannen zuerst, Veranstaltung und Modus im Gedächtnis` (siehe `git log --since=2026-08-25 --format=%s`).
- Keine Conventional-Commit-Präfixe; sie existieren nirgends im Projekt.
- Commits tragen keine Werkzeug-Attribution und keine `Co-Authored-By`-Zeilen. Hinweise auf Werkzeuge und Arbeitsweise gehören in das Design-Dokument oder die MR-Beschreibung, nicht in Commit, Code oder Kommentar.

**Commits für Upstream-Merge-Requests**
- Vor einem Merge-Request an lambda9 werden die Nachrichten der eigenen Commits ins Englische umgeschrieben: englisch-imperativ, Betreff höchstens 50 Zeichen, Rumpf auf 72 Zeichen umgebrochen, der Rumpf sagt warum, kein Präfix. Werkzeug: `git filter-branch --msg-filter` mit Bereichsangabe auf den eigenen Zweig; vorher ein Sicherungszweig oder -Tag (`backup/…pre-english`), danach muss `git diff backup/… <zweig>` leer sein, wenn nur Nachrichten geändert wurden.
- Die MR-Beschreibung trägt eine Übersicht: Migrationen, Änderungen, Entscheidungen, Verifikation, offene Punkte, Betrieb ([ADR-0100](0100-fork-arbeitsweise-worktrees-merge-richtung-build-db.md)).

**Keine Herkunftsangaben**
- In Code, Kommentaren, Commits, Specs, i18n und Dokumentation wird nirgends genannt, woher Informationen oder Inspiration stammen; keine Formulierung wie „nach dem Muster von X" und keine fremde Software als Vorbild oder Quelle. Auch Quellenlisten in Zusammenfassungen entfallen.
- Angebundene Systeme dürfen als Integrationen genannt werden (Zeitnahmedienste wie RaceClocker und WebScorer, WebDAV-Speicher, Mischer wie Wirecast oder OBS); Anbindungs-Kommentare bleiben.
- Wird ein Verstoß gefunden, wird er umformuliert, und die Historie der betroffenen Commits wird neu geschrieben.

## Verworfene Alternativen

- **Conventional Commits:** passen nicht zum Stil des Upstream-Repositories.
- **Deutsche Commit-Texte im Upstream-MR:** das Upstream-Team liest Englisch.
- **`ae/oe/ue` statt Umlauten:** nur eine Ausweichlösung aus der Übergangszeit (noch sichtbar in Commits wie `cc8633b6`, „Geraete-Token"); seit dem 07.08. werden Umlaute ausgeschrieben.
- **`git filter-repo --refs` für den Zuschnitt einzelner Zweige:** schrieb die gesamte Vorgeschichte (1987 Commits) neu und zerstörte die gemeinsame Basis mit main; stattdessen `filter-branch` mit Bereichsangabe.
- **Anfrage an den Hosting-Support zum endgültigen Löschen alter Objekte:** Entwurf lag vor, nicht abgeschickt.

## Konsequenzen

- Jede Historien-Umschreibung macht alte Hashes in Notizen und Specs stale; das ist mehrfach passiert. Hashes vor dem 10.08.2026 gelten nicht als verlässlich, und Notizen tragen deshalb lieber Datum und Thema als SHA.
- Die Übersetzungsrunde vor einem MR ist Handarbeit (208, später 382 und 394 Commits) und braucht ein Sicherungs-Tag; wer sie vergisst, liefert eine gemischte Historie.
- Zwei Commit-Sprachen im selben Repository sind der bewusste Preis dafür, dass der Fork in seiner Arbeitssprache bleibt und Upstream in seiner liest.
- Die Regel „keine Herkunftsangaben" verlangt eine Prüfung vor jedem Upstream-MR; ein Audit am 07.09.2026 fand noch einen Verstoß in `frontend/src/components/speaker/speakerData.ts`.
- Umlaute in Dateinamen und SQL-Bezeichnern bleiben tabu; Prüfregeln für Umlaute dürfen Migrationsdateinamen nicht anmahnen.

## Quellen

- Commits: `e70d288b` (Umlaut ausgeschrieben), `66a70461`, `85714b09`, `8c9a16fd`, `558e981f` (Umlaute in Kommentaren und Tests), `cb685df6` (Plan: Umlaute in Commit-Nachrichten), `a104ece7` (Arena), `e15ebf97` (Vereinskürzel aus dem Produktkern); Belege für den Fork-Stil: `git log --since=2026-08-25 --format=%s`
- Specs: `docs/superpowers/specs/2026-07-29-live-dashboard-schiedsrichter-design.md` („Transparenz & Einordnung"), `docs/superpowers/plans/2026-07-29-live-dashboard-schiedsrichter.md`, `docs/superpowers/plans/2026-08-09-laufzustand-arena.md`, `docs/superpowers/plans/2026-09-02-helfer-app-ablauf.md` (jeweils „Global Constraints")
- Verwandte ADRs: [ADR-0037](0037-upstream-entwicklungsprozess-pull-requests.md), [ADR-0053](0053-ki-arbeitsdateien-nicht-im-repo.md), [ADR-0081](0081-kurzbezeichner-kennung-kuerzel-sportneutral.md), [ADR-0100](0100-fork-arbeitsweise-worktrees-merge-richtung-build-db.md), ADR-0102
