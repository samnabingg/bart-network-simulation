// Build-time helpers: turn BART's KML export (stations, entrances, track
// centerline) into small JSON the web app can draw. Used by build-geo.mjs.
// This is a light regex reader for BART's machine-generated KML, not a general
// KML parser.

// Decodes named and numeric XML entities (BART writes "&" as "&#38;").
// &amp; goes last so "&amp;lt;" correctly becomes "&lt;", not "<".
const decode = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

const placemarkName = (pm) => decode((pm.match(/<name>([^<]*)<\/name>/) || [, ''])[1]).trim();

function pointOf(pm) {
  const m = pm.match(/<Point>[\s\S]*?<coordinates>\s*([^<\s]+)\s*<\/coordinates>/);
  if (!m) return null;
  const [lon, lat] = m[1].split(',').map(Number); // KML order is longitude, latitude, altitude
  return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null;
}

function foldersOf(kml) {
  return kml
    .split('<Folder')
    .slice(1)
    .map((chunk) => ({
      name: decode((chunk.match(/<name>([^<]*)<\/name>/) || [, ''])[1]).trim(),
      placemarks: chunk.match(/<Placemark[\s\S]*?<\/Placemark>/g) || [],
    }));
}

// Returns { stations: [{name, lon, lat}], entrances: [{name, station, lon, lat}], track: [[[lon, lat], ...], ...] }
// `station` on an entrance is the BART station code (for example "12TH"), read from parent_station.
export function parseKml(text) {
  const out = { stations: [], entrances: [], track: [] };

  for (const { name, placemarks } of foldersOf(text)) {
    if (/entrance/i.test(name)) {
      for (const pm of placemarks) {
        const pt = pointOf(pm);
        if (!pt) continue;
        const parent = (pm.match(/<td>parent_station<\/td>\s*<td>([^<]*)<\/td>/) || [, ''])[1];
        out.entrances.push({
          name: placemarkName(pm),
          station: parent.replace(/^place_/, '').trim(),
          lon: pt[0],
          lat: pt[1],
        });
      }
    } else if (/track/i.test(name)) {
      for (const pm of placemarks) {
        for (const ls of pm.match(/<LineString>[\s\S]*?<\/LineString>/g) || []) {
          const raw = ls.match(/<coordinates>([\s\S]*?)<\/coordinates>/);
          if (!raw) continue;
          const coords = raw[1]
            .trim()
            .split(/\s+/)
            .map((c) => c.split(',').map(Number))
            .filter((c) => c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]))
            .map(([lon, lat]) => [lon, lat]);
          if (coords.length >= 2) out.track.push(coords);
        }
      }
    } else if (/station/i.test(name)) {
      for (const pm of placemarks) {
        const pt = pointOf(pm);
        if (pt) out.stations.push({ name: placemarkName(pm), lon: pt[0], lat: pt[1] });
      }
    }
  }
  return out;
}

function distToSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

// Douglas-Peucker line simplification. `tolerance` is in the same units as the
// points (degrees here). Endpoints are always kept.
export function simplifyLine(points, tolerance) {
  if (points.length <= 2) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];

  while (stack.length) {
    const [a, b] = stack.pop();
    let maxDist = 0;
    let index = -1;
    for (let i = a + 1; i < b; i++) {
      const d = distToSegment(points[i], points[a], points[b]);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (index !== -1 && maxDist > tolerance) {
      keep[index] = 1;
      stack.push([a, index], [index, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}
