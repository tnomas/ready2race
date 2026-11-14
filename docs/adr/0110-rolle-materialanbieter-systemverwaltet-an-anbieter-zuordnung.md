# ADR-0110: Die Rolle „Materialanbieter“ ist systemverwaltet und folgt der Anbieter-Zuordnung am Konto

- Status: angenommen
- Datum: 2026-11-14
- Bereich: backend
- Spec: `docs/superpowers/specs/2026-09-07-materialvermietung-design.md` (Abschnitt 6)

## Kontext

Ein Anbieter-Konto braucht READ/UPDATE `MATERIAL` mit Scope OWN. OWN heißt hier: der über
`app_user.material_provider` zugeordnete Anbieter, wie OWN bei Vereinen die eigene Organisation meint.
Der Quellzweig der Materialvermietung vergab dafür eine Rolle mit der UUID `…0003` und einen eigenen
Endpunkt `PUT /user/{id}/materialProvider`, der nur UPDATE USER GLOBAL verlangte. Im Stand des
Rechtekonzepts (Schritt 1, `docs/rechte.md`) ist `…0003` die Superadmin-Rolle, Rollen werden über
`JobSeeder` als Jobs gesät, und Rollen zuweisen verlangt STAFF mit den drei Vergaberegeln
(Teilmenge der eigenen Rechte, nicht am eigenen Konto, Superadmin-Konten nur mit UPDATE SYSTEM). Eine
unveränderte Übernahme hätte Anbieter-Konten still zu Superadmins gemacht und die STAFF-Regel
umgangen.

## Entscheidung

- **Eigene feste Kennung `…0040`** (`MATERIAL_PROVIDER_ROLE` in `database/static.kt`; belegt waren
  0000–0003, 0010–0012, 0020–0023, 0030–0033). Die Rolle ist der Job `MATERIAL_PROVIDER`
  (statisch, Ebene `CLUB`, READ und UPDATE MATERIAL OWN). MATERIAL GLOBAL tragen nur Admin und
  Superadmin (über `Privilege.entries`).
- **Systemverwaltet wie USER und Vereinsvertreter:** `ROLES_MANAGED_ELSEWHERE = {USER,
  CLUB_REPRESENTATIVE, MATERIAL_PROVIDER}`. Das Nutzer-Update übergeht sie (weder Ist- noch Soll-Stand,
  `deleteManaged` lässt sie stehen), die Einladung (`checkAssignable`) weist sie ab.
- **Einziger Vergabeweg ist die Anbieter-Zuordnung** (`AppUserService.setMaterialProvider`, Route
  `PUT /user/{id}/materialProvider`, weiterhin UPDATE USER GLOBAL). Sie prüft zusätzlich die drei
  Vergaberegeln über `RoleService.checkSystemManagedAssignable` (UPDATE STAFF GLOBAL, Teilmenge der
  Rolle, nicht am eigenen Konto, Superadmin-Konten nur mit UPDATE SYSTEM) und sperrt Systemkonten.
  Wer die Zuordnung setzt, bekommt die Rolle; wer sie löst, verliert **nur diese Rolle**. Scheitert die
  Regel, antwortet die Route 409 (`CannotAssignRoles`).
- **Nicht kopierbar:** `Job.copyable = false`; `GET /role/jobs` listet den Job nicht, `POST /role`
  mit diesem Job ergibt 400 `JobNotCopyable`. Eine Kopie wäre ohne Zuordnung wirkungslos, mit Zuordnung
  eine zweite, am Entzug vorbeilaufende Anbieter-Rolle.
- **Ein Anbieter mit zugeordneten Konten ist nicht löschbar** (409 `MATERIAL_PROVIDER_HAS_USERS`).
  Das Löschen verlangt nur UPDATE MATERIAL GLOBAL; die Rolle soll aber nur über die Zuordnung mit den
  Vergaberegeln wandern, und `app_user.material_provider … on delete set null` ließe sonst die Rolle am
  Konto stehen.
