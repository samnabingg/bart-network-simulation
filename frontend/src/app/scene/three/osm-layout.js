// Turns a station layout imported from OpenStreetMap (GET /api/stations/{abbr}/layout, see the
// backend's StationLayoutBuilder) into the cross-section the 3D station is built from: where the
// tracks and platforms are, where the escalators, boards and columns go, how long the platforms are
// and how wide the station box must be. Pure (no Three.js), so it is unit tested on its own.
//
// Scene axes: x across the tracks, z along them (the layout file uses the same frame). Stations
// without a usable layout get the generic island or side cross-section they always had.
//
// Map data © OpenStreetMap contributors, ODbL.

/** Platform length and half width of the generic model (m). */
export const GENERIC_LENGTH = 73;
export const MIN_HALF_WIDTH = 9.8;
const MIN_LENGTH = 40;
const MAX_LENGTH = 260;
/** A side platform mapped only by its edge line gets this width (m). */
const EDGE_PLATFORM_W = 4.8;
/** Track centre to platform edge is about 1.6 to 2.4 m on BART. */
const TRACK_TO_EDGE = 2.1;

export function genericLayout(platform) {
  const base = { length: GENERIC_LENGTH, halfWidth: MIN_HALF_WIDTH, source: 'generic' };
  if (platform === 'side') {
    return {
      ...base,
      kind: 'side',
      tracks: [{ x: 2.1, dir: 'South' }, { x: -2.1, dir: 'North' }],
      platforms: [{ x0: 3.8, x1: 8.6 }, { x0: -8.6, x1: -3.8 }],
      ramps: [{ x0: 5.0, x1: 6.2, esc: true, label: 'Southbound · Escalator' }, { x0: -7.4, x1: -5.0, esc: false, label: 'Northbound · Stairs' }],
      boardX: [6.2, -6.2],
      columnX: [7.9, -7.9],
    };
  }
  return {
    ...base,
    kind: 'island',
    tracks: [{ x: 6, dir: 'South' }, { x: -6, dir: 'North' }],
    platforms: [{ x0: -4, x1: 4 }],
    ramps: [{ x0: -3.6, x1: -2.4, esc: true, label: 'Platform · Escalator' }, { x0: 1.4, x1: 3.6, esc: false, label: 'Platform · Stairs' }],
    boardX: [2.8, -2.8],
    columnX: [2, -2],
  };
}

/**
 * The scene layout for a station: from its OSM layout when that has platforms, otherwise generic.
 * @param osm      the layout file (or null)
 * @param platform the reference data's island/side, used only for the generic fallback
 */
