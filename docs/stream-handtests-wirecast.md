# Stream-Overlay: offene Handtests am echten Wirecast

Stand 28.08.2026. Alles Folgende ist im Browser belegt (Probemodus-Schleife, Panel,
Verwaltung, Token-Link, verdeckter Tab), aber nur am echten Aufnahme-Stack endgültig
prüfbar:

1. **Transparenz in Wirecast**: Szene als Web-Display-Quelle mit „Transparent Background"
   laden — Grafiken müssen ohne schwarzen Kasten über dem Programmbild liegen (der
   `body` ist transparent; im Browser-Tab wirkt die Seite schwarz, das ist nur der
   Browser-Hintergrund).
2. **Verdeckte Quelle**: Wirecast meldet Web-Quellen je nach Version als verdeckt
   (`document.hidden`). Die Einfrier-Falle ist behoben (Pushes werden immer angewendet,
   Uhr hat einen Interval-Fallback) — trotzdem eine volle Probemodus-Schleife in der
   Quelle ansehen: Phasenwechsel, laufende Uhr, Ein-/Ausblendungen.
3. **Dauerbetrieb**: Szene >2 h in der Quelle stehen lassen (Speicher, Reconnect nach
   WLAN-Wechsel; letzter Stand bleibt bei Abriss stehen, Panel warnt ab 30 s ohne
   Lebenszeichen).
4. **Chroma-Variante**: Szene auf CHROMA stellen und am Mischer keyen (Rückfall für
   Hardware-Wege).
5. **Token-Rotation im Betrieb**: Share-Link neu erzeugen, während die Quelle läuft —
   alte Quelle verliert die Verbindung (langsamer Retry, kein Neuladen), neue URL
   einsetzen.
6. **Echtdaten-Tag**: Automatik-Regeln mit echter Zeitnahme (Startsequenz-Countdown,
   Zwischenzeiten-Band, Einlauf-Ticker, „Vorläufig" bei Klärung, Folgelauf-Band).
7. **Ausnahmen der Startsequenz** (Sync-Runde 30.08.2026, im Test belegt, am echten
   Stack nachziehen — Sequenz am Startbildschirm bedienen, Wirecast-Quelle daneben):
   - **Pause**: Countdown friert SOFORT auf dem Reststand ein (kein Weiterlaufen auf
     0:00), Akzentbalken der Uhr kippt auf Orange, Pause-Symbol neben der Zahl.
   - **Fortsetzen**: Countdown läuft nahtlos am eingefrorenen Wert weiter (der
     Feuerzeitpunkt rückt serverseitig um exakt die Pausendauer nach hinten).
   - **Pause → Zurücksetzen → Fortsetzen**: der zurückgesetzte Start feuert direkt nach
     dem Fortsetzen; Uhr wechselt mit dem Stempel auf die laufende Zeit.
   - **Abbruch** (auch aus der Pause): Countdown verschwindet über die
     Ausblendanimation (kein Abpoppen, kein stehender 0:00-Rest); Folgelauf-Band darf
     zurückkommen.
   - **Fehlstart vom Erfassungsboard**: bricht die Sequenz ab — gleiche Erwartung wie
     beim Abbruch, zusätzlich fällt der Lauf auf „In Vorbereitung" zurück.
   - **Pause NACH dem Startschuss** (Boot fährt): die laufende Uhr läuft weiter — die
     Pause stoppt künftige Starts, nie einen Lauf auf dem Wasser.

Bekannte, bewusst offene Punkte (Folge-Tickets, siehe Ledger/Abschlussbericht):
Streckenbild-Auslieferung für Token-Szenen; Picker zeigt übersprungene Läufe.

Am 29.08.2026 nach einem Durchgang am laufenden System behoben (jeweils am Server
nachgemessen, nicht nur im Test): Regie-Eingriffe greifen jetzt auch im Probemodus;
der Vor-Start-Countdown zählt auf den Startschuss herunter statt vom Sequenzstart
wegzulaufen (Bezug ist `leadInMillis` der Sequenz, Anzeige klemmt bei 0:00);
Einlauf-Ticker hängt an fester Oberkante statt zentriert zu wachsen; wirkungsloser
`backdrop-filter` entfernt und Compositing-Hinweise ergänzt.