- **Einladen eines Anbieters zu einer Veranstaltung verlangt UPDATE EVENT GLOBAL und READ MATERIAL GLOBAL**
  (`authenticateAll`, Route `PUT /event/{id}/materialProvider/{pid}`; ohne Letzteres 403); Ausladen bleibt UPDATE
  EVENT GLOBAL. Die Oberfläche versteckt die Auswahl ohne das Leserecht. Ausladen mit vorhandenen Anfragen ist gesperrt
  (409), stattdessen schließt der Anbieter die Vergabe.
- Die Oberfläche (Nutzerseite) zeigt die Anbieter-Auswahl nur, wenn der Bearbeitende UPDATE STAFF,
  UPDATE USER, READ MATERIAL GLOBAL und UPDATE MATERIAL OWN trägt, und blendet systemverwaltete Rollen
  aus dem Rollenfeld aus.

## Verworfene Alternativen

- **Frei vergebbare, nicht statische Rolle (Quellzweig):** umgeht STAFF und die Teilmengenregel;
  `deleteManaged` hätte sie bei jedem Nutzer-Update entfernt.
- **Weiter die UUID `…0003`:** ist Superadmin; die Übersetzung beider Konstanten wäre ein stiller
  Fehler geblieben.
- **Eigene Ebene `PROVIDER`:** bräuchte eine Prüfbedingungs-Migration und neue Fälle in allen
  Ebenen-Schaltern für eine einzige Rolle. Die Ebene `CLUB` passt, weil OWN dieselbe Bedeutung hat.
- **Eine kopierbare Rolle mit Warnhinweis:** eine Kopie bliebe frei vergebbar.
- **Rolle beim Löschen eines Anbieters im selben Vorgang entziehen:** UPDATE MATERIAL GLOBAL ersetzte
  dann die Vergaberegeln.
- **Einladung neuer Nutzer mit Anbieter-Wahl** (Spec Abschnitt 6): nicht gebaut; die Einladung weist die
  Rolle ab, Zuordnung nachträglich auf der Nutzerseite.

## Konsequenzen

- Konten ohne Zuordnung tragen die Rolle nicht; wer den Anbieter wechselt (A nach B), behält die Rolle
  genau einmal. Ein Konto, das von Hand in der Datenbank die Rolle bekommt, aber keinen Anbieter, sieht
  Menüpunkt und Materialarten, aber keine Daten.
- Das Rollen-Frontend darf `MATERIAL_PROVIDER` nicht als Kopiervorlage anbieten; die Sperre liegt im
  Backend, das Frontend braucht keinen Filter.
- Eine neue systemverwaltete Rolle gehört in `ROLES_MANAGED_ELSEWHERE`, hat einen eigenen Vergabeweg
  mit den drei Regeln und gehört in `docs/rechte.md`.
- Datenbanken, auf denen der alte Zweig lief (Rolle `…0003` am Anbieter-Konto), lassen sich nicht
  hochziehen (Betriebshinweise).
- Nicht belegt: das Speichern der Zuordnung im Browser. Die Nutzerseite wurde angesehen (Anbieterkonto,
  Systemkonto mit Sperrgrund); die Vergaberegeln sind durch Backend-Tests abgedeckt.

## Quellen

- Commits: `53ab7d21` (Einladen braucht das Leserecht), `5f575b5e` (Merge: Rolle `…0040`, `ROLES_MANAGED_ELSEWHERE`, Zuordnung mit Vergaberegeln),
  `5440a5db` (`docs/rechte.md`), `efebf512` (Job nicht kopierbar), `45a0abe3` (Anbieter mit Konten
  nicht löschbar), `ea582e40` (Nutzerseite)
- Docs: `docs/rechte.md`, `docs/superpowers/specs/2026-09-07-rechtekonzept-design.md`
- Verwandte ADRs: ADR-0010 (Privilegien), ADR-0035 (Einladung), ADR-0109
