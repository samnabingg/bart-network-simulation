# BART network simulation (Transit Digital Twin spike)

A prototype that simulates the whole BART network: trains moving on every line on the map, live or from a demo timetable, and a walkable 3D version of every station that you can ride between.

Unofficial. Not affiliated with or endorsed by BART.

## Run it

1. Put all the files in one folder: `package.json`, `server.js`, `index.html`, `app.js`, `network.js`, `station3d.js`, `fleet.js`, `bayfair.js`, `train-ride.js`, `parse.js`, `kml.js`, `build-geo.mjs`, `geo.json`, the `*.test.mjs` files and `README.md`.
2. Install Node 18 or newer (no `npm install` needed, there are no dependencies).
3. Optional: register for a BART API key: https://api2.bart.gov/api/register.aspx. Read the [developer license agreement](https://www.bart.gov/schedules/developers/developer-license-agreement) first.
4. Start the server with your key:
   - macOS or Linux: `BART_API_KEY=your-key node server.js`
   - Windows PowerShell: `$env:BART_API_KEY="your-key"; node server.js`
5. Open http://localhost:3000. To use another port: `$env:PORT=3001; node server.js` (PowerShell) or `PORT=3001 node server.js`.
6. Optional: run the tests with `node --test`.

Without a key the page still works: it uses the built-in station list and the demo timetable.

## Network simulation (network.js, app.js)

- **Map**: colored lines (Yellow, Red, Orange, Green, Blue, Beige) drawn along BART's real track from `geo.json`, side by side where lines share track. Colored dots are trains; click one to see its line, destination and next stop. Stations are hollow rings. Everything sits on an OpenStreetMap street map (Leaflet): scroll or pinch to zoom, drag to pan. Station names appear from zoom 12.
- **Live / Demo** switch above the map:
  - **Live** (needs the key) calls `etd.aspx?orig=ALL` every 30 seconds, one request for every station, and estimates where each train is. A train due at a station in less than the running time from the previous station must be on that stretch; "Leaving" means it is at the platform.
  - **Demo** runs a simulated timetable (every 15 minutes per line, every 8 minutes on the airport shuttle) and can run at 1×, 10× or 60× speed. It is used automatically when there is no key or live data fails.
- **Departures** in the right panel and the boards and trains in the 3D station come from the same source as the map.
- **Walk through any station**: pick a station, then "Walk through … in 3D". Board a train, ride to the real next stop on that line, then "Get off at …" to walk around that station. Your demo card balance carries over.

