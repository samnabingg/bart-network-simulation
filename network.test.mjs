import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  STATIONS, LINES, coordsFromEntrances, buildPaths, buildTimetable, demoTrains, demoDepartures,
  resolveTrip, nextStop, liveTrains, stopsFor,
} from './network.js';

const geo = JSON.parse(readFileSync(new URL('./geo.json', import.meta.url), 'utf8'));
const coords = coordsFromEntrances(geo.entrances);
const paths = buildPaths(geo.track, coords);
const tt = buildTimetable(paths);

test('every station on every line is a known station with coordinates', () => {
  for (const [id, L] of Object.entries(LINES)) {
    for (const s of L.stops) {
      assert.ok(STATIONS[s], `${id}: unknown station ${s}`);
      assert.ok(coords[s], `${id}: no coordinates for ${s}`);
    }
  }
  assert.equal(Object.keys(STATIONS).length, 50);
});

test('every stretch between neighbouring stations follows the track without detours', () => {
  for (const L of Object.values(LINES)) {
    for (let i = 1; i < L.stops.length; i++) {
      const p = paths[`${L.stops[i - 1]}>${L.stops[i]}`];
      assert.ok(p, `missing ${L.stops[i - 1]}>${L.stops[i]}`);
      assert.ok(p.onTrack, `${L.stops[i - 1]}>${L.stops[i]} fell back to a straight line`);
    }
  }
});

test('end-to-end trip times are in a believable range', () => {
  const min = (line) => tt[`${line}:0`].total / 60;
  assert.ok(min('yellow') > 80 && min('yellow') < 115, `yellow ${min('yellow')}`);
  assert.ok(min('blue') > 50 && min('blue') < 80, `blue ${min('blue')}`);
});

test('demo trains are deterministic and sit on their line', () => {
  const t = 1_800_000_000;
  const a = demoTrains(tt, t), b = demoTrains(tt, t);
  assert.deepEqual(a, b);
  assert.ok(a.length > 30, `only ${a.length} trains`);
  for (const tr of a) {
    const stops = stopsFor(tr.line, tr.dir);
    assert.ok(stops.includes(tr.from) && stops.includes(tr.to));
    assert.ok(tr.progress >= 0 && tr.progress <= 1);
  }
});

test('demo departures count down and never list a terminal as a departure', () => {
  const rows = demoDepartures(tt, 'BAYF', 1_800_000_000);
  assert.ok(rows.length >= 4);
  assert.ok(rows.every((r, i) => i === 0 || r.minutes >= rows[i - 1].minutes));
  assert.ok(new Set(rows.map((r) => r.destAbbr)).size >= 3);
  assert.equal(demoDepartures(tt, 'OAKL', 1_800_000_000).filter((r) => r.destAbbr === 'OAKL').length, 0);
});

test('live trains are matched to the right line, Red and Yellow included', () => {
  assert.deepEqual(resolveTrip('BAYF', 'DALY', '#0099cc', 'North'), { line: 'blue', dir: 0 });
  assert.deepEqual(resolveTrip('BAYF', 'DALY', '#339933', 'North'), { line: 'green', dir: 0 });
  assert.deepEqual(resolveTrip('CONC', 'MLBR', '#ffff33', 'South'), { line: 'yellow', dir: 0 });
  assert.equal(nextStop('BAYF', 'BERY', '#339933', 'South').abbr, 'HAYW');
  assert.equal(nextStop('BAYF', 'DUBL', '#0099cc', 'South').abbr, 'CAST');
  assert.equal(nextStop('SFIA', 'SFIA', '#ffff33', 'South'), null);
});

test('live positions: one train per stretch, Leaving means at the platform', () => {
  const row = (destAbbr, minutes, hex, direction) => ({ destAbbr, minutes, hex, direction, cancelled: false });
  const byStation = {
    SANL: [row('DALY', 1, '#0099cc', 'North')], // between Bay Fair and San Leandro
    COLS: [row('DALY', 5, '#0099cc', 'North')], // same train, further on: must not be drawn twice
    HAYW: [row('BERY', 0, '#339933', 'South')], // standing at Hayward
  };
  const trains = liveTrains(tt, byStation, 0);
  assert.equal(trains.length, 2);
  const blue = trains.find((t) => t.line === 'blue');
  assert.equal(blue.from, 'BAYF');
  assert.equal(blue.to, 'SANL');
  assert.ok(blue.progress > 0 && blue.progress < 1);
  assert.equal(trains.find((t) => t.line === 'green').at, 'HAYW');
});
