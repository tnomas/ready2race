# ADR-0023: Wettkampf- und Setup-Vorlagen werden kopiert, nicht referenziert

- Status: angenommen
- Datum: 2025-02-25
- Bereich: domäne
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Wettkämpfe werden aus Vorlagen (`CompetitionTemplate`) angelegt, damit ein Veranstalter „Mixed Doppelzweier" nicht bei jeder Regatta neu beschreibt. Der erste Entwurf kopierte die Eigenschaften, hielt aber zusätzlich eine Referenz auf die Vorlage. Damit hätte eine Änderung an der Vorlage bestehende Wettkämpfe still verändert, und eine Löschung der Vorlage wäre blockiert gewesen oder hätte Wettkämpfe verwaist. Dieselbe Frage stellte sich für Setup-Vorlagen (Rundenstruktur).

## Entscheidung

- Beim Anlegen eines Wettkampfs werden die Eigenschaften der Vorlage nach `competition_properties` kopiert (benannte Rollen, Gebühren, Kategorie). Danach sind Vorlage und Wettkampf unabhängig.
- Es gibt keine Referenzspalte vom Wettkampf zur Vorlage mehr: `V202507021030__adjustment_competition_template.sql` entfernt sie samt Request-Feldern (`c83cf615`). Der Vorlagen-Select im Wettkampfdialog ist nur ein Kopierhelfer, der das Formular vorbefüllt.
- Eine Wettkampfvorlage kann eine Setup-Vorlage (`CompetitionSetupTemplate`) mitbringen (`e741aec3`); beim Anlegen entsteht der Wettkampf inklusive kopierter Rundenstruktur. Setup-Vorlagen sind über einen Check-Constraint entweder Setup oder Vorlage ([ADR-0028](0028-wettkampf-setup-runden-matches-vorlagen.md)).
- Regel für künftige Vorlagenarten: Eine Vorlage ist eine Kopiervorlage. Wer eine „lebende" Verknüpfung will, braucht eine eigene Begründung und ein eigenes ADR.

## Verworfene Alternativen

- Referenz behalten und beim Vorlagen-Update per `updateMany` nullen (`863a4986`, `30d0fafe`): noch in derselben Woche durch das Entfernen der Spalte ersetzt, weil die Referenz nach dem Nullen ohnehin keine Bedeutung mehr hatte.
- Lebende Referenz mit Durchschreiben der Änderungen: nicht gebaut; Wettkämpfe laufender Veranstaltungen dürfen sich nicht durch Stammdatenpflege ändern.

## Konsequenzen

- Eine Korrektur an der Vorlage erreicht bestehende Wettkämpfe nicht; wer zehn Wettkämpfe derselben Art ändern will, ändert zehn Wettkämpfe. Das ist der Preis für Stabilität während einer Veranstaltung.
- Es lässt sich nachträglich nicht mehr feststellen, aus welcher Vorlage ein Wettkampf entstand.
- Das Kopiermuster wiederholt sich im System: Match-Namen aus dem Setup werden bei Rundenerzeugung auf die Match-Zeilen geschrieben ([ADR-0028](0028-wettkampf-setup-runden-matches-vorlagen.md)), Rechnungsdaten werden eingefroren ([ADR-0019](0019-rechnungen-aus-meldungen-snapshot.md)).

## Quellen

- Commits: `bc1aa1b9` (Request mit Template-ID oder Properties), `863a4986` (Referenz beim Update entfernen), `30d0fafe` (updateMany-Extension), `e741aec3` (Setup-Vorlage an der Wettkampfvorlage), `c83cf615` (Referenz entfernt, Dialog-Select als Kopierhelfer)
- Migrationen: `V202507021030__adjustment_competition_template.sql`
- Verwandte ADRs: [ADR-0022](0022-veranstaltungsstruktur-event-tage-wettkaempfe.md), [ADR-0028](0028-wettkampf-setup-runden-matches-vorlagen.md), [ADR-0019](0019-rechnungen-aus-meldungen-snapshot.md)
