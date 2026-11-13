# ADR-0103: Veranstaltungsbereiche in der Seitenleiste nach Lebenszyklus, Seitenkopf mit Breadcrumbs, Reiter per Suchparameter

- Status: angenommen
- Datum: 2026-11-13
- Bereich: frontend
- Rekonstruiert: ja, aus der Commit-Historie des Zweigs

## Kontext

Die Veranstaltungsseite war eine Reiterleiste mit neun Reitern in willkürlicher Reihenfolge; Wettkampfseite und Konfiguration hatten eigene Reiter, die in der Adresse nicht auftauchten. Wer am Renntag vom Zeitplan zu einem Wettkampf und zurück wollte, verlor Kontext, Zurück-Pfeile riefen `history.back()`, und jede Seite baute ihren Kopf selbst (mehrere `h1`, kein Pfad). Die Seitenleiste war schon da, trug aber nur globale Einträge.

## Entscheidung

- **Bereichsmodell als eine Quelle der Wahrheit:** `frontend/src/pages/event/eventSections.ts` kennt alle Veranstaltungsbereiche mit Schlüssel, Lebenszyklus-Gruppe, Icon, Beschriftung und Sichtbarkeit. Gruppen: ohne Gruppe `general`; Vorbereitung `competitions`, `settings`; Meldung `registrations`, `participants`, `invoices`; Renntag `schedule`, `betrieb`, `organization`; Nachbereitung `results` (neu). Seitenleiste, Bereichsauswahl unter `md`, Veranstaltungsseite (welches Panel gerendert wird) und der Rückfall bei ungültigen Werten rufen dieselben reinen Funktionen (`visibleEventSections`, `resolveEventTab`, `sectionForRoute`, `groupEventSections`). Wer einen Bereich ergänzt oder eine Sichtbarkeitsregel ändert, tut das dort und nirgends sonst.
- **Seitenleiste:** Unter `/event/$eventId/**` steht unter den globalen Einträgen ein Veranstaltungsblock; die Reiterleiste der Veranstaltungsseite entfällt. Gruppenüberschriften sind reine Beschriftungen (nicht aufklappbar) und erscheinen erst ab mehr als sechs sichtbaren Bereichen (`EVENT_SECTION_GROUP_HEADING_THRESHOLD`), ein Vereinsvertreter sieht also eine schlichte Liste. Globale Einträge der Verwaltung stehen unter einer eigenen Überschrift „Verwaltung".
- **Tief verlinkbare Reiter:** Bereiche, Wettkampfreiter, Konfigurationsreiter und Administrationsreiter sind `?tab=`-Suchparameter mit `validateSearch` je Route (`validateEventIndexSearch` in `utils/navigation/searchParams.ts`, `validateCompetitionSearch` in `competitionPageLogic.ts`, `validateConfigurationSearch` in `configurationPageLogic.ts`). Ein unbekannter oder für die Rolle unsichtbarer Wert fällt auf den ersten sichtbaren Bereich zurück; alte Konfigurations-Anker (`startlists`, `worktypes`) werden auf die neuen Schlüssel abgebildet. Der Zeitplan hält den gewählten Tag als `?day=all|YYYY-MM-DD`. Die Schlüssel der bisherigen `?tab=`-Werte behalten ihre Bedeutung, damit Lesezeichen, Hinweise und Kacheln weiter stimmen.
- **Seitenkopf:** `components/ui/PageHeader` ist das einzige `h1` jeder Seite im `RootLayout`: Titel, Untertitel, Meta-Chips, Aktionen rechts, Breadcrumbs (`utils/navigation/breadcrumbs.ts`: `buildEventTrail`, `buildClubTrail`, `buildUserTrail`). Der Bereich im Pfad ist derselbe wie der aktive Seitenleisteneintrag (`sectionForRoute`). Zurück-Pfeile führen zum fachlichen Elternteil, nie per `history.back()`: Vollbild-Arbeitsplätze (Schiedsrichter-Dashboard, Sprecher-Board) zurück nach `?tab=betrieb`, wenn die Person die Veranstaltung lesen darf.
- **Schnellsprung:** Ein Suchfeld in der Kopfleiste (`components/appbar/QuickJump.tsx`, Logik in `utils/navigation/quickJump.ts`, Taste `/`) springt zu Veranstaltungen, deren Bereichen und Wettkämpfen. Es nutzt die vorhandenen Listenendpunkte und erscheint nicht auf Posten-, Leitstand- und Regie-Seiten.
- **Vorlagen & Stammdaten** (`/config`) hat sieben Reiter mit höchstens vier Blöcken; die Einstellungen der Veranstaltung bekommen eine Sprungleiste mit Ankern statt Reiter-in-Reiter.

## Verworfene Alternativen

- **Zweite Leiste (eigene Rail) für die Bereiche:** hätte auf der Wettkampfseite neben deren Rennen-Leiste eine dritte Spalte erzeugt.
- **Aufklappbare Gruppen in der Seitenleiste:** zusätzliche Menüebene ohne Nutzen bei zehn Einträgen.
- **Bereiche als eigene Routen statt Suchparameter:** hätte jede bestehende `?tab=`-Adresse gebrochen.
- **Zurück per `history.back()`:** landet nach einem Sprung aus dem Schnellsprung oder einer Mail im Nichts.
- **Eine Seitenleiste ohne Sichtbarkeitsfunktion, jede Komponente prüft selbst:** genau der Zustand, der Seitenleiste und Panel auseinanderlaufen ließ.

## Konsequenzen

- Ein neuer Veranstaltungsbereich braucht einen Eintrag in `eventSections.ts` (Schlüssel, Gruppe, Sichtbarkeit), einen `case` in `EventPage.tsx` und Beschriftungen in de, en und da; der Test `eventSections.test.ts` fängt unsichtbar gewordene Bereiche.
- Bei `?tab=xyz` bleibt der ungültige Wert in der Adresszeile stehen; er wird nur intern verworfen.
- Auf `/event/$id/register` markiert die Seitenleiste „Übersicht"; der Breadcrumb der Meldungsseite zeigt für Vereine auf einen Bereich, den sie nicht sehen. Beides ist offen.
- Vereine sehen den Bereich `registrations` erst, wenn das Backend die Meldungsliste auch mit Scope OWN liefert; bis dahin gilt `ReadRegistrationGlobal`.

## Quellen

- Code: `frontend/src/pages/event/eventSections.ts`, `frontend/src/components/ui/PageHeader.tsx`, `frontend/src/components/sidebar/EventSidebarSection.tsx`, `frontend/src/utils/navigation/`, `frontend/src/pages/event/competitionPageLogic.ts`, `frontend/src/pages/configurationPageLogic.ts`
- Verwandte ADRs: ADR-0086 (Veranstaltungs-Modus im Zeitplan), ADR-0093 (Betrieb als Renntag-Einstieg), ADR-0104 (Oberflächen und Theme-Geltungsbereiche)
