// Pure data helpers (no DOM), so they can be tested with `node --test`.
// Shapes follow the BART Legacy API docs: https://api2.bart.gov/docs/

// The API converts XML to JSON, so a list with one item can arrive as a plain
// object instead of an array. This normalizes both cases.
export const toArray = (v) => (v == null || v === '' ? [] : Array.isArray(v) ? v : [v]);

// Best-effort text from the API's "message" field (warnings, errors).
export function parseMessage(data) {
  const m = data?.root?.message;
  if (!m) return '';
  if (typeof m === 'string') return m;
  return m.warning || m.error?.text || '';
}

export function parseStations(data) {
  return toArray(data?.root?.stations?.station)
    .map((s) => ({
      abbr: s.abbr,
      name: s.name ?? s.n, // JSON uses "name"; the XML sample uses "n"
      lat: parseFloat(s.gtfs_latitude),
      lon: parseFloat(s.gtfs_longitude),
      address: s.address,
      city: s.city,
    }))
    .filter((s) => s.abbr && s.name && Number.isFinite(s.lat) && Number.isFinite(s.lon))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const FALLBACK_HEX = '#8a8f98';
const safeHex = (h) => (/^#[0-9a-f]{6}$/i.test(h || '') ? h : FALLBACK_HEX);

// Rows for one station object from the etd response.
function stationRows(station) {
  const rows = [];
  for (const etd of toArray(station.etd)) {
    for (const est of toArray(etd.estimate)) {
      const parsed = est.minutes === 'Leaving' ? 0 : parseInt(est.minutes, 10);
      const minutes = Number.isFinite(parsed) ? parsed : null;
      rows.push({
        destination: etd.destination,
        destAbbr: etd.abbreviation,
        minutes,
        timeLabel: minutes === null ? '—' : minutes === 0 ? 'Leaving' : `${minutes} min`,
        platform: est.platform,
        direction: est.direction,
        cars: est.length,
        color: est.color,
        hex: safeHex(est.hexcolor),
        delaySec: Number(est.delay) || 0,
        cancelled: est.cancelflag === '1',
      });
    }
  }
  rows.sort((a, b) => (a.minutes ?? Infinity) - (b.minutes ?? Infinity));
  return rows;
}

// Flattens "destination -> estimates" into one list sorted by time.
export function parseDepartures(data) {
  const station = toArray(data?.root?.station)[0];
  const message = parseMessage(data);
  if (!station) return { stationName: null, rows: [], message };
  return { stationName: station.name ?? station.n ?? null, rows: stationRows(station), message };
}

// For etd.aspx?orig=ALL: every station's rows, keyed by station abbreviation.
export function parseAllDepartures(data) {
  const byStation = {};
  for (const station of toArray(data?.root?.station)) {
    if (station?.abbr) byStation[station.abbr] = stationRows(station);
  }
  return byStation;
}