What is real and what is estimated (all in `network.js`):
- Real: station codes and names, line colors, the order of stations on each line, and track paths (BART's KML).
- Estimated: running times (from track length, about 35 s plus 22 m/s; end-to-end trips come out close to BART's published times), 25 s dwell at each stop, and the demo headways.
- Estimated, edit after checking: each station's `kind` (underground, elevated, ground level) and `platform` (island or side) in `STATIONS`. Line routes follow BART's main service pattern; evening and weekend changes (for example Yellow to Millbrae) are not modeled, though live trains to other destinations are still matched to a line.
- Live limits: a train on the last stretch into a terminal can't be placed, because the data only lists departures. That's also why the Beige airport shuttle doesn't appear in live mode.

## Stations (station3d.js)

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

On top of that, `STATION_TWEAKS` gives single stations their own wall, floor or trim colors, stations in or beside a freeway (`FREEWAY`) get raised lanes with moving traffic, and the rest get a park-and-ride lot. All of this is approximate, from general knowledge of the stations and photos, not surveyed. Compare with photos of each station and edit the tables.

Every station has ticket machines, an agent booth, 8 tall glass fare gates (tap in, and tap out from the paid side), escalator and stairs, departure boards, yellow truncated-dome edge strips, the third rail, posters, signs with the station name and colored dots for the lines that stop there, and 3-car trains (southbound on the +x track, northbound on the −x track). Open-air stations have sun shadows, a sky and clouds. Parts that never move are merged into one mesh per material so it stays fast.

## The train outside (fleet.js)

Every station, Bay Fair included, uses one model of BART's Fleet of the Future cars, built from the photos in this folder (`Bart--exterior.jpg`, `Bart-outside.jpg`): brushed stainless sides fluted below the windows, large rounded windows showing the lit interior (blue seats, lime priority seats, a few riders), three stainless doors per side with tall windows, a white cab end with a large dark windshield, an amber destination sign that shows the line color and destination, a light-blue swoosh behind the cab, headlights at the front and red lights at the back, trucks and wheels, and roof equipment. Sizes are estimates. No logos.

Test hooks: open `/?debug` to get `window.sim` (`loadScene('MONT')`, `setSpeed(60)`, `currentTrains()`) and `window.scene3d` (`teleport('platform-train')`, `getState()`, `_skip(sec)`, `_park('South')` to stand a train at the platform). For screenshots, `/?debug&station=MONT&spot=platform-train&park=South&yaw=-1.2` opens a station at a spot, looking a given way, with a train parked.

The page loads the 3D library (Three.js), the map library (Leaflet) and OpenStreetMap tiles from the internet, so you need a connection.

## Track lines and entrances (geo.json)

`geo.json` is already built from BART's "Stations, tracks and entrances" KML download (Developer Program, Geospatial Data), so you don't need to do anything. It holds 96 track segments (simplified from 8,937 to 985 points) and 132 station entrances grouped by station code.

To rebuild it from a newer download: unzip it, then run `node build-geo.mjs path/to/doc.kml`. Only `doc.kml` is needed; the PNG and XSL files are styling.

Notes:
- The track has no line colors (Red, Orange, and so on), so it draws as one gray network. Colors need BART's GTFS route and shape data, which is a phase 1 follow-up.
- Zoomed out, entrance dots are pushed up to 25 times farther from the station so they stay visible. From zoom 15 they sit on their true spots.
- Without `geo.json` the map still works with dots only and shows a warning.

## Bay Fair walkthrough (bayfair.js)

The bottom panel is now a walkable model of Bay Fair, built from 10 photos: brick concourse with lime columns, ticket machines, station agent booth, 8 fare gates, escalator and stairs, the elevated island platform with the lime round enclosure, red departure boards, and a train.

- Controls: click the view, then W A S D or arrows to walk, drag to look, E to use things, Shift to run. On touch screens there are on-screen buttons.
- Try this path: ticket machine (add demo money) → fare gate (tap, you need money first) → escalator or stairs → platform → board when the train's doors are open.
- The platform boards and trains use live Bay Fair departures from your API key, whichever station is selected on the map. Each platform's next train stands at the platform until its estimated departure time, then pulls out. A line in the top right says whether data is live or demo. Platform 1 is the east track and platform 2 the west track (an estimate, edit `SIDE` in `bayfair.js` after checking on site).
- The entrance is modeled on the main entrance photo. The tunnel entrance from your earlier photos is a different entrance and is not modeled separately yet.
- Boarding puts you inside the train (`train-ride.js`). You can walk the car, sit (E near a seat), and ride to the next station. The next station depends on the destination: San Leandro for northbound trains, Hayward toward Berryessa, Castro Valley toward Dublin/Pleasanton. The ride is shortened to about a minute.

## Inside the train (train-ride.js)

One car modeled on BART's public descriptions of its Fleet of the Future cars (https://bart.gov/cars, https://www.bart.gov/about/projects/cars/new-features) and the interior photos in this folder (`Bart-inside.jpg`, `Bart---inside.jpg`, `Bart--inside.webp`): white walls, lime end walls around the gangway door, two long LED light panels in the ceiling, a dark speckled floor, blue seats with lime (yellow-green) priority seats near the doors on light gray shells, yellow bands on the poles, black hanging straps along the grab rails, CCTV domes, seats mounted high with open floor under them, three doors per side, tripod poles at the end doors, open wheelchair areas at the center doors with a floor graphic and no poles, two bike areas, screens beside the doors showing the next stop and route line, and next-stop displays at both ends. Sizes are estimates (about 21 m by 3.2 m). Seat fabric, floor and wall colors are approximations, so compare with photos and adjust the materials at the top of `createTrainRide`.

Sizes are estimates from photos. They all live in the `DIM` block at the top of `bayfair.js` (platform height, platform width, gate position, the demo fare and so on). Measure on site and edit the numbers. The fare is a placeholder, not a real BART fare.

Not modeled yet: restrooms (not in the photos), the elevator, the exterior underpass and stairs, bus bays in detail, advertising and signage text. No BART logos are used.

Test hook: open `http://localhost:3000/?debug` to expose `window.bayfair` in the console (`teleport('gates')`, `getState()`).

## What to check

| Question | Where you see it |
| --- | --- |
| Does the station list load and plot on a map? | Left panel |
| Do live departures load for any station, with line color, platform and delays? | Right panel, refreshes every 30 seconds |
| Does the Bay Fair walkthrough run smoothly, and can you walk the full path? | Bottom panel, drag to look |
| Does it still feel smooth on your phone? | Set `HOST=0.0.0.0` on a trusted network, then open `http://<your-computer-ip>:3000` on the phone |

If all four are yes, the spike passed and phase 1 is worth starting properly.

## What this uses

- BART Legacy API, calls `stn.aspx?cmd=stns` (station list) and `etd.aspx?cmd=etd` (estimated departures), both with `json=y`. Docs: https://api2.bart.gov/docs/
- A small Node server that proxies those calls, so your key never reaches the browser. Station list is cached for an hour, departures for 15 seconds.
- Plain SVG for the map (stations projected from latitude and longitude) and Three.js for the Bay Fair 3D walkthrough.

## What I learned from BART's docs (checked Nov 21, 2026)

- The Legacy API is still documented, but BART points developers to its GTFS and GTFS-realtime feeds as the supported standards. Plan to move to GTFS-realtime for phase 2 (moving trains).
- GTFS-realtime needs no registration. Feeds: `http://api.bart.gov/gtfsrt/tripupdate.aspx` and `http://api.bart.gov/gtfsrt/alerts.aspx` (protobuf format, so you need a decoder library).
- Known data gaps: trip IDs for Pittsburg Center and Antioch stations don't match the GTFS schedule, and the Oakland Airport Connector publishes no real-time arrivals.
- BART asks developers not to use its official logo or system map. This spike uses neither.

## Known unknowns

- I couldn't call BART's servers from where I built this, so the first run with your key is the real test of the live calls. The parsing code is tested against the sample responses in the docs.
- The exact shape of BART's error response for a bad key is a best guess, so a wrong key may show a generic message.
- Track lines and entrances were checked in a headless browser against a mock of the BART API, not the live API. Station dots and track both use BART's coordinates, but confirm on your first run that the dots sit on the lines.

## Not in the spike

Real timetables (GTFS), GTFS-realtime vehicle data, detailed models of stations other than Bay Fair, crowding and passengers, disruptions and scenarios, accounts.