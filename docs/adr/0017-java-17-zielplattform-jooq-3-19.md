# ADR-0017: Java 17 als Zielplattform, jOOQ bleibt auf 3.19

- Status: angenommen
- Datum: 2025-03-07
- Bereich: betrieb, backend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Im März 2025 zog das Upstream-Team jOOQ auf eine neuere Version und stellte fest, dass jOOQ ab 3.20 Java 21 voraussetzt. Die Zielserver der Betreiber laufen mit einer Java-17-Laufzeit; `publiccode.yml` nennt „Java Runtime Environment 17" als Abhängigkeit. Ein Wechsel der Zielplattform hätte jede Installation betroffen.

## Entscheidung

- **Java 17 ist die Zielplattform:** `maven.compiler.source` und `maven.compiler.target` stehen in `backend/pom.xml` auf 17. `backend/README.md` verlangt ein JDK ≥ 17 zum Bauen und weist darauf hin, dass die JDK-Version nicht höher sein darf als die JRE auf dem Zielserver.
- **jOOQ bleibt auf der 3.19-Linie** (aktuell 3.19.20) mit dem Kommentar `<!-- <3.20 with JAVA 17 -->` im POM. Ein Upgrade auf 3.20 oder höher ist erst zulässig, wenn die Zielplattform auf Java 21 angehoben wird.
- Andere Abhängigkeiten (Kotlin 2.1, Ktor 3.1, Flyway 11.3) werden innerhalb ihrer Java-17-kompatiblen Versionen aktualisiert.

## Verworfene Alternativen

- jOOQ 3.20+ mit Java 21: eingespielt und am 2025-03-07 zurückgenommen (`ad89b2c5`), weil Java 17 auf den Zielsystemen bleibt.
- Anhebung der Zielplattform auf Java 21: nicht belegt; das frühere Docker-Image nutzte zwar `openjdk:21`, die Anforderung an Betreiber blieb bei 17 (der Docker-Build wurde später aus dem Repository entfernt, siehe [ADR-0031](0031-auslieferung-fat-jar-getrenntes-frontend.md)).

## Konsequenzen

- jOOQ-Neuerungen ab 3.20 (und Bugfixes, die nur dort landen) sind nicht verfügbar; der Kommentar im POM ist die einzige Erinnerung, warum die Version festgepinnt ist.
- Wer lokal mit einem neueren JDK baut, muss `--release`/Target 17 beachten; ein mit JDK 21 gebautes Jar läuft nur, wenn das Ziel auf 17 kompiliert wurde.
- `JAVA_HOME` fehlt in manchen Entwickler-Shells; der Maven-Wrapper braucht ein gesetztes JDK.
- Die Entscheidung ist an die Betreiber gebunden; sobald alle Installationen Java 21 haben, kann sie mit einem POM-Wechsel und einem jOOQ-Regenerat aufgehoben werden.

## Quellen

- Commits: `ad89b2c5` (Downgrade auf jOOQ 3.19, Java 17), `dabb437e` (Versionskommentar im POM), `6593ab73` (publiccode.yml mit JRE 17), `17822e34` (Initial-Commit mit Maven-Compiler-Einstellungen)
- Code: `backend/pom.xml` (`jooq.version`, `maven.compiler.*`), `backend/README.md`, `publiccode.yml`
- Verwandte ADRs: [ADR-0001](0001-kotlin-ktor-jooq-flyway-backend.md), [ADR-0031](0031-auslieferung-fat-jar-getrenntes-frontend.md), [ADR-0036](0036-lizenz-gplv3-publiccode.md)
