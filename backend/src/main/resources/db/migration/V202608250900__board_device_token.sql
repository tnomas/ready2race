-- Auch die Kachel-Boards ("Anzeigen") liegen ab jetzt hinter einer Authentifizierung: ein
-- montierter Bildschirm oder eine OBS-Quelle kann sich nicht anmelden, deshalb teilt man ihr
-- genau wie einem Zeitnahme-Posten einen Link mit Geräte-Token.
--
-- Bewusst EINE Token-Infrastruktur, keine zweite Tabelle daneben: Ausstellen, Wiederverwendung
-- des Share-Links, Widerrufen und der Geräte-Reiter sind für Posten schon gebaut und
-- betriebserprobt (V202608181100 + V202608211420). Eine Parallel-Tabelle hätte dieselbe Logik ein
-- zweites Mal -- und damit auch jede künftige Änderung doppelt. Der Preis ist diese Migration:
-- eine Zeile zeigt jetzt entweder auf einen Posten ODER auf ein Board.
--
-- Deshalb wird station nullable. Bestehende Zeilen sind ausnahmslos Posten-Tokens und bleiben
-- unverändert gültig; im Feld laufen produktive Geräte mit genau diesen Tokens.
alter table timing_device_token
    alter column station drop not null;

-- Das Ziel der zweiten Sorte. on delete cascade wie bei station: verschwindet das Board, ist sein
-- Token gegenstandslos -- ein Token ohne Ziel wäre ein Credential, das niemand mehr sieht und
-- niemand mehr widerruft.
alter table timing_device_token
    add column board uuid references board (id) on delete cascade;

-- Genau eines von beiden, nie beides und nie keines. Ohne diese Bedingung könnte eine Zeile mit
-- station = null und board = null entstehen, und die Validierung müsste raten, wofür das Token
-- eigentlich gilt -- der Zuschnitt IST hier die Sicherheitsgrenze (ein Board-Token darf keinen
-- Zeitnahme-Endpunkt öffnen und ein Posten-Token kein Board), also gehört er in die Datenbank und
-- nicht nur in den Service.
alter table timing_device_token
    add constraint timing_device_token_exactly_one_target
        check (num_nonnulls(station, board) = 1);

-- Die Validierung schlägt zwar über token_hash zu (unique, indiziert), aber die Suche nach dem
-- wiederverwendbaren Share-Link-Token eines Boards filtert auf board -- derselbe Zugriffspfad,
-- den getActiveShareLinkByStation für Posten nimmt.
create index if not exists idx_timing_device_token_board on timing_device_token (board);
