# ADR-0036: Quellcode unter GPL-3.0, lambda9 als Rechteinhaber, publiccode.yml

- Status: angenommen
- Datum: 2025-03-17
- Bereich: prozess
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Das Upstream-Team lambda9 wollte ready2race als offene Software für Sportvereine veröffentlichen und im öffentlichen Sektor auffindbar machen. Dafür brauchte das Repository eine Lizenz, einen benannten Rechteinhaber und eine maschinenlesbare Projektbeschreibung, wie sie Software-Kataloge der öffentlichen Hand erwarten. Am Tag des Umzugs nach GitHub (2025-03-17, siehe [ADR-0037](0037-upstream-entwicklungsprozess-pull-requests.md)) kamen alle drei Dinge gleichzeitig ins Repo.

## Entscheidung

- Der Quellcode steht unter der **GNU General Public License, Version 3** (`LICENSE` im Wurzelverzeichnis). Die erste Fassung vom 2025-03-17 war MIT; eine Woche später, am 2025-03-24, wurde sie durch die GPLv3 ersetzt.
- **lambda9 GmbH** ist Haupt-Rechteinhaber (`legal.mainCopyrightOwner` in `publiccode.yml`).
- `publiccode.yml` im Wurzelverzeichnis beschreibt das Projekt für öffentliche Kataloge: Kategorie Event-Management, Sprachen de/en, Plattform PostgreSQL und JRE 17, `legal.license: GPL-3.0-only`, Wartungsvertrag (`maintenance.type: contract`) mit lambda9 bis `2026-08-31`. Die Datei wird bei Änderungen an Nutzern, Logo oder Links gepflegt.
- Folgeregel für alles, was ins Repository kommt: Fremdmaterial muss GPL-verträglich sein. Kommerziell lizenzierte Schriften (etwa für Urkundenvorlagen) werden nicht mitgeliefert, sondern vom Betreiber selbst hochgeladen (siehe [ADR-0051](0051-urkunden-lueckentext-pdf-word-vorlagenpakete.md)).

## Verworfene Alternativen

- **MIT-Lizenz** (`0b06971e`): nur eine Woche gültig; die GPLv3 verpflichtet Weiterentwicklungen dazu, ebenfalls offen zu bleiben, was zum Ziel „Software für Vereine" passt.
- **Mitgelieferte Standardvorlagen mit Hausschriften**: verworfen, weil lizenzpflichtige Schriften und fremdes Material nicht unter GPL-3.0 weitergegeben werden dürfen (Spec `docs/superpowers/specs/2026-08-05-urkunden-pdf-word-design.md`).
- Eine Aktualisierung von `publiccode.yml` am 2026-05-05 wurde per „Update/Revert" (`63d4c902`) zurückgenommen; die Gründe sind nicht dokumentiert.

## Konsequenzen

- Der Fork des Projektinhabers und jede weitere Ableitung bleiben GPL-3.0; Änderungen können nicht proprietär gehalten werden. Das erleichtert Rückflüsse an Upstream per Merge-Request ([ADR-0100](0100-fork-arbeitsweise-worktrees-merge-richtung-build-db.md)).
- `publiccode.yml` nannte von März bis Juli 2025 noch `MIT`, obwohl `LICENSE` bereits GPLv3 war; erst `cd85614c` („Fix outdated license in publiccode") zog nach. Wer die Lizenz erneut ändert, muss beide Dateien anfassen.
- Das Wartungsvertragsdatum in `publiccode.yml` ist ein Pflegefeld, das ohne Anlass veraltet; Stand der Datei ist `2026-08-31`, also bereits in der Vergangenheit.
- Urkundenvorlagen-Pakete exportieren die hochgeladene Schriftdatei mit; der Hinweis am Export-Knopf erinnert an die Lizenzfrage, prüfen kann das Programm sie nicht.

## Quellen

- Commits: `0b06971e` (Add LICENSE, MIT), `6593ab73` (Add initial publiccode.yml), `90060017` (Add lambda9 as main copyright owner), `e3760945` (Change license to GPLv3), `cd85614c` (Fix outdated license in publiccode), `fb607380`, `971c58e0`, `4976268e`, `92b5e20c` (Logo), `41259ddb` (usedBy), `0a1dc83e` (Link), `63d4c902` (Update/Revert publiccode.yml)
- Dateien: `LICENSE`, `publiccode.yml`
- Specs: `docs/superpowers/specs/2026-08-05-urkunden-pdf-word-design.md` (Abschnitt „Nicht im Scope": keine Hausschrift mitliefern)
- Verwandte ADRs: [ADR-0037](0037-upstream-entwicklungsprozess-pull-requests.md), [ADR-0051](0051-urkunden-lueckentext-pdf-word-vorlagenpakete.md), [ADR-0100](0100-fork-arbeitsweise-worktrees-merge-richtung-build-db.md)
