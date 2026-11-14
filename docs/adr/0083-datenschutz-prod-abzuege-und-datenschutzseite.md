# ADR-0083: Datenschutz: Produktionsabzüge bleiben aus der Historie; Datenschutzseite statt Consent-Banner

- Status: angenommen (Seite im Fork-main derzeit nicht vorhanden, siehe Konsequenzen)
- Datum: 2026-08-09
- Bereich: prozess, betrieb, frontend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Für die Tests vor der Regatta wurde die produktive Datenbank lokal gezogen: `seed-prod-crf-2026.sql` enthielt 189 echte Meldungen mit Namen, Jahrgängen und E-Mail-Adressen. Der Sitzungsarbeitsbereich unter `.claude/` war mit Worktrees auf 5,9 GB gewachsen. Der Sammelzweig geht als Merge-Request an das Upstream-Team und damit nach außen.

Zweitens: Die App speichert im Browser nur technisch notwendige Daten – Session-Token (ADR-0008, im Browser-Storage, nicht als Cookie), „Mein Event"-Codes, Geräteeinstellungen, PWA-Cache. Das ist nach § 25 Abs. 2 Nr. 2 TDDDG einwilligungsfrei, Art. 13 DSGVO verlangt aber die Offenlegung.

## Entscheidung

1. **Produktionsabzüge kommen nie ins Repository.** `.gitignore` führt das Muster `/docs/seeds/seed-prod-*.sql` – als Muster, damit spätere Abzüge mitgefangen werden – und `/.claude/`. Gepflegte Testseeds mit erfundenen Namen (`docs/seeds/seed-dm-coastal-2026.sql`) bleiben versioniert. `AGENTS.md` wird getrackt, weil es Projektanweisung ist.
2. **Kein Consent-Banner.** Stattdessen eine öffentliche Seite `/datenschutz` (deutscher Fließtext, Titel via i18n, `DatenschutzPage.tsx`), verlinkt aus beiden Logins, dem Footer und dem Ergebnis-Layout, mit vier Verweisen auf die gespeicherten Daten. Die Produktentscheidung über den Text bleibt beim Upstream-Team lambda9.
3. Die Seite ging als eigener kleiner Pull-Request #101 (`eaa9e69c`) neben #100 direkt in das Upstream-main.

## Verworfene Alternativen

- Cookie-/Consent-Banner: ohne einwilligungspflichtige Speicherung wäre er irreführend.
- „Personenbezogene Daten hinter Login": nur als Backlog notiert (`16f8e4f0`), nicht umgesetzt; die Antwort für „Mein Event" steht in ADR-0076.
- Prod-Dumps mit Ausnahme-Einträgen statt Muster: ein späterer Abzug wäre durchgerutscht.

## Konsequenzen

- **Die Datenschutzseite fehlt derzeit im Fork-main.** Sie wurde aus `feature/crf-2026` revertiert (`ad0b3d9a`), um als eigene PR zu gehen. Beim späteren Merge von `origin/main` in den Sammelzweig (`5499de9d`) kam sie nicht zurück, weil der Revert den bereits bekannten Commit neutralisierte: `DatenschutzPage.tsx` existiert in `eaa9e69c`, aber `git ls-files` im aktuellen HEAD kennt keine Datei mit „datenschutz". Dasselbe Muster traf das Theme-Logo im QR-Code (`973fa47d`, revertiert in `d611f434`). Die Wiederherstellung steht aus; die Revert-vor-Merge-Falle gehört in ADR-0100.
- Wer einen Prod-Abzug lokal braucht, muss ihn `seed-prod-*.sql` nennen; jeder andere Name landet im Repo.
- Der Seed-Generator für Abzüge liest die alten Zeitnahme-Felder und bricht seit dem Ein-Rennen-Modell (ADR-0080) ab; Abzüge sind derzeit nicht ohne Anpassung möglich.
- Änderungen an der Browser-Speicherung (neue Schlüssel, Geräte-Tokens, ADR-0088) müssen in der Datenschutzseite nachgetragen werden, sobald sie wieder existiert.

## Quellen

- Commits: `02641036`, `192a2f58`, `16f8e4f0` (gitignore, Backlog); `df28e52b` (Seite), `ad0b3d9a` (Revert), `eaa9e69c` (PR #101), `973fa47d`, `d611f434` (QR-Logo), `fd86b828` (PR #102), `5499de9d` (Merge ohne Rückkehr)
- Repo: `.gitignore` (Zeilen zu `/docs/seeds/seed-prod-*.sql` und `/.claude/`)
- Verwandte ADRs: [ADR-0008](0008-serverseitige-sessions-header-token.md), [ADR-0053](0053-ki-arbeitsdateien-nicht-im-repo.md), [ADR-0076](0076-mein-event-band-qr-ohne-anmeldung.md), [ADR-0077](0077-helfer-app-als-pwa.md), [ADR-0100](0100-fork-arbeitsweise-worktrees-merge-richtung-build-db.md)
