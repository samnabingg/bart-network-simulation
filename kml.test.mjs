import test from 'node:test';
import assert from 'node:assert/strict';
import { parseKml, simplifyLine } from './kml.js';

// Small fixture in the same shape as BART's KML: three folders.
const fixture = `<?xml version="1.0" encoding="UTF-8"?>
<kml><Document>
  <Folder id="FeatureLayer0"><name>Station Entrance</name>
    <Placemark id="1"><name>B2 13th St &amp; Broadway Entrance / Exit</name>
      <description><![CDATA[<table><tr><td>Name</td><td>x</td></tr>
<tr><td>parent_station</td>
<td>place_12TH</td></tr></table>]]></description>
      <Point><coordinates>-122.2717025,37.8033157,0</coordinates></Point></Placemark>
    <Placemark id="2"><name>No station code</name><description><![CDATA[<table></table>]]></description>
      <Point><coordinates>-122.1,37.7,0</coordinates></Point></Placemark>
  </Folder>
  <Folder id="FeatureLayer1"><name>BART Station</name>
    <Placemark id="3"><name>Lake Merritt</name><Point><coordinates>-122.265,37.797,0</coordinates></Point></Placemark>
  </Folder>
  <Folder id="FeatureLayer2"><name>BART Track Centerline</name>
    <Placemark id="4"><name>1</name><MultiGeometry>
      <LineString><coordinates>-122.0,37.0,0 -121.9,37.1,0 -121.8,37.2,0</coordinates></LineString>
      <LineString><coordinates>-122.5,37.5,0 -122.4,37.6,0</coordinates></LineString>
    </MultiGeometry></Placemark>
  </Folder>
</Document></kml>`;

test('parseKml reads entrances, stations and track segments', () => {
  const out = parseKml(fixture);
  assert.equal(out.entrances.length, 2);
  assert.equal(out.stations.length, 1);
  assert.equal(out.track.length, 2);
  assert.equal(out.track[0].length, 3);
});

test('parseKml keeps longitude first and decodes names', () => {
  const [first] = parseKml(fixture).entrances;
  assert.equal(first.name, 'B2 13th St & Broadway Entrance / Exit');
  assert.equal(first.lon, -122.2717025);
  assert.equal(first.lat, 37.8033157);
});

test('parseKml decodes numeric entities like &#38; and &#x26;', () => {
  const kml = fixture.replace('B2 13th St &amp; Broadway', 'B2 13th St &#38; Broadway &#x26; Oak');
  assert.equal(parseKml(kml).entrances[0].name, 'B2 13th St & Broadway & Oak Entrance / Exit');
});

test('parseKml takes the station code from parent_station, even across line breaks', () => {
  const out = parseKml(fixture);
  assert.equal(out.entrances[0].station, '12TH');
  assert.equal(out.entrances[1].station, ''); // missing code is reported, not guessed
});

test('simplifyLine drops points on a straight line and keeps the corners', () => {
  const straight = [[0, 0], [1, 0], [2, 0], [3, 0]];
  assert.deepEqual(simplifyLine(straight, 0.001), [[0, 0], [3, 0]]);

  const corner = [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]];
  assert.deepEqual(simplifyLine(corner, 0.001), [[0, 0], [2, 0], [2, 2]]);
});

test('simplifyLine leaves short lines alone and never mutates its input', () => {
  const two = [[0, 0], [1, 1]];
  assert.deepEqual(simplifyLine(two, 1), two);
  const original = [[0, 0], [1, 0], [2, 0]];
  simplifyLine(original, 0.001);
  assert.equal(original.length, 3);
});
