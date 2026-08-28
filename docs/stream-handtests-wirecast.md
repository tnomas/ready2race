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

Bekannte, bewusst offene Punkte (Folge-Tickets, siehe Ledger/Abschlussbericht):
Streckenbild-Auslieferung für Token-Szenen; Probemodus ignoriert Regie-Overrides;
Picker zeigt übersprungene Läufe.
