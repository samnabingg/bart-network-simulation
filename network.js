// The whole BART network as data, plus the simulation that moves trains around it.
// Pure logic (no DOM, no Three.js), so it runs in the browser and under `node --test`.
//
// What is real and what is estimated:
//   - Station codes, names, line colors and the order of stations on each line follow BART's
//     published lines (checked against the station list and the KML in this folder).
//   - Track paths between stations come from geo.json (BART's KML track lines).
//   - Station TYPE (underground, elevated, ground level) and PLATFORM layout (island, side) are
//     from general knowledge, NOT surveyed. Edit STATIONS below after you check on site.
//   - Travel times are estimated from the track length (no timetable is loaded yet), and the
//     demo timetable uses a simple fixed headway per line. Live mode uses BART's real estimates.
// Unofficial. Not affiliated with or endorsed by BART.

/* ---------- Stations ---------- */
// kind: 'underground' | 'elevated' | 'surface'   platform: 'island' | 'side'
export const STATIONS = {
  '12TH': { name: '12th St. Oakland City Center', kind: 'underground', platform: 'island' },
  '16TH': { name: '16th St. Mission', kind: 'underground', platform: 'side' },
  '19TH': { name: '19th St. Oakland', kind: 'underground', platform: 'island' },
  '24TH': { name: '24th St. Mission', kind: 'underground', platform: 'side' },
  ANTC: { name: 'Antioch', kind: 'surface', platform: 'island' },
  ASHB: { name: 'Ashby', kind: 'underground', platform: 'island' },
  BALB: { name: 'Balboa Park', kind: 'surface', platform: 'island' },
  BAYF: { name: 'Bay Fair', kind: 'elevated', platform: 'island' },
  BERY: { name: 'Berryessa/North San José', kind: 'surface', platform: 'island' },
  CAST: { name: 'Castro Valley', kind: 'surface', platform: 'island' },
  CIVC: { name: 'Civic Center/UN Plaza', kind: 'underground', platform: 'island' },
  COLM: { name: 'Colma', kind: 'underground', platform: 'island' },
  COLS: { name: 'Coliseum', kind: 'elevated', platform: 'island' },
  CONC: { name: 'Concord', kind: 'elevated', platform: 'island' },
  DALY: { name: 'Daly City', kind: 'surface', platform: 'island' },
  DBRK: { name: 'Downtown Berkeley', kind: 'underground', platform: 'island' },
  DELN: { name: 'El Cerrito del Norte', kind: 'elevated', platform: 'island' },
  DUBL: { name: 'Dublin/Pleasanton', kind: 'surface', platform: 'island' },
  EMBR: { name: 'Embarcadero', kind: 'underground', platform: 'island' },
  FRMT: { name: 'Fremont', kind: 'surface', platform: 'island' },
  FTVL: { name: 'Fruitvale', kind: 'elevated', platform: 'island' },
  GLEN: { name: 'Glen Park', kind: 'underground', platform: 'island' },
  HAYW: { name: 'Hayward', kind: 'elevated', platform: 'island' },
  LAFY: { name: 'Lafayette', kind: 'surface', platform: 'island' },
  LAKE: { name: 'Lake Merritt', kind: 'underground', platform: 'island' },
  MCAR: { name: 'MacArthur', kind: 'surface', platform: 'island' },
  MLBR: { name: 'Millbrae', kind: 'surface', platform: 'island' },
  MLPT: { name: 'Milpitas', kind: 'surface', platform: 'island' },
  MONT: { name: 'Montgomery St.', kind: 'underground', platform: 'island' },
  NBRK: { name: 'North Berkeley', kind: 'underground', platform: 'island' },
  NCON: { name: 'North Concord/Martinez', kind: 'surface', platform: 'island' },
  OAKL: { name: 'Oakland International Airport', kind: 'elevated', platform: 'island' },
  ORIN: { name: 'Orinda', kind: 'surface', platform: 'island' },
  PCTR: { name: 'Pittsburg Center', kind: 'surface', platform: 'island' },
  PHIL: { name: 'Pleasant Hill/Contra Costa Centre', kind: 'elevated', platform: 'island' },
  PITT: { name: 'Pittsburg/Bay Point', kind: 'surface', platform: 'island' },
  PLZA: { name: 'El Cerrito Plaza', kind: 'elevated', platform: 'island' },
  POWL: { name: 'Powell St.', kind: 'underground', platform: 'island' },
  RICH: { name: 'Richmond', kind: 'surface', platform: 'island' },
  ROCK: { name: 'Rockridge', kind: 'elevated', platform: 'island' },
  SANL: { name: 'San Leandro', kind: 'elevated', platform: 'island' },
  SBRN: { name: 'San Bruno', kind: 'underground', platform: 'island' },
  SFIA: { name: 'San Francisco International Airport', kind: 'elevated', platform: 'island' },
  SHAY: { name: 'South Hayward', kind: 'surface', platform: 'island' },
  SSAN: { name: 'South San Francisco', kind: 'underground', platform: 'island' },
  UCTY: { name: 'Union City', kind: 'elevated', platform: 'island' },
  WARM: { name: 'Warm Springs/South Fremont', kind: 'surface', platform: 'island' },
  WCRK: { name: 'Walnut Creek', kind: 'surface', platform: 'island' },
  WDUB: { name: 'West Dublin/Pleasanton', kind: 'surface', platform: 'island' },
  WOAK: { name: 'West Oakland', kind: 'elevated', platform: 'island' },
};

