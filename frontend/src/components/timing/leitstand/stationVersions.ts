/**
 * Versionszähler je Posten für das Rennen zwischen initialem GET und Websocket-Push.
 *
 * Der initiale Sequenz-Stand je START-Posten kommt per GET, danach halten `sequenceChanged`-Pushes
 * ihn aktuell. Ein Push ist immer jünger als der Schnappschuss, den ein noch laufender GET liefert
 * — trifft zwischen Anfrage und Antwort ein Push für denselben Posten ein, darf die Antwort den
 * Stand nicht überschreiben. Der Aufrufer nimmt vor der Anfrage einen [snapshot] und prüft die
 * Antwort mit [isStale]; jeder angewandte Push ruft [bump]. Gleiches Muster wie `wsVersionRef` in
 * `useSequence.ts`, nur je Posten statt für einen einzelnen.
 */
export class StationVersions {
    private readonly versions = new Map<string, number>()

    /** Jeder angewandte Push für diesen Posten zählt hoch. */
    bump(stationId: string): void {
        this.versions.set(stationId, this.current(stationId) + 1)
    }

    /** Der Stand vor einer Anfrage — mit [isStale] gegen die Antwort zu halten. */
    snapshot(stationId: string): number {
        return this.current(stationId)
    }

    /** Ob seit dem Schnappschuss ein Push für diesen Posten angewandt wurde. */
    isStale(stationId: string, snapshot: number): boolean {
        return this.current(stationId) !== snapshot
    }

    private current(stationId: string): number {
        return this.versions.get(stationId) ?? 0
    }
}
