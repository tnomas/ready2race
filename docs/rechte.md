# Rechte in ready2race

Ein Privileg ist ein Tripel aus Aktion (CREATE, READ, UPDATE, DELETE), Ressource und Scope
(OWN, GLOBAL; EVENT folgt). Rollen bündeln Privilegien. Jobs sind im Code definierte Rollen
(`backend/.../app/role/entity/Job.kt`); sie werden beim Start als statische Rollen gesät und
synchronisiert. Eigene Rollen entstehen als Kopie eines Jobs und bekommen neue Job-Privilegien
nachgetragen, behalten aber ihre Abweichungen.

## Vergaberegeln

1. Rollen anlegen, ändern und zuweisen kann nur, wer jedes ihrer Privilegien selbst hat.
2. Niemand ändert die eigenen Rollenzuweisungen.
3. Konten mit Superadmin-Rolle sieht und ändert nur, wer `UPDATE SYSTEM GLOBAL` trägt.

Rollen verwalten: `ROLE`. Rollen zuweisen: `STAFF`. `UPDATE USER GLOBAL` bearbeitet nur Kontodaten.

## Ein neues Privileg

1. `Privilege.kt`: Ressource und `data object`.
2. `Job.kt`: dem passenden Job hinzufügen. Beim nächsten Start bekommen es die statische Rolle und alle Kopien.
3. `documentation.yaml`: `Resource`-Enum ergänzen, `npm run generate`, Konstante in `privileges.ts`.
4. Übersetzung `privilege.resource.<NAME>` in de/en/da.

Keine Migration nötig. Vollständiges Konzept: `docs/superpowers/specs/2026-09-07-rechtekonzept-design.md`.

## Verhaltensänderungen in Schritt 1

- `GET /privileges` verlangt jetzt `READ ROLE GLOBAL` (vorher `READ USER GLOBAL`).
- `DELETE REGISTRATION OWN` wird der Rolle Vereinsvertreter beim nächsten Start entzogen; das Privileg wurde nirgends geprüft (Abmeldung ist ein eigener Ablauf).
- Rollen des Systemnutzers sind per API nicht änderbar; der Systemnutzer trägt die Superadmin-Rolle, eine alte Admin-Zuweisung wird beim Start entfernt.
- Beim Ändern von Rollenzuweisungen gilt die Teilmengenregel für Vergeben **und** Entziehen; das Feld `roles` im Nutzer-Update ist optional, `null` heißt „Rollen bleiben“.
- Einladungen ohne Rollen brauchen kein STAFF-Recht; Einladungen mit Rollen schon. Das frühere `admin`-Flag der Einladung gibt es nicht mehr; die Admin-Rolle wird wie jede Rolle vergeben (nur wer ihre Privilegien deckt).
- Rollen ohne Job (Altbestand) erscheinen als „Ohne Vorlage“.

## Handtests Schritt 1

- H1 Als `admin` (Superadmin) Rollenseite öffnen: alle Jobs sichtbar, als „Vordefiniert“ markiert, nicht editierbar.
- H2 Kopie von „Zeitnahme“ anlegen, ein Recht dazu, eines weg: Chips „Zusätzlich“ und „Fehlt“ erscheinen. Speichern, neu öffnen: Chips bleiben.
- H3 Nutzer mit Job „Admin“ einladen, als dieser anmelden: Rollenseite zeigt Superadmin als nicht vergebbar; Nutzerliste zeigt den Systemnutzer nicht.
- H4 Als Admin versuchen, sich selbst eine Rolle zu geben: Fehlermeldung „Die eigenen Rollen kann niemand selbst ändern.“
- H5 Nutzer mit `UPDATE USER GLOBAL` (Kopie von Admin, nur USER-Rechte): Rollenseite nicht im Menü, `/roles` liefert 403, Rollen im Nutzerdialog nur lesbar.
- H6 Backend neu starten mit einer Kopie von „Schiedsrichter“, der ein Job-Privileg fehlt: nach dem Start ist es wieder da.
- H7 Als Konto mit Job „Zeitnahme“ (ohne STAFF) eigenen Namen speichern: geht durch, Rolle bleibt.
- H8 Rollentabelle: Sortieren nach Name geht, Spalten Job/Ebene sind nicht sortierbar; Beschreibung der Jobs erscheint übersetzt.
