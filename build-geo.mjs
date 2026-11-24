// Converts BART's KML export into geo.json for the app.
//
// Usage:  node build-geo.mjs path/to/doc.kml [geo.json]
//
// Get the KML from the Developer Program page (Stations and Lines). Unzip the
// download and use doc.kml; the PNG and XSL files next to it are only styling.

import { readFile, writeFile } from 'node:fs/promises';
import { parseKml, simplifyLine } from './kml.js';

const [, , input, output = 'geo.json'] = process.argv;
if (!input) {
  console.error('Usage: node build-geo.mjs path/to/doc.kml [geo.json]');
  process.exit(1);
}

const TOLERANCE = 0.00002; // degrees, roughly 2 meters: drops points that don't change the shape
const round = (n) => Math.round(n * 1e5) / 1e5; // 5 decimals, roughly 1 meter

const kml = parseKml(await readFile(input, 'utf8'));
if (kml.track.length === 0 || kml.entrances.length === 0) {
  console.error('This does not look like the BART stations, entrances and tracks KML (no track lines or entrances found).');
  process.exit(1);
}

const track = kml.track.map((line) =>
  simplifyLine(line, TOLERANCE).map(([lon, lat]) => [round(lon), round(lat)]),
);

const entrances = {};
let unmatched = 0;
for (const e of kml.entrances) {
  if (!e.station) {
    unmatched += 1;
    continue;
  }
  (entrances[e.station] ??= []).push({ name: e.name, lat: round(e.lat), lon: round(e.lon) });
}
for (const list of Object.values(entrances)) list.sort((a, b) => a.name.localeCompare(b.name));

const json = JSON.stringify({ track, entrances });
await writeFile(output, json);

const before = kml.track.reduce((n, l) => n + l.length, 0);
const after = track.reduce((n, l) => n + l.length, 0);
console.log(`Track: ${track.length} segments, ${before} points simplified to ${after}`);
console.log(`Entrances: ${kml.entrances.length - unmatched} across ${Object.keys(entrances).length} stations` + (unmatched ? ` (${unmatched} had no station code and were skipped)` : ''));
console.log(`Wrote ${output} (${(json.length / 1024).toFixed(0)} KB)`);