export function layoutFromOsm(osm, platform) {
  if (!osm || !Array.isArray(osm.platforms) || !osm.platforms.length) return genericLayout(platform);

  const raw = onOneLevel(osm.platforms);
  const osmTrackX = (osm.tracks || []).map((t) => t.x);
  let platforms = raw.some((p) => p.shape === 'area') ? fromAreas(raw.filter((p) => p.shape === 'area')) : fromLines(raw, osmTrackX);
  platforms = mergeOverlapping(platforms.filter((p) => p.x1 - p.x0 >= 1.5));
  if (!platforms.length) return genericLayout(platform);

  const xLo = platforms[0].x0, xHi = platforms[platforms.length - 1].x1;
  let trackX = osmTrackX.filter((x) => x > xLo - 6 && x < xHi + 6);
  if (!trackX.length) trackX = guessTracks(platforms);
  // a track can't run through a platform, and every platform needs a track beside it
  trackX = trackX.filter((x) => !platforms.some((p) => x > p.x0 + 0.5 && x < p.x1 - 0.5));
  const centre = (xLo + xHi) / 2;
  const free = (x) => !platforms.some((p) => x > p.x0 - 0.5 && x < p.x1 + 0.5);
  const addTrack = (x) => { if (free(x)) trackX.push(x); };
  for (const p of platforms) {
    const left = trackX.some((x) => x <= p.x0 + 0.5 && p.x0 - x < TRACK_TO_EDGE + 1.5);
    const right = trackX.some((x) => x >= p.x1 - 0.5 && x - p.x1 < TRACK_TO_EDGE + 1.5);
    if (p.island) {
      if (!left) addTrack(p.x0 - TRACK_TO_EDGE);
      if (!right) addTrack(p.x1 + TRACK_TO_EDGE);
    } else if (!left && !right) {
      addTrack((p.x0 + p.x1) / 2 >= centre ? p.x1 + TRACK_TO_EDGE : p.x0 - TRACK_TO_EDGE);
    }
  }
  trackX = dedupe(trackX.sort((a, b) => a - b), 1.2);

  // Right-hand running is not modeled; like the generic model, the higher-x half of the tracks runs South.
  const mid = (trackX[0] + trackX[trackX.length - 1]) / 2;
  const tracks = trackX.map((x) => ({ x, dir: x > mid || trackX.length === 1 ? 'South' : 'North' }));

  const sides = (p) => ({
    left: tracks.some((t) => t.x < p.x0 + 0.5 && p.x0 - t.x < TRACK_TO_EDGE + 1.5),
    right: tracks.some((t) => t.x > p.x1 - 0.5 && t.x - p.x1 < TRACK_TO_EDGE + 1.5),
  });
  const both = platforms.every((p) => { const s = sides(p); return s.left && s.right; });
  const one = platforms.every((p) => { const s = sides(p); return s.left !== s.right; });
  const kind = both ? 'island' : one ? 'side' : 'mixed';

  const ramps = [];
  platforms.forEach((p, i) => {
    const w = p.x1 - p.x0;
    const label = rampLabel(p, sides(p), tracks);
    if (w >= 6) {
      ramps.push({ x0: p.x0 + 0.4, x1: p.x0 + 1.6, esc: true, label: `${label} · Escalator` });
      ramps.push({ x0: p.x1 - 2.6, x1: p.x1 - 0.4, esc: false, label: `${label} · Stairs` });
    } else {
      // narrow platform: one ramp in the middle, escalators and stairs alternating between platforms
      const esc = i % 2 === 0;
      const half = esc ? 0.6 : Math.min(1.2, w / 2 - 0.3);
      const c = (p.x0 + p.x1) / 2;
      ramps.push({ x0: c - half, x1: c + half, esc, label: `${label} · ${esc ? 'Escalator' : 'Stairs'}` });
    }
  });

  const boardX = tracks.map((t) => {
    const p = nearestPlatform(platforms, t.x);
    if (!p) return t.x - Math.sign(t.x || 1) * 3;
    if (p.x1 - p.x0 < 6) return (p.x0 + p.x1) / 2;
    return t.x > p.x1 ? p.x1 - 1.2 : p.x0 + 1.2;
  });
  const columnX = platforms.flatMap((p) => {
    const w = p.x1 - p.x0, c = (p.x0 + p.x1) / 2, s = sides(p);
    if (w >= 6) return [c - w / 4, c + w / 4];
    if (s.left && !s.right) return [p.x1 - 0.7];
    if (s.right && !s.left) return [p.x0 + 0.7];
    return [c];
  });

  const length = clamp(Math.max(...platforms.map((p) => p.zMax - p.zMin)), MIN_LENGTH, MAX_LENGTH);
  const reach = Math.max(...trackX.map((x) => Math.abs(x) + 3.8), ...platforms.map((p) => Math.max(Math.abs(p.x0), Math.abs(p.x1)) + 1.2));
  const halfWidth = Math.max(MIN_HALF_WIDTH, round(reach));

  return {
    source: 'osm', kind, length: round(length), halfWidth,
    tracks: tracks.map((t) => ({ x: round(t.x), dir: t.dir })),
    platforms: platforms.map((p) => ({ x0: round(p.x0), x1: round(p.x1), ref: p.ref || null })),
    ramps: ramps.map((r) => ({ ...r, x0: round(r.x0), x1: round(r.x1) })),
    boardX: boardX.map(round),
    columnX: columnX.map(round),
  };
}

/* ---------- helpers ---------- */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const round = (v) => Math.round(v * 10) / 10;

function dedupe(sorted, tol) {
  const out = [];
  for (const x of sorted) if (!out.length || x - out[out.length - 1] > tol) out.push(x);
  return out;
}