/* ---------- Lines ---------- */
// stops are listed in the "forward" direction; fwd is the direction BART calls that way.
// headway: minutes between demo trains. Real headways vary by time of day.
const SF_TRUNK = ['WOAK', 'EMBR', 'MONT', 'POWL', 'CIVC', '16TH', '24TH', 'GLEN', 'BALB', 'DALY'];
const EAST_BAY = ['RICH', 'DELN', 'PLZA', 'NBRK', 'DBRK', 'ASHB', 'MCAR', '19TH', '12TH'];
const SOUTH = ['FTVL', 'COLS', 'SANL', 'BAYF', 'HAYW', 'SHAY', 'UCTY', 'FRMT', 'WARM', 'MLPT', 'BERY'];

export const LINES = {
  yellow: {
    name: 'Yellow', hex: '#ffe800', headway: 15, fwd: 'South',
    stops: ['ANTC', 'PCTR', 'PITT', 'NCON', 'CONC', 'PHIL', 'WCRK', 'LAFY', 'ORIN', 'ROCK', 'MCAR', '19TH', '12TH', ...SF_TRUNK, 'COLM', 'SSAN', 'SBRN', 'SFIA'],
  },
  red: {
    name: 'Red', hex: '#ff0000', headway: 15, fwd: 'South',
    stops: [...EAST_BAY, ...SF_TRUNK, 'COLM', 'SSAN', 'SBRN', 'MLBR'],
  },
  orange: {
    name: 'Orange', hex: '#ff9933', headway: 15, fwd: 'South',
    stops: [...EAST_BAY, 'LAKE', ...SOUTH],
  },
  green: {
    name: 'Green', hex: '#339933', headway: 15, fwd: 'North',
    stops: [...SOUTH].reverse().concat(['LAKE', ...SF_TRUNK]),
  },
  blue: {
    name: 'Blue', hex: '#0099cc', headway: 15, fwd: 'North',
    stops: ['DUBL', 'WDUB', 'CAST', 'BAYF', 'SANL', 'COLS', 'FTVL', 'LAKE', ...SF_TRUNK],
  },
  beige: {
    name: 'Beige', hex: '#d5cfa3', headway: 8, fwd: 'South',
    stops: ['COLS', 'OAKL'],
  },
};

// The API's own colors, used to match a live train to a line.
const API_HEX = { yellow: '#ffff33', red: '#ff0000', orange: '#ff9933', green: '#339933', blue: '#0099cc', beige: '#d5cfa3' };

export const DWELL = 25; // seconds a train stands at each station (estimate)
const otherDir = (d) => (d === 'North' ? 'South' : 'North');
export const dirLabel = (line, dir) => (dir === 0 ? LINES[line].fwd : otherDir(LINES[line].fwd));
export const stopsFor = (line, dir) => (dir === 0 ? LINES[line].stops : [...LINES[line].stops].reverse());
export const stationName = (abbr) => STATIONS[abbr]?.name || abbr;

