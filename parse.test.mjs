import test from 'node:test';
import assert from 'node:assert/strict';
import { toArray, parseStations, parseDepartures, parseMessage } from './parse.js';

// Fixtures follow the sample responses in the BART Legacy API docs.
const stationsFixture = {
  root: {
    stations: {
      station: [
        { name: 'Warm Springs / South Fremont', abbr: 'WARM', gtfs_latitude: '37.502171', gtfs_longitude: '-121.939313', address: '45193 Warm Springs Blvd', city: 'Fremont' },
        { name: '12th St. Oakland City Center', abbr: '12TH', gtfs_latitude: '37.803768', gtfs_longitude: '-122.271450', address: '1245 Broadway', city: 'Oakland' },
        { name: 'Broken', abbr: 'BAD', gtfs_latitude: 'n/a', gtfs_longitude: '' },
      ],
    },
    message: '',
  },
};

const etdFixture = {
  root: {
    station: [
      {
        name: 'Richmond',
        abbr: 'RICH',
        etd: [
          {
            destination: 'Fremont',
            abbreviation: 'FRMT',
            estimate: [
              { minutes: '13', platform: '2', direction: 'South', length: '4', color: 'ORANGE', hexcolor: '#ff9933', delay: '0', cancelflag: '0' },
              { minutes: 'Leaving', platform: '2', direction: 'South', length: '4', color: 'ORANGE', hexcolor: '#ff9933', delay: '238', cancelflag: '0' },
            ],
          },
          {
            destination: 'Millbrae',
            abbreviation: 'MLBR',
            estimate: { minutes: '6', platform: '2', direction: 'South', length: '5', color: 'RED', hexcolor: 'not-a-color', delay: '0', cancelflag: '1' },
          },
        ],
      },
    ],
    message: '',
  },
};

test('toArray handles missing, single and list values', () => {
  assert.deepEqual(toArray(undefined), []);
  assert.deepEqual(toArray(''), []);
  assert.deepEqual(toArray({ a: 1 }), [{ a: 1 }]);
  assert.deepEqual(toArray([1, 2]), [1, 2]);
});

test('parseStations sorts by name and drops stations without usable coordinates', () => {
  const stations = parseStations(stationsFixture);
  assert.deepEqual(stations.map((s) => s.abbr), ['12TH', 'WARM']);
  assert.equal(stations[0].lat, 37.803768);
  assert.equal(stations[0].lon, -122.27145);
});

test('parseStations accepts a single station returned as an object', () => {
  const one = { root: { stations: { station: stationsFixture.root.stations.station[0] } } };
  assert.equal(parseStations(one).length, 1);
});

test('parseStations returns an empty list for an unexpected payload', () => {
  assert.deepEqual(parseStations({}), []);
  assert.deepEqual(parseStations(null), []);
});

test('parseDepartures flattens destinations and sorts by minutes, Leaving first', () => {
  const { stationName, rows } = parseDepartures(etdFixture);
  assert.equal(stationName, 'Richmond');
  assert.deepEqual(rows.map((r) => r.timeLabel), ['Leaving', '6 min', '13 min']);
  assert.equal(rows[0].delaySec, 238);
});

test('parseDepartures handles a single estimate object, cancelled flag and bad colors', () => {
  const { rows } = parseDepartures(etdFixture);
  const millbrae = rows.find((r) => r.destination === 'Millbrae');
  assert.equal(millbrae.cancelled, true);
  assert.match(millbrae.hex, /^#[0-9a-f]{6}$/i); // invalid color replaced by a safe fallback
});

test('parseDepartures reports a message when there is no station', () => {
  const out = parseDepartures({ root: { message: { warning: 'No data matched your criteria.' } } });
  assert.deepEqual(out.rows, []);
  assert.equal(out.message, 'No data matched your criteria.');
});

test('parseMessage reads strings, warnings and error text', () => {
  assert.equal(parseMessage({ root: { message: 'hello' } }), 'hello');
  assert.equal(parseMessage({ root: { message: { error: { text: 'Invalid key' } } } }), 'Invalid key');
  assert.equal(parseMessage({}), '');
});

test('rows keep the destination station code', async () => {
  const { rows } = parseDepartures(etdFixture);
  assert.equal(rows.find((r) => r.destination === 'Fremont').destAbbr, 'FRMT');
});

test('parseAllDepartures keys every station by its code', async () => {
  const { parseAllDepartures } = await import('./parse.js');
  const two = { root: { station: [etdFixture.root.station[0], { name: 'Bay Fair', abbr: 'BAYF', etd: { destination: 'Daly City', abbreviation: 'DALY', estimate: { minutes: '4', platform: '2', direction: 'North', length: '9', color: 'BLUE', hexcolor: '#0099cc', delay: '0', cancelflag: '0' } } }] } };
  const all = parseAllDepartures(two);
  assert.deepEqual(Object.keys(all).sort(), ['BAYF', 'RICH']);
  assert.equal(all.BAYF[0].destAbbr, 'DALY');
  assert.equal(all.BAYF[0].minutes, 4);
  assert.deepEqual(parseAllDepartures({}), {});
});
