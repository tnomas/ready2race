import {CSSProperties} from 'react'
import {StreamPlacement} from '@api/types.gen'

/**
 * Feste Anker der acht Grafikplätze innerhalb der Safe-Area der Bühne (siehe
 * `StreamScenePage`). Jeder Platz ist absolut zur Safe-Area verankert; Tasks 10–12 füllen die
 * Slots mit den eigentlichen Grafiken und lesen dafür dieselbe Zuordnung, damit Bühne und
 * künftige Grafik-Komponenten nie auseinanderlaufen.
 *
 * `Record<StreamPlacement, …>` statt eines Zweigs pro Fall: eine neue Platzierung in der
 * generierten API meldet sich als TypeScript-Fehler hier, statt in der Bühne unbemerkt zu
 * fehlen.
 */
export const STREAM_PLACEMENT_STYLE: Record<StreamPlacement, CSSProperties> = {
    BOTTOM_CENTER: {position: 'absolute', left: '50%', bottom: 0, transform: 'translateX(-50%)'},
    BOTTOM_LEFT: {position: 'absolute', left: 0, bottom: 0},
    BOTTOM_RIGHT: {position: 'absolute', right: 0, bottom: 0},
    TOP_LEFT: {position: 'absolute', left: 0, top: 0},
    TOP_RIGHT: {position: 'absolute', right: 0, top: 0},
    // Feste Kopfkante statt vertikaler Zentrierung: SIDE_LEFT/SIDE_RIGHT tragen den
    // Einlauf-Ticker, der mit jedem Zieleinlauf nach unten WÄCHST (siehe
    // `StreamFinishTicker`). Eine mittige Verankerung (`top: '50%'` + `translateY(-50%)`)
    // ließe den ganzen Kasten bei jeder neuen Zeile ein Stück nach oben rutschen, obwohl die
    // Zeilen selbst schon sauber per FLIP gleiten (`FlipList`) — Rahmen und Inhalt laufen
    // dann sichtbar auseinander. Mit einer festen oberen Kante bleibt der Kopf der Liste
    // stehen, nur das Fußende wandert.
    SIDE_LEFT: {position: 'absolute', left: 0, top: '16%'},
    SIDE_RIGHT: {position: 'absolute', right: 0, top: '16%'},
    FULL_CENTER: {
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
}

/** Alle acht Plätze, in einer stabilen Reihenfolge fürs Rendern der Slots. */
export const STREAM_PLACEMENTS = Object.keys(STREAM_PLACEMENT_STYLE) as StreamPlacement[]

/**
 * Der tatsächliche Stil des Platz-CONTAINERS in `StreamScenePage`: der Anker aus
 * `STREAM_PLACEMENT_STYLE` PLUS CSS-Grid-Stapelung. Mehrere Grafiken desselben Platzes — der
 * Grafik-Katalog setzt STARTLIST/LAPS/RESULT/NEXT_UP standardmäßig alle auf unten-mitte —
 * legen sich damit exakt übereinander (`gridArea: '1 / 1'` je Grafik) statt im Blockfluss
 * untereinander zu stapeln; der Server garantiert ohnehin höchstens eine sichtbare Grafik je
 * Platz, eine zweite ist höchstens kurz während ihrer eigenen Ausblendanimation noch dabei.
 *
 * `placeItems: 'center'` ist bewusst dazugenommen, nicht dem Grid-Standard (`stretch`)
 * überlassen: Für die sieben ankerpunkt-verorteten Plätze macht das keinen sichtbaren
 * Unterschied (die Box ist ohnehin inhaltsgroß, kein `inset: 0`). Für FULL_CENTER dagegen ist
 * die Box vollflächig — ohne `placeItems: 'center'` würde ihr Inhalt (Zeitplan, Streckenbild)
 * unter Grid auf die volle Fläche GESTRECKT statt mittig zu sitzen, wie es die ursprüngliche
 * Flex-Zentrierung (`alignItems`/`justifyContent: 'center'` oben) vorsah — genau der Fehler,
 * den ein unbedachtes `{...STREAM_PLACEMENT_STYLE[placement], display: 'grid'}` einführen
 * würde.
 */
export const STREAM_SLOT_STYLE: Record<StreamPlacement, CSSProperties> = Object.fromEntries(
    STREAM_PLACEMENTS.map(placement => [
        placement,
        {...STREAM_PLACEMENT_STYLE[placement], display: 'grid', placeItems: 'center'},
    ]),
) as Record<StreamPlacement, CSSProperties>