/* ---------- Geometry ---------- */
const R = 6371000;
const toRad = (d) => (d * Math.PI) / 180;
export function meters([lon1, lat1], [lon2, lat2]) {
  const x = toRad(lon2 - lon1) * Math.cos(toRad((lat1 + lat2) / 2));
  const y = toRad(lat2 - lat1);
  return Math.hypot(x, y) * R;
}
const polyLength = (pts) => pts.reduce((sum, p, i) => (i ? sum + meters(pts[i - 1], p) : 0), 0);

// Station coordinates when the API is not available: the average of each station's entrances.
export function coordsFromEntrances(entrances) {
  const out = {};
  for (const [abbr, list] of Object.entries(entrances || {})) {
    if (!list.length) continue;
    out[abbr] = [list.reduce((s, e) => s + e.lon, 0) / list.length, list.reduce((s, e) => s + e.lat, 0) / list.length];
  }
  return out;
}

// Turns the loose track polylines into a graph and finds the track path between every pair of
// neighbouring stations. Falls back to a straight line where the track has a gap.
export function buildPaths(track, coords) {
  const nodes = []; // [lon, lat]
  const index = new Map();
  const adj = [];
  const nodeOf = (p) => {
    const k = `${p[0]},${p[1]}`;
    if (!index.has(k)) { index.set(k, nodes.length); nodes.push(p); adj.push([]); }
    return index.get(k);
  };
  const link = (a, b) => {
    if (a === b) return;
    const w = meters(nodes[a], nodes[b]);
    adj[a].push([b, w]);
    adj[b].push([a, w]);
  };
  const lineNodes = (track || []).map((line) => line.map(nodeOf));
  for (const ids of lineNodes) for (let i = 1; i < ids.length; i++) link(ids[i - 1], ids[i]);
  // Bridge small gaps: join each loose end to the nearest point on another line within 60 m.
  lineNodes.forEach((ids, li) => {
    for (const end of [ids[0], ids[ids.length - 1]]) {
      if (adj[end].length > 1) continue;
      let best = -1, bd = 60;
      lineNodes.forEach((other, lj) => {
        if (lj === li) return;
        for (const n of other) { const d = meters(nodes[end], nodes[n]); if (d < bd) { bd = d; best = n; } }
      });
      if (best >= 0) link(end, best);
    }
  });

  // The track is simplified, so long straight stretches have few points. Snap a station onto the
  // closest point of the closest segment and add that point to the graph.
  const edges = [];
  for (const ids of lineNodes) for (let i = 1; i < ids.length; i++) edges.push([ids[i - 1], ids[i]]);
  const nearest = (p) => {
    const k = Math.cos(toRad(p[1]));
    let best = null, bd = Infinity;
    for (const [a, b] of edges) {
      const A = nodes[a], B = nodes[b];
      const ax = (A[0] - p[0]) * k, ay = A[1] - p[1], bx = (B[0] - p[0]) * k, by = B[1] - p[1];
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      const u = L2 ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / L2)) : 0;
      const q = [A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u];
      const d = meters(p, q);
      if (d < bd) { bd = d; best = { a, b, q }; }
    }
    if (!best) return { id: -1, d: Infinity };
    const id = nodeOf(best.q);
    link(id, best.a);
    link(id, best.b);
    return { id, d: bd };
  };

  const dijkstra = (src, dst) => {
    const dist = new Float64Array(nodes.length).fill(Infinity);
    const prev = new Int32Array(nodes.length).fill(-1);
    const heap = [[0, src]];
    dist[src] = 0;
    const push = (item) => { heap.push(item); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    while (heap.length) {
      const [d, u] = pop();
      if (u === dst) break;
      if (d > dist[u]) continue;
      for (const [v, w] of adj[u]) if (d + w < dist[v]) { dist[v] = d + w; prev[v] = u; push([dist[v], v]); }
    }
    if (!Number.isFinite(dist[dst])) return null;
    const out = [];
    for (let u = dst; u !== -1; u = prev[u]) out.push(nodes[u]);
    return out.reverse();
  };

  const paths = {};
  const snapped = {};
  for (const line of Object.values(LINES)) {
    for (let i = 1; i < line.stops.length; i++) {
      const a = line.stops[i - 1], b = line.stops[i];
      const key = `${a}>${b}`;
      if (paths[key] || !coords[a] || !coords[b]) continue;
      const straight = meters(coords[a], coords[b]);
      let pts = null;
      if (nodes.length) {
        const na = (snapped[a] ??= nearest(coords[a]));
        const nb = (snapped[b] ??= nearest(coords[b]));
        if (na.d < 400 && nb.d < 400) pts = dijkstra(na.id, nb.id);
        // Reject detours: a path far longer than the straight line went the wrong way at a junction.
        if (pts && polyLength(pts) > straight * 1.5 + 300) pts = null;
      }
      pts = pts ? [coords[a], ...pts, coords[b]] : [coords[a], coords[b]];
      const len = polyLength(pts);
      paths[key] = { pts, len, onTrack: pts.length > 2 };
      paths[`${b}>${a}`] = { pts: [...pts].reverse(), len, onTrack: pts.length > 2 };
    }
  }
  return paths;
}