/** Stations with platforms on two levels (12th St, 19th St): keep the level with the most platforms. */
function onOneLevel(platforms) {
  const byLevel = new Map();
  for (const p of platforms) {
    const k = p.level == null ? '' : String(p.level);
    byLevel.set(k, [...(byLevel.get(k) || []), p]);
  }
  if (byLevel.size <= 1) return platforms;
  return [...byLevel.entries()].sort((a, b) => b[1].length - a[1].length || Number(a[0]) - Number(b[0]))[0][1];
}

/**
 * Areas that overlap or touch across the tracks are one platform: an island mapped as two halves
 * (one per ref), or a platform split into pieces along its length.
 */
function fromAreas(areas) {
  const items = areas.map((p) => ({
    x0: p.centerX - p.widthM / 2, x1: p.centerX + p.widthM / 2, zMin: p.zMin, zMax: p.zMax, refs: refsOf(p.ref),
  })).sort((a, b) => a.x0 - b.x0);
  const out = [];
  for (const it of items) {
    const last = out[out.length - 1];
    if (last && it.x0 <= last.x1 + 1.0) {
      last.x1 = Math.max(last.x1, it.x1);
      last.zMin = Math.min(last.zMin, it.zMin);
      last.zMax = Math.max(last.zMax, it.zMax);
      for (const r of it.refs) if (!last.refs.includes(r)) last.refs.push(r);
    } else {
      out.push({ ...it, refs: [...it.refs] });
    }
  }
  return out.map((p) => ({ x0: p.x0, x1: p.x1, zMin: p.zMin, zMax: p.zMax, ref: p.refs.sort().join(';') || null }));
}

/**
 * Platforms mapped as lines. OSM splits some lines into pieces along the track, so pieces at the
 * same x are joined first. A line with a track on one side is a platform edge, and the platform lies
 * on the other side; two edges facing away from each other, close together, are the two sides of
 * one island, any other edge is a side platform. A line with no track beside it is a platform's
 * centre line: an island filling the space between the tracks either side.
 */
function fromLines(lines, trackX) {
  let pieces = lines.map((p) => ({ x: p.centerX, zMin: p.zMin, zMax: p.zMax, refs: refsOf(p.ref) })).sort((a, b) => a.x - b.x);
  const out = [];
  const refOf = (...ls) => [...new Set(ls.flatMap((l) => l.refs))].sort().join(';') || null;

  // Lines between two tracks mapped too close together for a platform (< 6 m apart) contradict
  // each other. The platform lines win (an island tagged for both tracks is better evidence than
  // track lines drawn a little off): a standard island there, and the tracks go either side of it.
  const tx = [...trackX].sort((a, b) => a - b);
  for (let k = 0; k + 1 < tx.length; k++) {
    if (tx[k + 1] - tx[k] >= 6) continue;
    const inside = pieces.filter((p) => p.x > tx[k] && p.x < tx[k + 1]);
    if (!inside.length) continue;
    const c = inside.reduce((s, p) => s + p.x, 0) / inside.length;
    out.push({ x0: c - 4, x1: c + 4, zMin: Math.min(...inside.map((p) => p.zMin)), zMax: Math.max(...inside.map((p) => p.zMax)), ref: refOf(...inside), island: true });
    pieces = pieces.filter((p) => !inside.includes(p));
  }

  const joined = [];
  for (const p of pieces) {
    const last = joined[joined.length - 1];
    if (last && p.x - last.x < 1.0) {
      last.zMin = Math.min(last.zMin, p.zMin);
      last.zMax = Math.max(last.zMax, p.zMax);
      for (const r of p.refs) if (!last.refs.includes(r)) last.refs.push(r);
    } else {
      joined.push({ ...p, refs: [...p.refs] });
    }
  }
  // What a line is depends on how far the nearest tracks are. Edges sit 1.6 to 2.4 m from the track
  // centre; anything further out is a centre line. body: which way the platform extends from an edge.
  const near = (x) => {
    const l = Math.max(...trackX.filter((t) => t < x), -Infinity), r = Math.min(...trackX.filter((t) => t > x), Infinity);
    return { l, r, dl: x - l, dr: r - x };
  };
  const items = joined.map((a) => {
    if (!trackX.length) return { ...a, kind: joined.length === 1 ? 'centre' : 'edge', body: Math.sign(a.x) || 1 };
    const { dl, dr } = near(a.x);
    if (Math.min(dl, dr) < 3) return { ...a, kind: 'edge', body: dl < dr ? 1 : -1 };
    return { ...a, kind: 'centre' };
  });

  const used = new Set();
  for (let i = 0; i < items.length; i++) {
    if (used.has(i)) continue;
    const a = items[i];
    used.add(i);
    const z = { zMin: a.zMin, zMax: a.zMax, ref: refOf(a) };
    if (a.kind === 'centre') {
      const { l, r, dl, dr } = trackX.length ? near(a.x) : { dl: Infinity, dr: Infinity };
      if (dl < 12 && dr < 12) out.push({ x0: l + TRACK_TO_EDGE, x1: r - TRACK_TO_EDGE, ...z, island: true }); // island between its tracks
      else if (Math.min(dl, dr) <= 8) { const half = clamp(Math.min(dl, dr) - TRACK_TO_EDGE, 1.5, 4); out.push({ x0: a.x - half, x1: a.x + half, ...z }); } // side platform
      else out.push({ x0: a.x - 4, x1: a.x + 4, ...z, island: true });
      continue;
    }
    const j = a.body > 0 ? items.findIndex((b, k) => k > i && !used.has(k) && b.body < 0 && b.x - a.x < 12) : -1;
    if (j >= 0) {
      const b = items[j];
      used.add(j);
      out.push({ x0: a.x, x1: b.x, zMin: Math.min(a.zMin, b.zMin), zMax: Math.max(a.zMax, b.zMax), ref: refOf(a, b), island: true });
      continue;
    }
    out.push({ x0: a.body > 0 ? a.x : a.x - EDGE_PLATFORM_W, x1: a.body > 0 ? a.x + EDGE_PLATFORM_W : a.x, zMin: a.zMin, zMax: a.zMax, ref: refOf(a) });
  }
  return out;
}

