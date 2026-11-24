import { parseStations, parseAllDepartures, parseMessage } from './parse.js';
import { createBayFairScene } from './bayfair.js';
import { createStationScene, stationFamily } from './station3d.js';
import {
  STATIONS, LINES, coordsFromEntrances, buildPaths, buildTimetable, demoTrains, demoDepartures,
  liveTrains, nextStop, stationName,
} from './network.js';

const $ = (id) => document.getElementById(id);
const SVG_NS = 'http://www.w3.org/2000/svg';
const POLL_MS = 30_000; // live data for every station, one request (the server caches it for 15 s)
const DEFAULT_STATION = 'BAYF';
const DEBUG = new URLSearchParams(location.search).has('debug');

const state = {
  stations: [], byAbbr: new Map(), geo: null, paths: {}, tt: {}, toXY: null,
  hasKey: false, mode: 'demo', // 'live' or 'demo' (what the user picked)
  live: { byStation: null, at: 0, error: '' },
  sim: { base: Date.now() / 1000, perf: performance.now(), speed: 1 },
  selected: null, scene: null, sceneAbbr: null, trains: new Map(), pickedTrain: null,
};

async function getJSON(url) {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}
function setStatus(id, text, isError = false) {
  const node = $(id);
  node.textContent = text;
  node.classList.toggle('error', isError);
}
function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

/* ---------- Simulation clock and data source ---------- */

// Live mode runs on real time. Demo mode runs on a clock you can speed up.
const simNow = () => (usingLive() ? Date.now() / 1000 : state.sim.base + ((performance.now() - state.sim.perf) / 1000) * state.sim.speed);
const usingLive = () => state.mode === 'live' && !!state.live.byStation;
function setSpeed(v) {
  state.sim.base = simNow();
  state.sim.perf = performance.now();
  state.sim.speed = v;
}

function currentTrains() {
  if (usingLive()) return liveTrains(state.tt, state.live.byStation, (Date.now() - state.live.at) / 1000);
  return demoTrains(state.tt, simNow());
}

// Departures for one station from whichever source is active, as parseDepartures()-style rows.
function departuresFor(abbr) {
  if (usingLive()) return state.live.byStation[abbr] || [];
  return demoDepartures(state.tt, abbr, simNow());
}