// Running time between two stations from the track length: about 35 s to speed up and brake,
// then 22 m/s (about 80 km/h). Bay Fair to San Leandro comes out near 3 minutes.
export const runSeconds = (len) => Math.round(35 + len / 22);

/* ---------- Timetable model ---------- */
// For each line and direction: when a train reaches and leaves each stop, counted from the
// moment it leaves the first stop.
export function buildTimetable(paths) {
  const tt = {};
  for (const line of Object.keys(LINES)) {
    for (const dir of [0, 1]) {
      const stops = stopsFor(line, dir);
      const arrive = [0], depart = [0], run = [0];
      for (let i = 1; i < stops.length; i++) {
        const p = paths[`${stops[i - 1]}>${stops[i]}`];
        run[i] = runSeconds(p ? p.len : 2000);
        arrive[i] = depart[i - 1] + run[i];
        depart[i] = arrive[i] + DWELL;
      }
      tt[`${line}:${dir}`] = { line, dir, stops, arrive, depart, run, total: arrive[stops.length - 1] };
    }
  }
  return tt;
}

// Fixed per-line offsets so the demo trains on shared track are spread out, not bunched.
const OFFSET = { yellow: 0, red: 450, orange: 225, green: 600, blue: 300, beige: 60 };

// Where a train is, given seconds since it left its first stop.
function placeOnTrip(trip, e) {
  const { stops, arrive, depart } = trip;
  for (let i = 0; i < stops.length; i++) {
    if (e <= depart[i]) {
      if (e >= arrive[i]) return { from: stops[i], to: stops[i], at: stops[i], progress: 0, nextIdx: i + 1 };
      return { from: stops[i - 1], to: stops[i], at: null, progress: (e - depart[i - 1]) / (arrive[i] - depart[i - 1]), nextIdx: i };
    }
  }
  return null;
}

// Demo trains at simulated time t (seconds). Deterministic: the same t always gives the same trains.
export function demoTrains(tt, t) {
  const out = [];
  for (const trip of Object.values(tt)) {
    const L = LINES[trip.line];
    const H = L.headway * 60;
    const off = OFFSET[trip.line] + trip.dir * H * 0.5;
    const kMin = Math.floor((t - trip.total - off) / H), kMax = Math.floor((t - off) / H);
    for (let k = kMin; k <= kMax; k++) {
      const e = t - (k * H + off);
      if (e < 0 || e > trip.total) continue;
      const pos = placeOnTrip(trip, e);
      if (!pos) continue;
      out.push({
        id: `${trip.line}-${trip.dir}-${k}`, line: trip.line, dir: trip.dir, hex: L.hex,
        dest: trip.stops[trip.stops.length - 1], next: pos.at ? trip.stops[pos.nextIdx] || null : pos.to,
        cars: [8, 9, 10][(k >>> 0) % 3], ...pos,
      });
    }
  }
  return out;
}

