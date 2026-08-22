# „Betrieb ab" — die Veranstaltungsauswahl der Helfer-App eingrenzen

**Stand:** 2026-08-11 · Branch `claude/betrieb-ab` · Basis `d9506d30`

## Das Problem

Die Helfer-App holt über `getEvents` **alle** Veranstaltungen — ungefiltert, unsortiert, auch
jahrealte — und zeigt sie in [QrEventsPage.tsx](../../../frontend/src/pages/app/QrEventsPage.tsx)
als gleich aussehende Knöpfe mit nichts als dem Namen. Kein Datum, kein Jahr, keine Kennzeichnung,
welche gerade läuft.

Am 11.08.2026 ist dabei genau das passiert, wofür die Liste gebaut ist: Bei der Bandvergabe wurde
die Regatta von **2025** erwischt. Die Zuordnung landet dann still in der falschen Veranstaltung,
und weil die gewählte Veranstaltung danach in der App-Sitzung sitzt, gilt sie für jede weitere
Zuordnung mit. Aufgefallen ist es erst darüber, dass eine Teilnehmerin in „Mein Event" plötzlich
die Läufe der 2025er Regatta sah — was für sich genommen richtig war.

Zwei Dinge, die dabei **nicht** kaputtgehen und die dieser Entwurf nicht anfassen muss:

- Ein bereits vergebenes Band lässt sich nicht stillschweigend umhängen. `isQrCodeInUse` prüft den
  Code veranstaltungsübergreifend und lehnt eine zweite Vergabe ab.
- Ein Band zeigt ausschließlich Daten seiner eigenen Veranstaltung. Quergeprüft: ein fremdes Band
  ergibt 404, ein Band an einer Veranstaltung ohne Meldungen ein leeres Dashboard.

Das Problem ist also allein die **Auswahl**.

## Was gebaut wird

### Datenmodell

Migration `V202608111600` fügt `event_day.operations_start` als nullbaren `timestamp` hinzu.

Der Zeitpunkt hängt am **Tag**, nicht an der Veranstaltung: Die Akkreditierung des ersten Renntages
findet oft am Vorabend statt, und das ist dann schlicht ein früherer Zeitstempel als das Datum des
Tages. Ein Datum je Veranstaltung könnte das nicht ausdrücken, ohne dass man den Vorabend jedes
Mal mitdenkt.

Das Feld heißt bewusst nicht „Akkreditierung": In der App hängen auch Bedingungsprüfung und
Check-in/-out daran. „Betrieb ab" deckt alles ab, was an dem Tag vor Ort anfängt, und sprengt nicht,
sobald eine weitere App-Funktion dazukommt.

### Das Fenster

Eine Veranstaltung gilt als **im Betrieb**, wenn

```
min(operations_start über alle Tage)  ≤  jetzt  <  max(event_day.date) + 1 Tag
```

Ein einziges, durchgehendes Fenster über die ganze Regatta — kein Fenster je Tag. Wer abends
zwischen zwei Renntagen noch Bänder zuordnet, wird sonst ausgesperrt.

**Rückfall bei leerem Feld:** Ist an einem Tag `operations_start` nicht gepflegt, zählt dieser Tag
ab `date 00:00`. Nach der Migration steht das Feld überall auf `null`; ohne Rückfall wäre die Liste
am Regattamorgen leer, bis jemand für jeden Tag etwas einträgt. Eine Änderung, die drei Tage vor der
Regatta stillschweigend Pflege voraussetzt, ist das größere Risiko als ein Fenster, das einen halben
Tag zu früh aufgeht.

### Wo das Fenster ausgewertet wird

**Im Gerät, nicht im Server.** `EventDto` bekommt zwei abgeleitete Felder — den berechneten Beginn
(Minimum inklusive Rückfall) und das Datum des letzten Tages —, und die App entscheidet mit ihrer
eigenen Uhr.

Der Grund ist das Zwischenspeichern:
[AppSessionContext.tsx](../../../frontend/src/contexts/app/AppSessionContext.tsx) legt die Liste ab
und zeigt sie beim nächsten Start auch ohne Netz. Stünde dort ein serverseitig berechnetes „läuft
gerade", wäre es am nächsten Morgen falsch — schlimmstenfalls eine über Nacht gespeicherte leere
Liste. Datumsangaben altern nicht.

Die Schwäche — eine falsch gestellte Geräteuhr verschiebt das Fenster — bleibt folgenlos, weil
„Alle Veranstaltungen" immer erreichbar ist.

### Die Auswahlseite

- **Im Betrieb** stehen oben, mit Datumsbereich unter dem Namen.
- Liegt **genau eine** darunter, wird sie wie bisher übersprungen (die Seite springt weiter).
- Ist **keine** im Betrieb, erscheint ein Hinweis und darunter der Knopf **„Alle
  Veranstaltungen"** — die vollständige Liste als bewusster zweiter Griff, nach Datum absteigend,
  mit Jahr am Knopf.
- Die vollständige Liste ist auch dann erreichbar, wenn etwas im Betrieb ist.

Die Sortier- und Einteilungslogik kommt in ein eigenes, React-freies Modul mit Vitest-Tests
(`eventOperations.ts`) — dieselbe Aufteilung wie bei `polling.ts` und `staleWatch.ts`. Die
Auswahlseite bleibt Darstellung.

### Pflege

Das Feld gehört in das Formular, in dem die Veranstaltungstage angelegt werden, als optionale
Zeitangabe mit dem Hinweis, dass leer „ab Tagesbeginn" bedeutet. Übersetzungen in de, en und da.

## Was ausdrücklich nicht dazugehört

- Die Zuordnungen, die bereits in der falschen Veranstaltung gelandet sind. Die werden über SQL
  gefunden und von Hand umgehängt; ein Umzugswerkzeug lohnt für den einen Fall nicht.
- Andere Stellen, an denen Veranstaltungen gewählt werden (Ergebnisseite, Vereins-Kurznamen,
  Veranstaltungstabelle). Sie haben das Problem nicht in dieser Schärfe und würden den Umfang
  vervierfachen.

## Prüfung

Einheitentests decken die Fenster-Logik ab: gepflegter Beginn, Rückfall auf `00:00`, Vorabend vor
dem ersten Tag, mehrtägige Veranstaltung über Nacht, Ende nach dem letzten Tag, Veranstaltung ohne
Tage, Sortierung. Die Auswahlseite wird an der laufenden App nachgesehen — beide Fälle (etwas im
Betrieb, nichts im Betrieb).
