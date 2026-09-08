# ADR-0033: Generische EntityTable und EntityDialog als Grundmuster; mobile Karten statt Tabellen

- Status: angenommen
- Datum: 2025-02-03
- Bereich: frontend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Die Verwaltung besteht aus Dutzenden CRUD-Masken (Veranstaltungen, Wettkämpfe, Vereine, Nutzer, Rollen, Gebühren, Vorlagen). Sie sollen gleich aussehen, gleich paginieren, dieselben Rechte prüfen und dieselben Fehler zeigen. Im Dezember 2025 kam die Anforderung, Verwaltung und Meldung auf Smartphones bedienbar zu machen; die MUI-Datagrids waren es nicht.

## Entscheidung

- **`EntityTable`** (`frontend/src/components/EntityTable.tsx`): MUI DataGrid mit serverseitiger Pagination und Sortierung über Sort-Enums, Privilegien-Checks für Anlegen/Bearbeiten/Löschen, Hinweistexte, Tabs über Query-Parameter (`6323b40d`). Der Papierkorb hängt an `DELETE` + Scope; wo es kein `DELETE`-Privileg gibt, laufen Löschaktionen über `customEntityActions` ([ADR-0035](0035-nutzer-onboarding-einladung-ohne-delete-privileg.md)).
- **`EntityDialog`** (`EntityDialog.tsx`): react-hook-form-mui, Fehleranzeige aus den ErrorCodes des Backends ([ADR-0011](0011-http-fehlersemantik-und-errorcode-muster.md)), optional breiter (`632ae21a`). **`BaseDialog`** vereinheitlicht alle Modale (`1f636d41`), der **`ConfirmationProvider`** (`contexts/confirmation/`) alle Bestätigungen.
- **Formularkonventionen**: Labels stehen oberhalb der Felder (`b07ac984`); optionale Felder sind mit „optional" markiert statt Pflichtfelder mit Stern (`f1ab7e22`); Autocomplete-Defaults sind `null` (`b85f805e`); Datums-Picker öffnen beim Klick ins Textfeld (`05ea47aa`); ein eigenes `FormInputSwitch` mit Label (`3c60b330`).
- **Mobil**: `EntityTable` rendert unter kleinen Breiten `EntityCardList`/`EntityCard` statt des Grids (`e61d30f4`, `87fcbbd1`). Tooltips werden mobil ausgeschrieben, Tabs sind scrollbar, die Meldungsseiten inklusive Gebührenansicht haben eigene mobile Layouts.
- Neue Verwaltungsmasken benutzen diese Bausteine; eine eigene Tabelle oder ein eigener Dialog braucht eine Begründung (z. B. Boards, Zeitnahme-Leitstand, Stream-Regie, die keine CRUD-Masken sind).

## Verworfene Alternativen

- Alerts als Fehleranzeige in Dialogen: zurück auf `Typography` geändert (`f2842f9d`), weil Alerts im Dialog zu laut waren.
- Autocomplete-Default `{id: "", label: ""}`: verworfen zugunsten `null` (`b85f805e`), weil der Platzhalterwert als Eingabe durchrutschte.
- Responsive Umbau des DataGrids selbst: nicht gemacht; die Kartenvariante ist eine zweite Darstellung derselben Daten.

## Konsequenzen

- Jede Tabelle hat zwei Darstellungen; Spalten mit `renderCell` müssen auch in der Karte sinnvoll sein, sonst zeigt die Karte Rohwerte.
- Serverseitige Pagination verlangt für jede Entität ein Sort-Enum und einen Page-Endpunkt ([ADR-0004](0004-openapi-first-handgepflegte-yaml.md)); eine clientseitig sortierte Liste passt nicht ins Muster.
- Das Privilegien-Modell ist im Baustein verdrahtet; wer Rechte umbaut ([ADR-0010](0010-privilegien-action-resource-scope.md)), ändert das Verhalten aller Tabellen auf einmal.
- Die Formularkonventionen sind nicht technisch erzwungen; Abweichungen fallen erst im Review auf.

## Quellen

- Commits: `fa7817e0` (Data Grid WIP), `97118c74` (EntityTable, EntityDialog), `11592df0` (Fixes), `f1ab7e22` („optional"-Anzeige), `b07ac984` (Labels oben), `b85f805e` (Defaults null), `6323b40d` (Hinweise, Tabs per Query), `632ae21a` (breiter Dialog), `1f636d41` (BaseDialog), `3c60b330` (FormInputSwitch), `f2842f9d` (Alerts zurück auf Typography), `a435a12d`/`e61d30f4`/`d8c13083`/`87fcbbd1`/`274571fd`/`b02b475f` (mobile Darstellung), `05ea47aa` (Picker öffnen beim Klick)
- Code: `frontend/src/components/EntityTable.tsx`, `EntityDialog.tsx`, `BaseDialog.tsx`, `EntityCardList.tsx`, `EntityCard.tsx`, `frontend/src/contexts/confirmation/`
- Verwandte ADRs: [ADR-0004](0004-openapi-first-handgepflegte-yaml.md), [ADR-0005](0005-frontend-stack-react-vite-mui.md), [ADR-0010](0010-privilegien-action-resource-scope.md), [ADR-0011](0011-http-fehlersemantik-und-errorcode-muster.md), [ADR-0035](0035-nutzer-onboarding-einladung-ohne-delete-privileg.md)
