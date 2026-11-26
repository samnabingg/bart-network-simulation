# BART network simulation (Transit Digital Twin)

A simulation of the whole BART network: trains moving on every line on a street map, live from BART's real-time estimates or from a demo timetable, and a walkable 3D model of every station that you can ride between.

Unofficial. Not affiliated with or endorsed by BART.

## Architecture

```
                 ┌──────────────────────── Spring Boot 3.5 / Java 21 ────────────────────────┐
 BART Legacy API │  EtdPoller ──(every 30 s)──▶ Kafka topic bart.departures ──▶ listener      │
 etd orig=ALL ◀──┤  BartApiClient: timeouts,      (key = station code,         │             │
 stn cmd=stns    │  Resilience4j retry +           6 partitions, DLT)          ▼             │
                 │  circuit breaker            LiveDepartureStore (idempotent, newest wins)  │
                 │                                                             │             │
 PostgreSQL ◀────┤  Flyway + JPA: stations, lines,     NetworkService ──▶ LiveTrainService   │
                 │  stops, track, entrances            (track graph,     DepartureService    │
                 │                                      timetable)       (live + demo)      │
                 │  REST /api/* (OpenAPI, ProblemDetail errors, correlation IDs)             │
                 └──────────────────────────────────────▲────────────────────────────────────┘
                                                        │ HTTP (proxied at /api)
                 ┌────────────────── Angular 21 (standalone, zoneless, signals + RxJS) ──────┐
                 │  Leaflet map + SVG network  ·  departure board  ·  Live/Demo + speed      │
                 │  Three.js stations, loaded on demand (frontend/src/app/scene/three)       │
                 └────────────────────────────────────────────────────────────────────────────┘
```

