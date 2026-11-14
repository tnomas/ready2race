# ADR-0006: Mehrsprachigkeit über i18next mit erzwungenen Schlüsseln (de, en, da)

- Status: angenommen
- Datum: 2025-01-13
- Bereich: frontend, backend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Die Anwendung richtet sich an deutsche Vereine, wird aber auch von englischsprachigen Nutzern bedient; E-Mails sollen in der Sprache des Empfängers ankommen. Im Januar 2026 brauchte ein Kunde des Upstream-Teams zusätzlich Dänisch. Texte direkt im Code hätten bei drei Sprachen unweigerlich Lücken erzeugt, die erst im Betrieb auffallen.

## Entscheidung

- **Frontend:** i18next mit react-i18next und Browser-Sprachdetektion. Konfiguration in `frontend/src/i18n/config.ts`: Sprachen `de`, `en`, `da` (`LANGUAGES`), Fallback `en`, ein Namespace `translations`, Ressourcen `frontend/src/i18n/{de,en,da}/translations.json`. MUI-, DataGrid-, DatePicker- und date-fns-Locales sind je Sprache gebündelt.
- **Schlüssel sind erzwungen:** `frontend/src/@types/i18next.d.ts` setzt `strictKeyChecks: true` und leitet den Schlüsseltyp aus `resources.en` ab. Ein Aufruf `t('…')` mit einem Schlüssel, der in `en` fehlt, ist ein TypeScript-Fehler; `tsc -b` bricht den Build ab.
- **Alle Oberflächentexte laufen über `t('…')`.** Schlüssel liegen an der Entität (`event.name` statt `entity.name`).
- **Datum und Zeit werden nach der gewählten App-Sprache formatiert**, nicht nach der Browser-Sprache.
- **Backend:** E-Mail-Vorlagen je Sprache als JSON unter `backend/src/main/resources/internationalization/email/templates/{DE,EN,DA}.json`, Enum `EmailLanguage {EN, DE, DA}`, Nutzersprache in `app_user.language` (`char(2)`). Veranstalter können Vorlagen je Template-Key im Editor überschreiben (`EmailIndividualTemplate`, mit Platzhaltertabelle, Vorschau und Reset auf Standard).
- **Fehlertexte** werden im Frontend aus `ErrorCode`s übersetzt, nie aus dem Backend-Text ([ADR-0011](0011-http-fehlersemantik-und-errorcode-muster.md)).

Neue Texte brauchen mindestens `de` und `en`; `da` folgt demselben Schlüssel, notfalls mit englischem Inhalt.

## Verworfene Alternativen

- Formatierung nach Browser-Sprache: war die erste Fassung und wurde am 2025-06-26 auf die App-Sprache umgestellt (`90ee64a4`), weil Datum und Oberfläche sonst in zwei Sprachen erschienen.
- Generische Schlüssel (`entity.name`, `entity.description`): im März 2025 durch entitätsbezogene Schlüssel ersetzt (`a648571d`), weil dieselbe Beschriftung je Kontext anders heißen muss.
- Übersetzungen als Teilmenge mit Laufzeit-Fallback: nicht belegt; Dänisch kam als vollständige JSON-Datei hinzu.

## Konsequenzen

- Der Typ-Check macht fehlende Schlüssel zu Build-Fehlern, aber nur gegen `en`; Lücken in `de` und `da` fallen erst im Betrieb auf. Dänisch hat bekannte Fallback-Lücken (z. B. kein `event.stream`-Block) und wurde nie mit Sprachkenntnis gegengelesen.
- Zusammengesetzte Beschriftungen („Erbt (Erbt (nichts gesetzt))") fallen durch Unit-Tests der Bausteine; einmal in der laufenden App ansehen.
- `escapeValue: false` in der i18n-Konfiguration: Übersetzungen dürfen kein ungeprüftes Nutzer-HTML enthalten.
- Jede neue E-Mail braucht drei JSON-Vorlagen und, wenn sie überschreibbar sein soll, einen Template-Key im Editor.
- Die Fork-Regel „Deutsch mit Umlauten" gilt für Kommentare und Commits ([ADR-0101](0101-sprach-und-commit-regeln-keine-herkunftsangaben.md)); die Oberfläche bleibt dreisprachig.

## Quellen

- Commits: `6246955d` (i18n eingeführt), `a648571d` (Schlüssel an der Entität, Dateien sortiert), `c46f0898` (Merge feature/15056), `90ee64a4` (Formatierung nach App-Sprache), `acaa03a6` (E-Mail-Vorlagen im Backend), `16c1e631` (Bestätigungsmail mit Anhängen), `afe55cba` (individuelle Mailtexte), `469de862` (Vorlagen-Editor), `0532424f` (Reset-Knopf), `d54d90ed` (Dänisch)
- Code: `frontend/src/i18n/config.ts`, `frontend/src/@types/i18next.d.ts`, `backend/src/main/resources/internationalization/email/templates/`, `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/email/entity/EmailLanguage.kt`
- Verwandte ADRs: [ADR-0005](0005-frontend-stack-react-vite-mui.md), [ADR-0011](0011-http-fehlersemantik-und-errorcode-muster.md), [ADR-0013](0013-scheduler-und-datenbank-warteschlangen.md), [ADR-0101](0101-sprach-und-commit-regeln-keine-herkunftsangaben.md)