/** Platforms that still overlap across the tracks (two unlabelled levels, odd mapping) become one. */
function mergeOverlapping(platforms) {
  const out = [];
  for (const p of [...platforms].sort((a, b) => a.x0 - b.x0)) {
    const last = out[out.length - 1];
    if (last && p.x0 < last.x1 - 0.3) {
      last.x1 = Math.max(last.x1, p.x1);
      last.zMin = Math.min(last.zMin, p.zMin);
      last.zMax = Math.max(last.zMax, p.zMax);
      last.ref = [...new Set([...refsOf(last.ref), ...refsOf(p.ref)])].sort().join(';') || null;
      last.island = last.island || p.island;
    } else {
      out.push({ ...p });
    }
  }
  return out;
}

/** No tracks mapped: one platform has a track each side; with more, two tracks run in each wide gap. */
function guessTracks(platforms) {
  if (platforms.length === 1) return [platforms[0].x0 - TRACK_TO_EDGE, platforms[0].x1 + TRACK_TO_EDGE];
  const xs = [];
  for (let i = 0; i + 1 < platforms.length; i++) {
    const a = platforms[i].x1, b = platforms[i + 1].x0;
    if (b - a >= 6) xs.push(a + TRACK_TO_EDGE, b - TRACK_TO_EDGE);
  }
  return xs.length ? xs : [platforms[0].x0 - TRACK_TO_EDGE, platforms[platforms.length - 1].x1 + TRACK_TO_EDGE];
}

function nearestPlatform(platforms, x) {
  let best = null, bd = 4.5;
  for (const p of platforms) {
    const d = x < p.x0 ? p.x0 - x : x > p.x1 ? x - p.x1 : 0;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

function refsOf(ref) {
  return ref ? String(ref).split(';').map((s) => s.trim()).filter(Boolean) : [];
}

function rampLabel(p, s, tracks) {
  if (p.ref) {
    const refs = p.ref.split(';');
    return refs.length > 1 ? `Platforms ${refs.join(' & ')}` : `Platform ${refs[0]}`;
  }
  if (s.left && s.right) return 'Platform';
  const t = tracks.find((k) => (s.left ? k.x < p.x0 : k.x > p.x1) && Math.abs(k.x - (s.left ? p.x0 : p.x1)) < TRACK_TO_EDGE + 1.5);
  return t ? `${t.dir}bound` : 'Platform';
}