| Part | Where | What it does |
| --- | --- | --- |
| Reference data | `backend/src/main/resources/db/migration` | Flyway migrations: schema, the 50 stations and 6 lines with their stop order. Track lines and entrances are imported on first start from `geo/geo.json` (or from BART's KML, see below). |
| Network model | `backend/.../network` | Turns the track polylines into a graph, finds the track path between every pair of neighbouring stations (Dijkstra), and builds running times. Rebuilt atomically when reference data changes. |
| BART client | `backend/.../bart` | Calls `etd.aspx` and `stn.aspx` with connect and read timeouts, retries with exponential backoff (not on 4xx), and a circuit breaker so an outage pauses polling instead of piling up timeouts. The API key stays on the server and never appears in logs or errors. |
| Live pipeline | `backend/.../live` | One poll every 30 s for every station; one Kafka message per station keyed by station code. The listener applies snapshots idempotently (an older or repeated snapshot never moves a board backwards); unreadable messages go to `bart.departures.DLT`. |
| Live trains | `LiveTrainService` | A train due at station S in less than the running time from the previous station must be on that stretch; "Leaving" means it is at the platform. Each train carries its running time and time remaining so the browser keeps it moving between polls. |
| Departures | `DepartureService` | Live boards (from Kafka) or demo boards (deterministic timetable at a simulated time), every row matched to its line and next stop. |
| Frontend | `frontend/src/app` | `core/` (API client, simulation state, pure train-position functions), `map/` (Leaflet + SVG), `panel/` (search with reactive forms, Live/Demo bar, station board), `scene/` (hosts the Three.js stations). |

The `local` profile swaps PostgreSQL for in-memory H2 and Kafka for in-process Spring events, so the whole app runs with nothing but Java and Node installed.

## Run it

You need Java 21 and Node 20.19+ (or Docker). A BART API key is optional: register at https://api2.bart.gov/api/register.aspx after reading the [developer license agreement](https://www.bart.gov/schedules/developers/developer-license-agreement). Without a key everything runs on the demo timetable.

**Everything in Docker** (PostgreSQL, Kafka, backend, frontend):

```sh
BART_API_KEY=your-key docker compose up --build     # PowerShell: $env:BART_API_KEY="your-key"; docker compose up --build
```

Open http://localhost:3000.

**Without Docker** (H2 + in-process events), in two terminals:

```sh
cd backend
BART_API_KEY=your-key ./mvnw spring-boot:run -Dspring-boot.run.profiles=local
# PowerShell: $env:BART_API_KEY="your-key"; .\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=local"

cd frontend
npm install
npm start          # http://localhost:4200, /api is proxied to localhost:8080
```

**Backend in your IDE, infrastructure in Docker:** `docker compose up postgres kafka`, then run `TransitTwinApplication` with no profile.

API docs: http://localhost:8080/swagger-ui.html. Health: `/actuator/health` (with liveness and readiness groups and the BART circuit breaker state).

### Configuration

| Variable | Default | |
| --- | --- | --- |
| `BART_API_KEY` | empty | Live data needs it. |
| `DB_URL`, `DB_USER`, `DB_PASSWORD` | `jdbc:postgresql://localhost:5432/transit`, `transit`, `transit` | Default profile only. |
| `KAFKA_BOOTSTRAP_SERVERS` | `localhost:9092` | Default profile only. |
| `GEO_KML_FILE` | empty | Path to BART's `doc.kml`: re-imports track and entrances on startup. |
| `PORT` | `8080` | Backend port. |

Poll interval, timeouts, retry and circuit breaker settings are in `backend/src/main/resources/application.yml`.

## API

| Endpoint | |
| --- | --- |
| `GET /api/network` | Stations, lines, track paths between neighbouring stations, timetable model. |
| `GET /api/geo` | Track centerlines and station entrances (same shape as the old `geo.json`). |
| `GET /api/stations/{abbr}/departures?source=live\|demo&t=` | A station's board. `t` is the simulated time for demo boards (epoch seconds). 404 for an unknown station, 503 for live when there's no fresh data. |
| `GET /api/live/status` | Whether a key is set and live data is fresh. |
| `GET /api/live/trains` | Estimated position of every live train. |
| `GET /api/fares?orig=&dest=` | Today's Clipper fare between two stations, from BART. 422 for the same station (excursion fare), 503 when BART can't be asked. |
| `GET /api/stations/{abbr}/layout` | The station's layout imported from OpenStreetMap (see below). 404 if it hasn't been imported. |

Errors are RFC 9457 problem details. Every response carries `X-Correlation-Id` (sent by the frontend or generated), which is also in every log line.

## Tests

```sh
cd backend && ./mvnw verify     # JUnit 5, Spring Boot tests, Testcontainers
cd frontend && npm test         # Vitest
```

- `BartResponseParserTest`, `KmlParserTest`, `NetworkSimulationTest` are the prototype's `node --test` suites ported to JUnit. The Java model was also checked against the JavaScript one: identical timetable for all 12 trips, identical lengths for all 100 track paths, identical demo boards.
- `ApiTest`: every endpoint, validation, problem details, correlation IDs.
- `StationLayoutBuilderTest`: the OSM layout builder on saved Overpass answers for five stations (an island mapped as one area, as two touching halves, as edge lines; side platforms as edge lines; two islands with four tracks). `FareServiceTest`: reading BART's fare answer.
- `BartIntegrationTest`: the live pipeline against a stub BART server (poll, publish, consume, estimate, serve), plus retries on 5xx, no retry on 4xx, the circuit opening, and the key never leaking into errors.
- `PostgresKafkaIntegrationTest`: Flyway on real PostgreSQL, snapshots through real Kafka, and a poison message landing on the dead-letter topic. Skipped automatically when Docker isn't available; runs in CI.
- Frontend: train placement and live extrapolation, the API client (problem details, correlation IDs), the station board (countdowns, cancellations, delays) and the station search form.

CI (`.github/workflows/ci.yml`) runs both suites and builds the Docker images.

## What is real and what is estimated

- Real: station codes and names, line colors, the order of stations on each line, track paths and entrances (BART's KML).
- Estimated: running times (from track length, about 35 s plus 22 m/s; end-to-end trips come out close to BART's published times), 25 s dwell at each stop, and the demo headways.
- Estimated, edit after checking: each station's `kind` (underground, elevated, ground level) and `platform` (island or side), in `V2__reference_data.sql`. That migration has already run on existing databases, so make corrections in a new migration (`V3__...sql`) with `UPDATE` statements. Line routes follow BART's main service pattern; evening and weekend changes (for example Yellow to Millbrae) are not modeled, though live trains to other destinations are still matched to a line.
- Live limits: a train on the last stretch into a terminal can't be placed, because the data only lists departures. That's also why the Beige airport shuttle doesn't appear in live mode.

## Track lines and entrances

The backend imports `backend/src/main/resources/geo/geo.json` into the database the first time it starts with an empty database: 96 track segments (simplified from 8,937 to 985 points) and 132 entrances.

To rebuild from a newer BART download ("Stations, tracks and entrances" KML, Developer Program, Geospatial Data), unzip it and start the backend with `GEO_KML_FILE=path/to/doc.kml`. It parses the KML, simplifies the track (Douglas-Peucker, about 2 m), and replaces the track and entrances in one transaction. This replaces the old `build-geo.mjs`.

## Station layouts from OpenStreetMap

`backend/src/main/resources/stations/{ABBR}.json` holds each imported station's real layout: platforms (outline, length, width, ref, level), the tracks beside them, whether the platforms are island or side, and, where OSM has them, entrances, escalators, stairs, elevators, fare gates, ticket machines and indoor rooms. Coordinates are meters in a station frame (origin in the middle of the platforms, +z along them, `bearingDeg` says which way that is). Each file lists what OSM had (`coverage`) and what is missing or disagrees with the reference data (`warnings`).

The import is a one-off job, not part of startup, so the app never depends on the public Overpass server. To import or refresh (the normal backend can keep running; this one has no web server):

```sh
cd backend
./mvnw spring-boot:run -Dspring-boot.run.profiles=local,osm-import "-Dspring-boot.run.arguments=--app.osm.stations=MCAR,16TH,EMBR"
# PowerShell: .\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=local,osm-import" "-Dspring-boot.run.arguments=--app.osm.stations=MCAR,16TH,EMBR"
```

`--app.osm.stations=ALL` imports every station. Each Overpass request takes 30 to 40 s and the public server often answers 502, so a full run takes 30 minutes or more. Add `--app.osm.raw-dir=target/osm-raw` to keep Overpass's answers; then `--app.osm.rebuild=true` (with the same raw-dir) rebuilds every layout from them in seconds, without asking Overpass, after a change to the builder. The test fixtures in `src/test/resources/osm` came from there.

All 50 stations are imported (Nov 25, 2026). Every station has its platforms; OSM detail beyond that varies a lot:

- Layout: 33 island, 11 side, 6 unknown (CAST, CONC, DALY, OAKL, PCTR, SFIA: no tracks mapped next to the platforms, platforms in pieces, or both).
- Escalators mapped at 20 stations, elevators at 21, fare gates at 16, indoor rooms at 10, platform level tagged at 23. The downtown SF stations (EMBR, MONT, POWL, CIVC) are the most detailed.
- Platforms split into pieces in OSM: ANTC, BALB, COLM, CONC, DALY, MLPT, OAKL, PCTR, SBRN. eBART (ANTC, PCTR) and the Oakland Airport connector (OAKL) really have shorter platforms.
- OSM disagrees with the reference data's island/side guess at 13 stations: 16TH and 24TH (OSM: island), and DELN, FTVL, HAYW, MLPT, PHIL, PLZA, SANL, SHAY, UCTY, WCRK, WOAK (OSM: side). The reference values are marked approximate; check on site or against BART's station overview maps before changing them.

Map data © OpenStreetMap contributors, available under the [Open Database License](https://opendatacommons.org/licenses/odbl/). The credit is also in every layout file and must stay wherever the data is shown.

Map notes: zoomed out, entrance dots are pushed up to 25 times farther from the station so they stay visible; from zoom 15 they sit on their true spots. Station names appear from zoom 12.

## Stations in 3D (`frontend/src/app/scene/three`)

The Three.js scenes are the prototype's modules, unchanged, with TypeScript declarations (`*.d.ts`) at the boundary. Angular loads them on demand when the page needs them.

Every station except Bay Fair is built from its `kind` and `platform` (the layout) and its architecture family (the look):
- Elevated: street-level concourse, platform 7 m up on a viaduct.
- Ground level: concourse in an underpass, platform 4.5 m up on an embankment.
- Underground: mezzanine with stairs to the street, platform 6 m below in a tunnel box.
- Island platform: one platform between the tracks. Side platforms: escalator to the southbound side, stairs to the northbound side.

BART was built in waves, and stations from one wave share a style, so each station gets the family that matches its era (`FAMILIES` and `FAMILY_OF` at the top of `station3d.js`):

| Family | Stations | Look |
| --- | --- | --- |
| Market Street subway (1973) | EMBR, MONT, POWL, CIVC | tall mezzanine, stone-look walls, quarry tile floor, coffered ceiling, brown signs |
| Mission Street subway (1973) | 16TH, 24TH | terracotta tile walls, side platforms |
| Oakland subway (1972) | 12TH, 19TH, LAKE | board-formed concrete, ribbed ceiling, bronze trim |
| Berkeley subway (1973) | DBRK, NBRK, ASHB | glazed tile walls, terrazzo floor |
| Glen Park (1973) | GLEN | concrete vault over the mezzanine |
| SFO extension (2003) | COLM, SSAN, SBRN | white panels, terrazzo, downlights, modern dark signs |
| East Bay aerial (1972) | elevated stations not listed elsewhere | gable concrete roof on round columns, quarry tile, dark fascia |
| Original ground level (1970s) | surface stations not listed elsewhere | flat concrete roof with a skylight strip, square columns |
| Extension (1995 to 2018) | MLBR, DUBL, WDUB, PITT, PCTR, ANTC, NCON | white curved roof on branching steel columns, light pavers |
| Silicon Valley (2017 to 2020) | WARM, MLPT, BERY | folded white roof with glass steps |
| Airport | SFIA, OAKL | curved roof, glass walls |

`STATION_TWEAKS` gives single stations their own colors, stations in or beside a freeway (`FREEWAY`) get raised lanes with moving traffic, and the rest get a park-and-ride lot. All of this is approximate, from general knowledge and photos, not surveyed.

Every station has ticket machines, an agent booth, 8 tall glass fare gates, escalator and stairs, departure boards, yellow truncated-dome edge strips, the third rail, posters, signs with the station name and colored dots for the lines that stop there, and 3-car trains. The boards and trains follow the same departures as the side panel. Board a train, ride to the real next stop on that line (the backend matches every departure to its next stop), then "Get off at …" to walk around that station. Your demo card balance carries over.

**Bay Fair** (`bayfair.js`) is a detailed model built from 10 photos: brick concourse with lime columns, ticket machines, agent booth, 8 fare gates, escalator and stairs, the elevated island platform, red departure boards. Its sizes are estimates in the `DIM` block at the top of the file; the fare is a placeholder, not a real BART fare. Platform 1 is the east track and platform 2 the west track (an estimate: edit `SIDE` after checking on site).

**The train** (`fleet.js`, `train-ride.js`) models BART's Fleet of the Future cars from the photos in `docs/photos` and BART's public descriptions (https://bart.gov/cars): fluted stainless sides, large rounded windows, three doors per side, blue and lime seats, LED ceiling panels, wheelchair and bike areas, next-stop screens. Sizes are estimates (about 21 m by 3.2 m). No logos.

Controls: click the view, then W A S D or arrows to walk, drag to look, E to use things, Shift to run. Touch screens get on-screen buttons.

Debug hooks: `/?debug` exposes `window.sim` (`loadScene('MONT')`, `selectStation('MONT')`, `setSpeed(60)`, `currentTrains()`) and `window.scene3d` (`teleport('platform-train')`, `getState()`, `_skip(sec)`, `_park('South')`). For screenshots: `/?debug&station=MONT&spot=platform-train&park=South&yaw=-1.2`.

The map tiles come from OpenStreetMap, so the page needs an internet connection.

## About BART's data (checked Nov 21, 2026)

- The Legacy API is still documented, but BART points developers to GTFS and GTFS-realtime as the supported standards. GTFS-realtime (`http://api.bart.gov/gtfsrt/tripupdate.aspx`, protobuf, no registration) is the natural next source for the poller.
- Known gaps: trip IDs for Pittsburg Center and Antioch don't match the GTFS schedule, and the Oakland Airport Connector publishes no real-time arrivals.
- BART asks developers not to use its official logo or system map. This project uses neither.

## History

The first version was a Node prototype (a 120-line proxy server and vanilla JavaScript). The commit "Snapshot of the Node/vanilla JS prototype" has it as it was.