// Demo departure board for one station, in the same shape as parseDepartures() rows.
export function demoDepartures(tt, abbr, t, count = 3) {
  const rows = [];
  for (const trip of Object.values(tt)) {
    const i = trip.stops.indexOf(abbr);
    if (i < 0 || i === trip.stops.length - 1) continue; // trains end here: nothing departs
    const L = LINES[trip.line];
    const H = L.headway * 60;
    const off = OFFSET[trip.line] + trip.dir * H * 0.5;
    const leaveAt = trip.depart[i];
    let k = Math.ceil((t - off - leaveAt) / H);
    for (let n = 0; n < count; n++, k++) {
      const sec = k * H + off + leaveAt - t;
      const minutes = Math.max(0, Math.floor(sec / 60));
      const direction = dirLabel(trip.line, trip.dir);
      rows.push({
        destination: stationName(trip.stops[trip.stops.length - 1]),
        destAbbr: trip.stops[trip.stops.length - 1],
        minutes, timeLabel: minutes === 0 ? 'Leaving' : `${minutes} min`,
        platform: direction === 'South' ? '1' : '2', direction,
        cars: String([8, 9, 10][(k >>> 0) % 3]), color: L.name.toUpperCase(), hex: L.hex,
        delaySec: 0, cancelled: false, line: trip.line,
      });
    }
  }
  return rows.sort((a, b) => a.minutes - b.minutes);
}

/* ---------- Live data ---------- */
// Which line and direction a live departure belongs to. Prefers a line that contains both this
// station and the destination; the API color and direction settle ties (Red and Yellow share track).
export function resolveTrip(abbr, destAbbr, hex = '', direction = '') {
  const h = hex.toLowerCase();
  let best = null, bestScore = -1;
  for (const [line, L] of Object.entries(LINES)) {
    const i = L.stops.indexOf(abbr);
    if (i < 0) continue;
    const j = L.stops.indexOf(destAbbr);
    const colorOk = h && (API_HEX[line] === h || L.hex.toLowerCase() === h);
    let dir, score;
    if (j >= 0 && j !== i) { dir = j > i ? 0 : 1; score = 4 + (colorOk ? 2 : 0); }
    else if (colorOk && direction) { dir = L.fwd === direction ? 0 : 1; score = 2; }
    else continue;
    if (direction && dirLabel(line, dir) === direction) score += 1;
    if (score > bestScore) { bestScore = score; best = { line, dir }; }
  }
  return best;
}

// The stop after `abbr` for a train heading to destAbbr, or null at the end of the line.
export function nextStop(abbr, destAbbr, hex, direction) {
  const trip = resolveTrip(abbr, destAbbr, hex, direction);
  if (!trip) return null;
  const stops = stopsFor(trip.line, trip.dir);
  const i = stops.indexOf(abbr);
  const n = stops[i + 1];
  return n ? { abbr: n, name: stationName(n), line: trip.line, dir: trip.dir } : null;
}

// Estimates where every train is from all stations' departure estimates (etd orig=ALL).
// For each line and direction, a train due at station S in less than the running time from the
// previous station must be on that stretch of track; "Leaving" (0 min) means standing at S.
// byStation: { ABBR: rows from parseDepartures (with destAbbr) }. elapsedSec: time since the data came.
export function liveTrains(tt, byStation, elapsedSec = 0) {
  const soonest = new Map();
  for (const [abbr, rows] of Object.entries(byStation || {})) {
    for (const r of rows) {
      if (r.cancelled || r.minutes == null) continue;
      const trip = resolveTrip(abbr, r.destAbbr, r.hex, r.direction);
      if (!trip) continue;
      const key = `${trip.line}:${trip.dir}:${abbr}`;
      const cur = soonest.get(key);
      if (!cur || r.minutes < cur.r.minutes) soonest.set(key, { trip, abbr, r });
    }
  }
  const out = [];
  for (const { trip, abbr, r } of soonest.values()) {
    const T = tt[`${trip.line}:${trip.dir}`];
    const i = T.stops.indexOf(abbr);
    const base = { line: trip.line, dir: trip.dir, hex: LINES[trip.line].hex, dest: r.destAbbr, cars: Number(r.cars) || null, delaySec: r.delaySec || 0 };
    const remain = r.minutes * 60 - elapsedSec;
    if (r.minutes === 0 || remain <= 0) {
      out.push({ ...base, id: `${key4(trip)}@${abbr}`, from: abbr, to: abbr, at: abbr, progress: 0, next: T.stops[i + 1] || null });
    } else if (i > 0 && remain < T.run[i]) {
      out.push({ ...base, id: `${key4(trip)}>${abbr}`, from: T.stops[i - 1], to: abbr, at: null, progress: 1 - remain / T.run[i], next: abbr });
    }
  }
  return out;
}
const key4 = (trip) => `${trip.line}-${trip.dir}`;