function sourceNote() {
  if (usingLive()) return `Live BART estimates, updated ${new Date(state.live.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  if (state.mode === 'live' && state.live.error) return `Live data unavailable (${state.live.error}). Showing the demo timetable.`;
  if (!state.hasKey) return 'Demo timetable (no API key set, so no live data)';
  return 'Demo timetable (simulated, not real times)';
}

async function pollLive() {
  if (!state.hasKey) return;
  try {
    const data = await getJSON('/api/etd?orig=ALL');
    const byStation = parseAllDepartures(data);
    if (!Object.keys(byStation).length) throw new Error(parseMessage(data) || 'no stations in the response');
    state.live = { byStation, at: Date.now(), error: '' };
  } catch (err) {
    state.live = { byStation: null, at: 0, error: err.message };
  }
  renderModeBar();
  refreshDepartures();
  feedScene();
}

/* ---------- 2D map ---------- */

const LINE_SLOT = { yellow: -2, red: -1, orange: 0, green: 1, blue: 2, beige: 0 };
let SLOT_PX = 1.7;
const PAD_PX = 60;

// The network is drawn as one SVG on top of a Leaflet street map. The SVG sits in Leaflet's
// layer-pixel space at the current zoom, so every station lands on its real spot.
// It is redrawn after each zoom (and hidden while the zoom animates).
const leaf = { map: null, svg: null, zoom: 10 };

function initLeaflet() {
  if (!window.L) return false;
  const map = L.map('map', { zoomSnap: 0.25, zoomDelta: 0.5, minZoom: 9, maxZoom: 17 });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  map.createPane('network').style.zIndex = 450;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'network-svg');
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', 'Network map: rings are stations, colored dots are trains');
  map.getPane('network').append(svg);
  map.on('zoomstart', () => { svg.style.visibility = 'hidden'; });
  map.on('zoomend', () => { redrawNetwork(); svg.style.visibility = ''; });
  leaf.map = map;
  leaf.svg = svg;
  return true;
}

function makeProjector(lonLats) {
  const map = leaf.map;
  const pts = lonLats.map(([lon, lat]) => map.latLngToLayerPoint([lat, lon]));
  const minX = Math.min(...pts.map((p) => p.x)) - PAD_PX, minY = Math.min(...pts.map((p) => p.y)) - PAD_PX;
  const w = Math.ceil(Math.max(...pts.map((p) => p.x)) + PAD_PX - minX);
  const h = Math.ceil(Math.max(...pts.map((p) => p.y)) + PAD_PX - minY);
  const svg = leaf.svg;
  svg.setAttribute('width', w);
  svg.setAttribute('height', h);
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  L.DomUtil.setPosition(svg, L.point(minX, minY));
  return (lon, lat) => { const p = map.latLngToLayerPoint([lat, lon]); return { x: p.x - minX, y: p.y - minY }; };
}

// Marks grow a little as you zoom in, so stations stay easy to hit.
const zoomGrow = () => Math.max(1, 1 + (leaf.zoom - 10) * 0.18);

// Shift a screen polyline sideways by d pixels, so lines sharing a track sit side by side.
function offsetPolyline(pts, d) {
  if (!d) return pts;
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    return { x: p.x - (dy / len) * d, y: p.y + (dx / len) * d };
  });
}

// Screen polyline for one line between two neighbouring stations, offset by the line's slot.
// The offset is computed in one fixed orientation per stretch so every line agrees on "left".
const segCache = new Map();
function lineSegment(line, a, b) {
  const key = `${line}:${a}>${b}`;
  if (segCache.has(key)) return segCache.get(key);
  const [p, q] = a < b ? [a, b] : [b, a];
  const path = state.paths[`${p}>${q}`];
  let pts = path ? path.pts.map(([lon, lat]) => state.toXY(lon, lat)) : [];
  pts = offsetPolyline(pts, LINE_SLOT[line] * SLOT_PX);
  if (a !== p) pts = [...pts].reverse();
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const seg = { pts, cum, total: cum[cum.length - 1] || 0 };
  segCache.set(key, seg);
  return seg;
}
function pointAlong(seg, u) {
  if (!seg.pts.length) return null;
  const target = Math.min(1, Math.max(0, u)) * seg.total;
  let i = 1;
  while (i < seg.cum.length - 1 && seg.cum[i] < target) i++;
  const span = seg.cum[i] - seg.cum[i - 1] || 1;
  const t = (target - seg.cum[i - 1]) / span;
  const A = seg.pts[i - 1], B = seg.pts[i] || A;
  return { x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t };
}

function drawMap() {
  const svg = leaf.svg;
  svg.replaceChildren();
  segCache.clear();
  leaf.zoom = leaf.map.getZoom();
  SLOT_PX = 1.7 * zoomGrow();
  svg.style.setProperty('--grow', zoomGrow());
  const trackPoints = state.geo ? state.geo.track.flat() : [];
  state.toXY = makeProjector([...state.stations.map((s) => [s.lon, s.lat]), ...trackPoints]);

  if (state.geo) {
    const lines = svgEl('g', { class: 'track', 'aria-hidden': 'true' });
    for (const line of state.geo.track) {
      lines.append(svgEl('path', { d: line.map(([lon, lat], i) => { const { x, y } = state.toXY(lon, lat); return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`; }).join('') }));
    }
    svg.append(lines);
  }

  // Colored service lines along the real track, side by side where they share it.
  // A dark casing underneath keeps the pale lines (Yellow, Beige) readable on the street map.
  const casing = svgEl('g', { class: 'route-casing', 'aria-hidden': 'true' });
  const routes = svgEl('g', { class: 'routes', 'aria-hidden': 'true' });
  for (const [id, line] of Object.entries(LINES)) {
    let d = '';
    for (let i = 1; i < line.stops.length; i++) {
      const seg = lineSegment(id, line.stops[i - 1], line.stops[i]);
      d += seg.pts.map((p, j) => `${j ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('');
    }
    casing.append(svgEl('path', { d }));
    routes.append(svgEl('path', { d, stroke: line.hex, class: `route route-${id}` }));
  }
  svg.append(casing, routes);

  state.stations.forEach((s) => {
    const { x, y } = state.toXY(s.lon, s.lat);
    s.x = x; s.y = y;
    const g = svgEl('g', { class: 'station', tabindex: '0', role: 'button', 'aria-label': s.name, 'data-abbr': s.abbr });
    g.append(svgEl('circle', { cx: x, cy: y, r: 3.6 * zoomGrow() }));
    if (leaf.zoom >= 12) {
      const name = svgEl('text', { x: x + 8 * zoomGrow(), y: y + 4, class: 'station-name' });
      name.textContent = s.name;
      g.append(name);
    }
    const title = svgEl('title');
    title.textContent = s.name;
    g.append(title);
    g.addEventListener('click', () => selectStation(s.abbr));
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectStation(s.abbr); } });
    svg.append(g);
  });

  svg.append(svgEl('g', { id: 'entranceMarks', 'aria-hidden': 'true' }));
  svg.append(svgEl('g', { id: 'trains' }));
  svg.append(svgEl('text', { id: 'mapLabel', class: 'map-label' }));
}

function redrawNetwork() {
  if (!state.stations.length) return;
  drawMap();
  if (state.selected) { highlightStation(state.selected); showEntrances(state.selected); }
  renderTrains();
}

/* ---------- Moving trains ---------- */

function trainXY(t) {
  if (t.at) {
    const s = state.byAbbr.get(t.at);
    if (!s) return null;
    // nudge sideways by line, like the lines themselves
    const next = t.next || t.at;
    const seg = next !== t.at ? lineSegment(t.line, t.at, next) : null;
    return (seg && seg.pts[0]) || { x: s.x, y: s.y };
  }
  return pointAlong(lineSegment(t.line, t.from, t.to), t.progress);
}

function describeTrain(t) {
  const L = LINES[t.line];
  const where = t.at ? `at ${stationName(t.at)}` : `next stop ${stationName(t.to)}`;
  const bits = [`${L.name} line train to ${stationName(t.dest)}`, where];
  if (t.cars) bits.push(`${t.cars} cars`);
  if (t.delaySec >= 60) bits.push(`${Math.round(t.delaySec / 60)} min late`);
  return bits.join(' · ');
}

function renderTrains() {
  const layer = $('trains');
  if (!layer || !state.toXY) return;
  const list = currentTrains();
  const seen = new Set();
  for (const t of list) {
    const p = trainXY(t);
    if (!p) continue;
    seen.add(t.id);
    let node = layer.querySelector(`[data-id="${CSS.escape(t.id)}"]`);
    if (!node) {
      node = svgEl('circle', { r: 4.6 * zoomGrow(), class: 'train', 'data-id': t.id, tabindex: '-1' });
      node.append(svgEl('title'));
      layer.append(node);
    }
    node.setAttribute('cx', p.x.toFixed(1));
    node.setAttribute('cy', p.y.toFixed(1));
    node.setAttribute('fill', t.hex);
    node.classList.toggle('picked', state.pickedTrain === t.id);
    node.firstChild.textContent = describeTrain(t);
    state.trains.set(t.id, t);
  }
  for (const node of [...layer.children]) {
    if (!seen.has(node.dataset.id)) { state.trains.delete(node.dataset.id); node.remove(); }
  }
  $('trainCount').textContent = `${list.length} trains`;
  if (state.pickedTrain) {
    const t = state.trains.get(state.pickedTrain);
    $('trainInfo').textContent = t ? describeTrain(t) : 'That train has left the map.';
  }
}

/* ---------- Mode bar ---------- */

function renderModeBar() {
  for (const b of document.querySelectorAll('[data-mode]')) {
    const on = b.dataset.mode === state.mode;
    b.setAttribute('aria-pressed', String(on));
    if (b.dataset.mode === 'live') b.disabled = !state.hasKey;
  }
  $('speed').disabled = usingLive();
  $('speedLabel').classList.toggle('dim', usingLive());
  $('simSource').textContent = sourceNote();
  $('simSource').classList.toggle('error', state.mode === 'live' && !!state.live.error);
}
function renderClock() {
  const d = new Date(simNow() * 1000);
  $('simClock').textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: usingLive() || state.sim.speed === 1 ? '2-digit' : undefined });
}

/* ---------- Station panel ---------- */

// Entrance dots are pushed out from the station when zoomed out, so they're visible.
// From zoom 15 on they sit on their true spots.
const exaggeration = () => Math.min(25, Math.max(1, 2 ** (15 - leaf.zoom)));

function showEntrances(s) {
  const list = (state.geo && state.geo.entrances[s.abbr]) || [];
  const ul = $('entrances');
  ul.replaceChildren(...list.map((e) => { const li = document.createElement('li'); li.textContent = e.name; return li; }));
  $('entrancesHeading').hidden = list.length === 0;
  const marks = $('entranceMarks');
  marks.replaceChildren();
  const k = exaggeration();
  for (const e of list) {
    const p = state.toXY(e.lon, e.lat);
    const dot = svgEl('circle', { cx: s.x + (p.x - s.x) * k, cy: s.y + (p.y - s.y) * k, r: 3 * zoomGrow() });
    const title = svgEl('title');
    title.textContent = e.name;
    dot.append(title);
    marks.append(dot);
  }
}

function highlightStation(s) {
  document.querySelectorAll('.station').forEach((g) => g.classList.toggle('selected', g.dataset.abbr === s.abbr));
  const label = $('mapLabel');
  if (!label) return;
  const nearRightEdge = s.x > Number(leaf.svg.getAttribute('width')) * 0.6;
  label.textContent = s.name;
  label.setAttribute('x', nearRightEdge ? s.x - 12 : s.x + 12);
  label.setAttribute('y', s.y + 5);
  label.setAttribute('text-anchor', nearRightEdge ? 'end' : 'start');
}

const KIND_LABEL = { underground: 'Underground', elevated: 'Elevated', surface: 'Ground level' };

function selectStation(abbr) {
  const s = state.byAbbr.get(abbr);
  if (!s) return;
  state.selected = s;
  $('stationInput').value = s.name;
  $('stationName').textContent = s.name;
  const info = STATIONS[abbr];
  const lines = Object.values(LINES).filter((L) => L.stops.includes(abbr));
  const meta = $('stationMeta');
  meta.replaceChildren();
  const addr = [s.address, s.city].filter(Boolean).join(', ');
  if (addr) meta.append(addr, document.createElement('br'));
  if (info) meta.append(`${KIND_LABEL[info.kind]} station, ${info.platform} platform${info.platform === 'side' ? 's' : ''} (approximate) · `);
  for (const L of lines) {
    const chip = document.createElement('span');
    chip.className = 'line-chip';
    chip.style.background = L.hex;
    chip.title = `${L.name} line`;
    meta.append(chip);
  }
  highlightStation(s);
  showEntrances(s);
  if (leaf.map && !leaf.map.getBounds().pad(-0.1).contains([s.lat, s.lon])) leaf.map.panTo([s.lat, s.lon]);
  const walk = $('walkBtn');
  walk.hidden = false;
  walk.disabled = state.sceneAbbr === abbr;
  walk.textContent = state.sceneAbbr === abbr ? `You're in ${s.name} (below)` : `Walk through ${s.name} in 3D`;
  refreshDepartures();
}

function refreshDepartures() {
  const s = state.selected;
  if (!s) return;
  const rows = departuresFor(s.abbr);
  renderDepartures(rows);
  setStatus('departuresStatus', rows.length ? sourceNote() : `No departures listed right now. ${sourceNote()}`, state.mode === 'live' && !!state.live.error);
}

function renderDepartures(rows) {
  const ul = $('departures');
  ul.replaceChildren();
  const elapsed = usingLive() ? (Date.now() - state.live.at) / 1000 : 0;
  for (const r of rows.slice(0, 10)) {
    const li = document.createElement('li');
    if (r.cancelled) li.classList.add('cancelled');
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.style.background = r.hex;
    chip.title = r.color || '';
    const dest = document.createElement('span');
    dest.className = 'dest';
    dest.textContent = r.destination;
    const time = document.createElement('span');
    time.className = 'time';
    const left = r.minutes == null ? null : Math.max(0, Math.round(r.minutes - elapsed / 60));
    time.textContent = r.cancelled ? 'Cancelled' : left == null ? '—' : left === 0 ? 'Leaving' : `${left} min`;
    const bits = [];
    if (r.color) bits.push(`${capitalize(r.color)} line`);
    if (r.platform) bits.push(`Platform ${r.platform}`);
    if (r.cars) bits.push(`${r.cars} cars`);
    if (r.delaySec >= 60) bits.push(`${Math.round(r.delaySec / 60)} min late`);
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = bits.join(' · ');
    li.append(chip, dest, time, meta);
    ul.append(li);
  }
}
const capitalize = (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();

/* ---------- 3D station ---------- */

const SCENE_HINT = 'Drag to look around, WASD to walk, E to use things.';

function loadScene(abbr, { spawn, balance } = {}) {
  const host = $('scene');
  if (state.scene) state.scene.dispose();
  host.replaceChildren();
  const info = STATIONS[abbr];
  const common = {
    preserveDrawingBuffer: DEBUG,
    spawn,
    balance,
    nextStop: ({ from, destAbbr, hex, direction }) => nextStop(from, destAbbr, hex, direction),
    onExit: (next, carry) => {
      loadScene(next, { spawn: 'platform', balance: carry.balance });
      selectStation(next);
      host.focus({ preventScroll: true });
    },
  };
  state.scene = abbr === 'BAYF'
    ? createBayFairScene(host, common)
    : createStationScene(host, {
      ...common,
      station: { abbr, ...info },
      lines: Object.values(LINES).filter((L) => L.stops.includes(abbr)).map((L) => L.hex),
    });
  state.sceneAbbr = abbr;
  $('sceneHeading').textContent = abbr === 'BAYF'
    ? 'Bay Fair walkthrough (detailed model from photos)'
    : `${info.name} walkthrough (${stationFamily(abbr, info.kind).label}; ${KIND_LABEL[info.kind].toLowerCase()}, ${info.platform} platform${info.platform === 'side' ? 's' : ''})`;
  $('sceneCaption').textContent = SCENE_HINT;
  if (DEBUG) { window.scene3d = state.scene; window.bayfair = state.scene; }
  if (state.selected) selectStation(state.selected.abbr);
  feedScene();
}

// The 3D station's boards and trains follow the same departures as the panel.
function feedScene() {
  if (!state.scene || !state.sceneAbbr) return;
  const rows = departuresFor(state.sceneAbbr).filter((r) => !r.cancelled && r.minutes != null);
  if (!rows.length) {
    state.scene.setLive(null, `Demo timing (no departures listed for ${stationName(state.sceneAbbr)} right now)`);
    return;
  }
  // Live rows are as old as the last poll; age them so the 3D trains keep to the clock.
  const elapsedMin = usingLive() ? (Date.now() - state.live.at) / 60000 : 0;
  const aged = rows.map((r) => ({ ...r, minutes: Math.max(0, Math.round(r.minutes - elapsedMin)) }));
  state.scene.setLive(aged, sourceNote());
  const next = aged[0];
  $('sceneCaption').textContent = `Next train at ${stationName(state.sceneAbbr)}: ${next.destination}${next.platform ? `, platform ${next.platform}` : ''}, ${next.minutes === 0 ? 'leaving' : `in ${next.minutes} min`}. ${SCENE_HINT}`;
}

/* ---------- Start ---------- */

async function boot() {
  // Track lines and entrances first: they also give every station a position when the API is off.
  try { state.geo = await getJSON('/geo.json'); } catch { state.geo = null; }

  try {
    const data = await getJSON('/api/stations');
    state.stations = parseStations(data);
    if (!state.stations.length) throw new Error(parseMessage(data) || 'No stations came back.');
    state.hasKey = true;
  } catch (err) {
    // No key or no connection: run the whole simulation from the built-in station list.
    const coords = coordsFromEntrances(state.geo && state.geo.entrances);
    state.stations = Object.entries(STATIONS)
      .filter(([abbr]) => coords[abbr])
      .map(([abbr, s]) => ({ abbr, name: s.name, lon: coords[abbr][0], lat: coords[abbr][1] }))
      .sort((a, b) => a.name.localeCompare(b.name));
    state.apiError = err.message;
  }
  if (!state.stations.length) {
    setStatus('mapStatus', 'No station data: the BART API is unavailable and geo.json is missing.', true);
    return;
  }
  state.byAbbr = new Map(state.stations.map((s) => [s.abbr, s]));
  state.mode = state.hasKey ? 'live' : 'demo';

  const coords = Object.fromEntries(state.stations.map((s) => [s.abbr, [s.lon, s.lat]]));
  state.paths = buildPaths(state.geo ? state.geo.track : [], coords);
  state.tt = buildTimetable(state.paths);

  if (!initLeaflet()) {
    setStatus('mapStatus', 'The street map library did not load (it needs an internet connection).', true);
    return;
  }
  const allPts = [
    ...state.stations.map((s) => [s.lat, s.lon]),
    ...(state.geo ? state.geo.track.flat().map(([lon, lat]) => [lat, lon]) : []),
  ];
  leaf.map.fitBounds(allPts, { padding: [12, 12] });
  drawMap();
  const list = $('stationList');
  list.replaceChildren(...state.stations.map((s) => { const o = document.createElement('option'); o.value = s.name; return o; }));
  setStatus('mapStatus', state.hasKey
    ? `${state.stations.length} stations. Click a station for departures, or a train to see where it's going.`
    : `${state.stations.length} stations from the built-in list, running the demo timetable (live data needs the API key: ${state.apiError})`);
  if (!state.geo) setStatus('mapStatus', 'Track lines not loaded (geo.json missing), so trains run in straight lines.', true);

  $('stationInput').addEventListener('change', (e) => {
    const q = e.target.value.trim().toLowerCase();
    const match = state.stations.find((s) => s.name.toLowerCase() === q || s.abbr.toLowerCase() === q);
    if (match) selectStation(match.abbr);
  });
  leaf.svg.addEventListener('click', (e) => {
    const id = e.target.closest('#trains [data-id]')?.dataset.id;
    if (!id) return;
    state.pickedTrain = id;
    $('trainInfo').textContent = describeTrain(state.trains.get(id));
  });
  for (const b of document.querySelectorAll('[data-mode]')) {
    b.addEventListener('click', () => {
      if (b.dataset.mode === state.mode) return;
      if (b.dataset.mode === 'demo') { state.sim = { base: Date.now() / 1000, perf: performance.now(), speed: Number($('speed').value) }; }
      state.mode = b.dataset.mode;
      segCache.clear();
      renderModeBar();
      refreshDepartures();
      feedScene();
    });
  }
  $('speed').addEventListener('change', (e) => { setSpeed(Number(e.target.value)); refreshDepartures(); feedScene(); });
  $('walkBtn').addEventListener('click', () => {
    if (!state.selected) return;
    loadScene(state.selected.abbr);
    $('scene').scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('scene').focus({ preventScroll: true });
  });

  renderModeBar();
  // Debug only: ?debug&station=MONT&spot=platform-train opens a station at a spot (for screenshots).
  const params = new URLSearchParams(location.search);
  const startAbbr = DEBUG && state.byAbbr.has(params.get('station')) ? params.get('station') : DEFAULT_STATION;
  loadScene(startAbbr);
  selectStation(startAbbr);
  if (DEBUG && params.get('spot') && state.scene) state.scene.teleport(params.get('spot'));
  if (DEBUG && params.has('yaw') && state.scene._look) state.scene._look(Number(params.get('yaw')), Number(params.get('pitch') || -0.05));
  if (DEBUG && params.has('park') && state.scene._park) state.scene._park(params.get('park') || 'South');
  if (state.hasKey) { await pollLive(); setInterval(pollLive, POLL_MS); }

  // Animation: trains move every frame-ish; panels refresh less often.
  let lastTrains = 0, lastClock = 0, lastPanel = 0, lastFeed = 0;
  const tick = (ms) => {
    if (ms - lastTrains > 100) { lastTrains = ms; renderTrains(); }
    if (ms - lastClock > 500) { lastClock = ms; renderClock(); }
    const fast = !usingLive() && state.sim.speed > 1;
    if (ms - lastPanel > (fast ? 1000 : 15000)) { lastPanel = ms; refreshDepartures(); }
    if (ms - lastFeed > (fast ? 3000 : 15000)) { lastFeed = ms; feedScene(); }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  if (DEBUG) window.sim = { state, currentTrains, loadScene, selectStation, setSpeed };
}

boot();
