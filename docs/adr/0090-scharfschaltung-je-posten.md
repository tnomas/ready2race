# ADR-0090: Scharfschaltung je Posten: Betriebsart ONETOUCH/ARMED und Zustand getrennt; der Zieleinlauf ohne Zuordnung ist nie gesperrt

- Status: angenommen
- Datum: 2026-08-25
- Bereich: domäne, backend, frontend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Der Postenbildschirm erfasste bei jedem Druck. Versehentliche Drücke auf Boots-Knöpfe und die Tasten `1`–`6`/`A`–`F` hängten Falschzeiten sofort an Boote. Eine Sicherung darf aber keine echte Zielzeit kosten: die eigentliche Gefahr ist die vergessene Scharfschaltung beim echten Zieleinlauf.

## Entscheidung

- `timing_station` bekommt zwei Spalten mit verschiedenen Besitzern (V202608251300): `capture_mode` (`ONETOUCH | ARMED`, Vorgabe `ONETOUCH`, gepflegt von der Regattaleitung in der Postenmaske) und `armed` (vom Posten selbst geschaltet).
- `ARMED` verlangt das Scharfschalten am Posten: Halten statt Tippen (etwa 1 s, mitlaufender Ring). Scharf bleibt scharf, bis jemand entschärft; es gibt kein Zeitfenster und kein Selbst-Entschärfen nach einem Boot.
- Entschärft sperrt jede Erfassung mit Zuordnung: Boots-Knöpfe, Boots-Tasten und die Leertaste. Der große manuelle Zieleinlauf ohne Zuordnung ist nie gesperrt. Nichts wird gepuffert; ein gesperrter Druck ist weg.
- Der Leitstand zeigt den Zustand nur (read-only); geschaltet wird ausschließlich am Posten. Der Endpunkt akzeptiert Sitzung oder Geräte-Token; ein Token darf nur den eigenen Posten schalten, `ANZEIGE`-Token werden abgelehnt.
- Ein Wechsel der Betriebsart nach `ARMED` setzt `armed` auf `false`; ein bloßes Umbenennen des Postens nicht. `captureMode = null` im Request heißt „unverändert".
- `captureAllowed` ist eine reine Funktion. Ohne Netz gilt der zuletzt bekannte Zustand („im Zweifel erfassen").
- Die Startsequenz gehört ausdrücklich nicht zur Scharfschaltung; der Startposten hat keine Sperre.

## Verworfene Alternativen

- **Eine Spalte für Betriebsart und Zustand:** Entschärfen überschriebe die Konfiguration der Regattaleitung.
- **Scharfschaltung aus dem Leitstand:** wer am Posten steht, entscheidet; der Leitstand sieht nur.
- **Selbst-Entschärfen oder Zeitfenster:** erzeugt genau die Unsicherheit, die vermieden werden soll.
- **Leertaste offen lassen:** Tasten sind die Unfallfläche.
- **Pufferung entschärfter Drücke mit Nachreichen:** eine Marke, die niemand bewusst erfasst hat, ist keine Marke.
- **Sperre des großen Knopfs:** eine Sicherung, die eine echte Zielzeit verschluckt, ist schlimmer als keine.
- **`ARMED` als Vorgabe:** ein vergessenes Scharfschalten am Renntag wäre ein Ausfall.
- **Tonleiter-Schalter am Event** (Task 4 des Plans): angehalten und in die Ton-Sätze verschoben ([ADR-0091](0091-toene-gehoeren-dem-zeitnahmetyp.md)).

## Konsequenzen

- Zwei Personenkreise pflegen zwei Spalten; die Postenmaske zeigt die Betriebsart, der Bildschirm den Zustand. Wer nur eine Stelle liest, versteht das Verhalten nicht.
- Jeder neue Erfassungsweg mit Zuordnung muss `captureAllowed` beachten; der Knopf ohne Zuordnung nie.
- Nach einem Wechsel auf `ARMED` steht jeder Posten entschärft da und muss vor Ort scharf geschaltet werden; das gehört in die Renntag-Checkliste.
- Der Offline-Fall verlässt sich auf den letzten bekannten Zustand; ein entschärfter Posten ohne Netz bleibt entschärft.
- Nur die Anzeige wurde später poliert (3166cc4d); das Modell steht seit dem 25.08.

## Quellen

- Commits: `aa54abf0` (Entwurf und Plan), `4e044ab2` (Betriebsart und Scharfschaltung, V202608251300), `c0eacf2c` (Token nur eigener Posten), `91623df5` (Postenbildschirm), `41cbbb29` (keine toten Hinweise), `65f1efac` (Leitstand read-only, Betriebsart in der Maske), `19bdf4f6` (Wechsel nach ARMED entschärft), `3166cc4d` (Anzeige-Politur)
- Migrationen: `V202608251300__timing_station_armed.sql`
- Specs: `docs/superpowers/specs/2026-08-25-scharfschaltung-design.md`, `docs/superpowers/plans/2026-08-25-scharfschaltung.md`
- Verwandte ADRs: [ADR-0087](0087-eigenes-zeitnahme-modul-append-only.md), [ADR-0088](0088-timing-websocket-und-geraete-token.md), [ADR-0089](0089-startsequenzen-serverseitig-fehlstart.md), [ADR-0091](0091-toene-gehoeren-dem-zeitnahmetyp.md)
