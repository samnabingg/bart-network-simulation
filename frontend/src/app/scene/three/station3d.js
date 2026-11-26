// A walkable station for every BART station except Bay Fair (which has its own detailed model in
// bayfair.js). The layout comes from the station's entry in network.js:
//   kind:     'elevated'    concourse at street level, platform 7 m up on a viaduct
//             'surface'     concourse in an underpass, platform 4.5 m up on an embankment
//             'underground' mezzanine with a ceiling, platform 6 m below it in a tunnel box
//   platform: 'island'      one platform between the two tracks
//             'side'        two platforms outside the two tracks (escalator to one, stairs to the other)
// The look comes from the station's architecture family (FAMILIES below): Market Street subway,
// 1972 East Bay aerial, 2003 SFO extension and so on, so stations from different eras look
// different. Materials and colors are approximations from public photos, not surveyed models.
// Same controls and fare-gate flow as Bay Fair. Not affiliated with or endorsed by BART.
//
// Layout (meters), shared by all kinds. +z is toward the street, -z along the platform.
//   Concourse:  z from +14 to -1.7 (fare gates at z = -1)
//   Paid hall:  z from -1.7 to -19, |x| < 9, escalator/stairs from z = -3 to z = -17
//   Platform:   z from -17 to -90 at height PY

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { atLeftDoor, createTrainRide } from './train-ride.js';
import { buildFleetTrain } from './fleet.js';

export const SDIM = {
  eye: 1.6, radius: 0.3, walk: 2.6, run: 4.2, escalatorSpeed: 0.9,
  platformZ0: -17, platformZ1: -90, rampZ0: -3, gateZ: -1, trainStopZ: -54,
  fare: 4.0, topUp: 20, // demo amounts, not real fares
};
const HEIGHT = { elevated: 7, surface: 4.5, underground: -6 };

/* ----- Architecture families -----
   BART stations were built in a few distinct waves, and stations from the same wave share a look.
   Each station gets the family that matches its era and construction, so a Market Street subway
   station, a 1972 East Bay aerial station and a 2020 Silicon Valley station all look different.
   Materials and colors are approximations from public photos, not surveyed. Tune per station in
   STATION_TWEAKS. */
export const FAMILIES = {
  market:    { label: 'Market Street subway (1973)', ceilH: 4.6, floor: 'quarry', floorColor: 0x8a4b34, wall: 'travertine', wallColor: 0xcdbb9c, ceil: 'coffer', ceilColor: 0x9b8f80, col: 'travertine', sign: 'classic', trim: 0x4a3426, light: 0xffe6c4 },
  mission:   { label: 'Mission Street subway (1973)', ceilH: 3.8, floor: 'quarry', floorColor: 0x7d4430, wall: 'terracotta', wallColor: 0xb8643c, ceil: 'slab', ceilColor: 0xb9b0a2, col: 'terracotta', sign: 'classic', trim: 0x3e2c22, light: 0xffeed4 },
  oakland:   { label: 'Oakland subway (1972)', ceilH: 4.4, floor: 'quarry', floorColor: 0x6f4a36, wall: 'board', wallColor: 0xa8a197, ceil: 'ribbed', ceilColor: 0x8e877d, col: 'board', sign: 'classic', trim: 0x8a6a2e, light: 0xffe4bc },
  berkeley:  { label: 'Berkeley subway (1973)', ceilH: 3.8, floor: 'terrazzo', floorColor: 0xb7ada0, wall: 'ochre', wallColor: 0xc99a4a, ceil: 'slab', ceilColor: 0xc2b9aa, col: 'board', sign: 'classic', trim: 0x4b3a2a, light: 0xffeed4 },
  glen:      { label: 'Glen Park (1973), concrete vault', ceilH: 3.6, floor: 'quarry', floorColor: 0x7a4f3a, wall: 'board', wallColor: 0x9c968c, ceil: 'vault', ceilColor: 0xa19a8f, col: 'board', sign: 'classic', trim: 0x3e3329, light: 0xffecd0 },
  peninsula: { label: 'SFO extension (2003)', ceilH: 4.2, floor: 'terrazzo', floorColor: 0xd2d4d2, wall: 'panel', wallColor: 0xe9ecee, ceil: 'panel', ceilColor: 0xf1f2f2, col: 'steel', sign: 'modern', trim: 0x0099d8, light: 0xf2f6ff },
  aerial:    { label: 'East Bay aerial station (1972)', floor: 'quarry', floorColor: 0x8c5039, wall: 'board', wallColor: 0xb0a89c, roof: 'gable', col: 'round', sign: 'classic', trim: 0x5a3d2b, roofColor: 0xb9b2a6, light: 0xffe6c0 },
  grade:     { label: 'Original ground-level station (1970s)', floor: 'quarry', floorColor: 0x7f5442, wall: 'board', wallColor: 0xb8afa2, roof: 'flat', col: 'square', sign: 'classic', trim: 0x6b4a32, roofColor: 0xc4bcae, light: 0xffeacc },
  modern:    { label: 'Extension station (1995 to 2018)', floor: 'paver', floorColor: 0xc9c7c1, wall: 'panel', wallColor: 0xeceeef, roof: 'wave', col: 'tree', sign: 'modern', trim: 0x0099d8, roofColor: 0xf3f4f4, light: 0xf4f8ff },
  saw:       { label: 'Silicon Valley extension (2017 to 2020)', floor: 'paver', floorColor: 0xd0cdc6, wall: 'panel', wallColor: 0xf0f0ee, roof: 'saw', col: 'white', sign: 'modern', trim: 0x0099d8, roofColor: 0xf6f6f4, light: 0xf4f8ff },
  airport:   { label: 'Airport station', floor: 'terrazzo', floorColor: 0xd9d9d6, wall: 'panel', wallColor: 0xeef0f1, roof: 'glass', col: 'white', sign: 'modern', trim: 0x0099d8, roofColor: 0xf4f5f6, light: 0xf6f9ff },
};
const FAMILY_OF = {
  EMBR: 'market', MONT: 'market', POWL: 'market', CIVC: 'market',
  '16TH': 'mission', '24TH': 'mission', GLEN: 'glen',
  '12TH': 'oakland', '19TH': 'oakland', LAKE: 'oakland',
  ASHB: 'berkeley', DBRK: 'berkeley', NBRK: 'berkeley',
  COLM: 'peninsula', SSAN: 'peninsula', SBRN: 'peninsula',
  SFIA: 'airport', OAKL: 'airport',
  MLBR: 'modern', DUBL: 'modern', WDUB: 'modern', PITT: 'modern', PCTR: 'modern', ANTC: 'modern', NCON: 'modern',
  WARM: 'saw', MLPT: 'saw', BERY: 'saw',
};
// Per-station touches so stations in one family still differ (approximate; edit after checking photos).
const STATION_TWEAKS = {
  EMBR: { wallColor: 0xbdb8ae, floorColor: 0x6f6a64, trim: 0x2e3a44 },
  MONT: { wallColor: 0xcbb38c },
  POWL: { wallColor: 0xaaa59b, trim: 0x5a2e22 },
  CIVC: { wallColor: 0xb7a07a, trim: 0x2f4a5a },
  '16TH': { wallColor: 0xc4803e },
  '24TH': { wallColor: 0xa4553a },
  '12TH': { trim: 0x8a6a2e },
  '19TH': { trim: 0x9a4e2c, wallColor: 0xb0a89a },
  LAKE: { ceil: 'coffer', wallColor: 0x9a958c },
  DBRK: { wallColor: 0x7d9ab2, wall: 'ochre' },
  NBRK: { wallColor: 0xc9a25a },
  ASHB: { wallColor: 0xd0b48a },
  SSAN: { wallColor: 0xdfe6ea },
  SBRN: { trim: 0x2f8f6a },
  COLS: { trim: 0x7a4a2a },
  WOAK: { trim: 0x4a4a4a, floorColor: 0x7a6a5e },
  ROCK: { trim: 0x3e5a3a },
  FTVL: { trim: 0x8a4a2a },
  RICH: { trim: 0x4e3a5a },
  CONC: { trim: 0x5a4632 },
  WCRK: { trim: 0x3a4e5e },
  ORIN: { trim: 0x3e5a3a, floorColor: 0x8a7462 },
  LAFY: { trim: 0x5a5032 },
  DALY: { trim: 0x2e3e4e },
  BALB: { trim: 0x5a3e2e },
};
// Stations that sit in (or right beside) a freeway: lanes and traffic instead of a parking lot.
const FREEWAY = new Set(['MCAR', 'ROCK', 'ORIN', 'LAFY', 'DUBL', 'WDUB', 'PITT', 'PCTR', 'BALB', 'DALY', 'WCRK']);

export function stationFamily(abbr, kind) {
  const key = FAMILY_OF[abbr] || (kind === 'elevated' ? 'aerial' : kind === 'surface' ? 'grade' : 'oakland');
  return { key, ...FAMILIES[key], ...(STATION_TWEAKS[abbr] || {}) };
}

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const easeOut = (u) => 1 - (1 - u) ** 3;
const easeIn = (u) => u ** 3;
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const css = (hex, f = 1) => `rgb(${[16, 8, 0].map((sh) => Math.round(clamp(((hex >> sh) & 255) * f, 0, 255))).join(',')})`;
const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';

function layoutFor(platform) {
  if (platform === 'side') {
    return {
      tracks: [{ x: 2.1, dir: 'South' }, { x: -2.1, dir: 'North' }],
      platforms: [{ x0: 3.8, x1: 8.6 }, { x0: -8.6, x1: -3.8 }],
      ramps: [{ x0: 5.0, x1: 6.2, esc: true, label: 'Southbound · Escalator' }, { x0: -7.4, x1: -5.0, esc: false, label: 'Northbound · Stairs' }],
      boardX: [6.2, -6.2],
      columnX: [7.9, -7.9],
    };
  }
  return {
    tracks: [{ x: 6, dir: 'South' }, { x: -6, dir: 'North' }],
    platforms: [{ x0: -4, x1: 4 }],
    ramps: [{ x0: -3.6, x1: -2.4, esc: true, label: 'Platform · Escalator' }, { x0: 1.4, x1: 3.6, esc: false, label: 'Platform · Stairs' }],
    boardX: [2.8, -2.8],
    columnX: [2, -2],
  };
}

function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Text that shrinks to fit the sign.
function fitText(g, text, w, weight, max, min = 14) {
  let px = max;
  do { g.font = `${weight} ${px}px ${FONT}`; px -= 2; } while (px > min && g.measureText(text).width > w);
}

// Surface textures. Every one covers 1.2 m x 1.2 m, so repeats are simply size / 1.2.
function surfaceGenerators(rand) {
  const speckle = (g, w, h, n, a) => {
    for (let i = 0; i < n; i++) { g.fillStyle = rand() < 0.5 ? `rgba(0,0,0,${rand() * a})` : `rgba(255,255,255,${rand() * a})`; g.fillRect(rand() * w, rand() * h, 2, 2); }
  };
  return {
    // unglazed quarry tile, 30 cm, the classic 1970s BART floor
    quarry: (c) => (g, w, h) => {
      g.fillStyle = css(c, 0.55); g.fillRect(0, 0, w, h);
      const s = w / 4;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = css(c, 0.86 + rand() * 0.26); g.fillRect(i * s + 3, j * s + 3, s - 6, s - 6); }
      speckle(g, w, h, 1400, 0.1);
    },
    // honed stone, 60 x 30 cm, running bond
    travertine: (c) => (g, w, h) => {
      g.fillStyle = css(c, 0.78); g.fillRect(0, 0, w, h);
      const tw = w / 2, th = h / 4;
      for (let r = 0; r < 4; r++) for (let k = -1; k < 3; k++) {
        const x = k * tw + (r % 2 ? tw / 2 : 0);
        g.fillStyle = css(c, 0.93 + rand() * 0.12); g.fillRect(x + 2, r * th + 2, tw - 4, th - 4);
        g.strokeStyle = `rgba(120,95,60,${0.08 + rand() * 0.1})`; g.lineWidth = 1;
        for (let v = 0; v < 3; v++) { const y = r * th + 6 + rand() * (th - 12); g.beginPath(); g.moveTo(x + 4, y); g.bezierCurveTo(x + tw * 0.3, y + 4, x + tw * 0.6, y - 4, x + tw - 4, y + 2); g.stroke(); }
      }
    },
    // small glazed terracotta tile, 15 cm
    terracotta: (c) => (g, w, h) => {
      g.fillStyle = css(c, 0.5); g.fillRect(0, 0, w, h);
      const s = w / 8;
      for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
        const f = 0.85 + rand() * 0.3;
        const gr = g.createLinearGradient(0, j * s, 0, j * s + s);
        gr.addColorStop(0, css(c, f * 1.12)); gr.addColorStop(1, css(c, f * 0.92));
        g.fillStyle = gr; g.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
      }
    },
    // glazed ochre tile, 20 cm
    ochre: (c) => (g, w, h) => {
      g.fillStyle = css(c, 0.6); g.fillRect(0, 0, w, h);
      const s = w / 6;
      for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
        g.fillStyle = css(c, 0.92 + rand() * 0.16); g.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
        g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(i * s + 4, j * s + 4, s - 8, 5);
      }
    },
    // board-formed concrete: horizontal boards, wood grain, form-tie holes
    board: (c) => (g, w, h) => {
      g.fillStyle = css(c); g.fillRect(0, 0, w, h);
      const bh = h / 8;
      for (let b = 0; b < 8; b++) {
        g.fillStyle = css(c, 0.94 + rand() * 0.1); g.fillRect(0, b * bh, w, bh);
        for (let k = 0; k < 14; k++) { g.fillStyle = `rgba(0,0,0,${rand() * 0.05})`; g.fillRect(rand() * w, b * bh + rand() * bh, 30 + rand() * 90, 1); }
        g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, b * bh, w, 1);
      }
      speckle(g, w, h, 900, 0.08);
      g.fillStyle = 'rgba(0,0,0,.35)';
      for (const x of [w * 0.25, w * 0.75]) for (const y of [h * 0.25, h * 0.75]) { g.beginPath(); g.arc(x, y, 3, 0, TAU); g.fill(); }
    },
    // smooth metal or enamel wall panel, one per tile
    panel: (c) => (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, h);
      gr.addColorStop(0, css(c, 1.02)); gr.addColorStop(1, css(c, 0.95));
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = css(c, 0.72); g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h);
    },
    terrazzo: (c) => (g, w, h) => {
      g.fillStyle = css(c); g.fillRect(0, 0, w, h);
      const chips = ['#8d8a84', '#f4f2ee', '#5f6266', '#b9a78f', '#3f4a57'];
      for (let i = 0; i < 2600; i++) { g.fillStyle = chips[Math.floor(rand() * chips.length)]; const r = 0.6 + rand() * 1.8; g.fillRect(rand() * w, rand() * h, r, r); }
      g.fillStyle = 'rgba(150,120,70,.55)'; g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h);
    },
    // light concrete pavers, 60 cm
    paver: (c) => (g, w, h) => {
      g.fillStyle = css(c, 0.7); g.fillRect(0, 0, w, h);
      const s = w / 2;
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { g.fillStyle = css(c, 0.94 + rand() * 0.1); g.fillRect(i * s + 2, j * s + 2, s - 4, s - 4); }
      speckle(g, w, h, 1600, 0.09);
    },
    coffer: (c) => (g, w, h) => {
      g.fillStyle = css(c); g.fillRect(0, 0, w, h);
      const s = w / 2;
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        g.fillStyle = css(c, 0.72); g.fillRect(i * s + 14, j * s + 14, s - 28, s - 28);
        g.fillStyle = css(c, 0.6); g.fillRect(i * s + 26, j * s + 26, s - 52, s - 52);
      }
      speckle(g, w, h, 700, 0.08);
    },
    gravel: (c) => (g, w, h) => {
      g.fillStyle = css(c); g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2400; i++) { g.fillStyle = css(c, 0.6 + rand() * 0.8); g.fillRect(rand() * w, rand() * h, 3, 3); }
    },
    // truncated-dome warning strip
    tactile: (c) => (g, w, h) => {
      g.fillStyle = css(c); g.fillRect(0, 0, w, h);
      const n = 12, s = w / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const x = i * s + s / 2, y = j * s + s / 2;
        g.fillStyle = css(c, 0.78); g.beginPath(); g.arc(x + 1.5, y + 1.5, s * 0.3, 0, TAU); g.fill();
        g.fillStyle = css(c, 1.08); g.beginPath(); g.arc(x, y, s * 0.3, 0, TAU); g.fill();
      }
    },
    asphalt: (c) => (g, w, h) => {
      g.fillStyle = css(c); g.fillRect(0, 0, w, h);
      speckle(g, w, h, 3000, 0.12);
    },
    facade: (c) => (g, w, h) => {
      g.fillStyle = css(c); g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        const lit = rand() < 0.15;
        g.fillStyle = lit ? '#f3e7c4' : rand() < 0.5 ? '#3b4855' : '#52616e';
        g.fillRect(i * 128 + 24, j * 128 + 30, 80, 70);
        g.fillStyle = 'rgba(255,255,255,.15)'; g.fillRect(i * 128 + 24, j * 128 + 30, 80, 8);
      }
    },
  };
}

export function createStationScene(host, opts = {}) {
  const st = opts.station;
  const kind = HEIGHT[st.kind] !== undefined ? st.kind : 'elevated';
  const under = kind === 'underground';
  const LAY = layoutFor(st.platform);
  const D = SDIM;
  const PY = HEIGHT[kind];
  const fam = stationFamily(st.abbr, kind);
  const classic = fam.sign === 'classic';
  const seed = hash(st.abbr);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: !!opts.preserveDrawingBuffer });
  } catch {
    const msg = document.createElement('p');
    msg.className = 'scene-fallback';
    msg.textContent = '3D is not available in this browser (WebGL could not start).';
    host.append(msg);
    return { setLive() {}, reset() {}, teleport() {}, getState: () => ({}), dispose() { msg.remove(); } };
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = under ? 1.15 : 1.0;
  if (!under) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  host.append(renderer.domElement);
  const canvas = renderer.domElement;
  canvas.style.touchAction = 'none';
  host.tabIndex = 0;

  const scene = new THREE.Scene();
  // Soft image-based light, so metal, glass and glazed tile pick up reflections.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(renderer), 0.04);
  scene.environment = envRT.texture;
  const horizon = 0xdbe4ea;
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1600);
  camera.rotation.order = 'YXZ';
  if (under) {
    scene.background = new THREE.Color(0x15120f);
    scene.fog = new THREE.Fog(0x15120f, 45, 170);
    scene.add(new THREE.HemisphereLight(fam.light, 0x3a332c, 0.9));
  } else {
    scene.background = new THREE.Color(horizon);
    scene.fog = new THREE.Fog(horizon, 90, 700);
    scene.add(new THREE.HemisphereLight(0xcfe3f5, 0x8a7a5e, 0.75));
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
    sun.position.set(-45, 70, 25);
    sun.target.position.set(0, 0, -35);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 75, bottom: -75, near: 10, far: 220 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);
  }

  /* ----- materials and builders ----- */
  const rand = (() => { let s = seed || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const GEN = surfaceGenerators(rand);
  const texCache = new Map();
  const texFor = (key, color) => {
    const k = `${key}:${color}`;
    if (!texCache.has(k)) texCache.set(k, canvasTex(256, 256, GEN[key](color)));
    return texCache.get(k);
  };
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
  const texMat = (tex, rx, ry, o = {}) => {
    const t = tex.clone();
    t.needsUpdate = true;
    t.repeat.set(rx, ry);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, ...o });
  };
  // a surface of w x h meters
  const tm = (key, color, w, h, o = {}) => texMat(texFor(key, color), Math.max(1, w / 1.2), Math.max(1, h / 1.2), o);
  const emissive = (color, intensity = 1) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity });
  const slab = (x0, x1, y0, y1, z0, z1, m) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), m);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    scene.add(mesh);
    return mesh;
  };
  const plane = (x0, x1, z0, z1, y, m) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    scene.add(mesh);
    return mesh;
  };
  const cyl = (r, h, x, y, z, m, seg = 16, rTop = r) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, r, h, seg), m);
    mesh.position.set(x, y + h / 2, z);
    scene.add(mesh);
    return mesh;
  };
  const rod = (a, b, r, m) => {
    const dir = new THREE.Vector3().subVectors(b, a);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, dir.length(), 12), m);
    mesh.position.copy(a).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    scene.add(mesh);
    return mesh;
  };
  // flat light panel facing down
  const lampGeo = new THREE.PlaneGeometry(1, 1);
  const lampMat = new THREE.MeshBasicMaterial({ color: fam.light, toneMapped: false });
  const lamp = (x, y, z, w, d, m = lampMat) => {
    const mesh = new THREE.Mesh(lampGeo, m);
    mesh.scale.set(w, d, 1);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(x, y, z);
    scene.add(mesh);
    return mesh;
  };
  const colliders = [];
  // level: 'low' = concourse/hall level, 'high' = platform level, 'both'
  const solid = (x0, x1, z0, z1, level = 'low', when = null) => colliders.push({ x0, x1, z0, z1, level, when });
  const atPlatform = (y) => Math.abs(y - PY) < Math.abs(PY) / 2;
  const animators = []; // little things that move every frame (traffic)

  const trim = mat(fam.trim, { roughness: 0.55, metalness: classic ? 0.2 : 0.1 });
  const concColor = classic ? 0xa39c90 : 0xc6c4be;
  const concrete = tm('board', concColor, 4.8, 4.8);
  const steel = mat(0xc3c8ce, { metalness: 0.85, roughness: 0.28 });
  const whiteSteel = mat(0xf2f3f3, { metalness: 0.2, roughness: 0.35 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xcfe6ee, transparent: true, opacity: 0.22, roughness: 0.04, metalness: 0.2, depthWrite: false, side: THREE.DoubleSide });
  const floorMat = (w, h) => tm(fam.floor, fam.floorColor, w, h, { roughness: fam.floor === 'terrazzo' ? 0.35 : 0.82 });
  const wallMat = (w, h) => tm(fam.wall, fam.wallColor, w, h, { roughness: ['ochre', 'panel', 'terracotta'].includes(fam.wall) ? 0.35 : 0.85 });

  const lineHexes = (opts.lines || []).slice(0, 5);
  const signTex = canvasTex(1024, 256, (g, w, h) => {
    if (classic) {
      g.fillStyle = '#35271e'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#7d6247'; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20);
    } else {
      g.fillStyle = '#141d26'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#0099d8'; g.fillRect(0, h - 20, w, 20);
    }
    const r = 24;
    let x = 44 + r;
    for (const hx of lineHexes) {
      g.fillStyle = hx; g.beginPath(); g.arc(x, h / 2 - 4, r, 0, TAU); g.fill();
      g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.8)'; g.stroke();
      x += r * 2 + 12;
    }
    const left = lineHexes.length ? x + 6 : 48;
    g.fillStyle = '#ffffff'; g.textAlign = 'left'; g.textBaseline = 'middle';
    fitText(g, st.name, w - left - 40, classic ? 500 : 700, 120, 28);
    g.fillText(st.name, left, h / 2 - 2);
  }, false);
  const signMat = new THREE.MeshBasicMaterial({ map: signTex, toneMapped: false });
  const labelMesh = (text, w, h) => {
    const t = canvasTex(512, 128, (g, cw, ch) => {
      g.fillStyle = classic ? '#35271e' : '#141d26'; g.fillRect(0, 0, cw, ch);
      if (!classic) { g.fillStyle = '#0099d8'; g.fillRect(0, 0, 10, ch); }
      g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      fitText(g, text, cw - 40, 600, 60, 20);
      g.fillText(text, cw / 2, ch / 2 + 2);
    }, false);
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
  };
  // Colorful lightbox posters (generic, no real ads)
  const POSTERS = [['Explore the Bay', '#1f7fbf', '#f2b134'], ['Bike to BART', '#2f8f4a', '#f4efe2'], ['See something? Say something.', '#c8452c', '#ffffff'], ['Golden hour at the bridge', '#e07a3a', '#2a3a5a'], ['Farmers market Saturdays', '#6a9a3a', '#fff3d6'], ['Art on the platform', '#7a4aa8', '#ffd966']];
  const poster = (i) => {
    const [text, bg, fg] = POSTERS[(i + seed) % POSTERS.length];
    const t = canvasTex(256, 384, (g, w, h) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.fillStyle = fg; g.globalAlpha = 0.25;
      g.beginPath(); g.arc(w * 0.7, h * 0.3, 90, 0, TAU); g.fill();
      g.fillRect(0, h * 0.62, w, 30);
      g.globalAlpha = 1;
      g.fillStyle = fg; g.textAlign = 'left'; g.textBaseline = 'top';
      g.font = `700 30px ${FONT}`;
      const words = text.split(' ');
      let line = '', y = h * 0.68;
      for (const wd of words) {
        if (g.measureText(`${line} ${wd}`).width > w - 36 && line) { g.fillText(line, 18, y); y += 34; line = wd; } else line = line ? `${line} ${wd}` : wd;
      }
      g.fillText(line, 18, y);
    }, false);
    return new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
  };
  const posterAt = (i, x, y, z, ry) => {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.9, 0.1), mat(0x2b2b2e, { metalness: 0.5, roughness: 0.4 }));
    frame.position.set(x, y, z);
    frame.rotation.y = ry;
    scene.add(frame);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.16, 1.74), poster(i));
    p.position.set(x + Math.sin(ry) * 0.052, y, z + Math.cos(ry) * 0.052);
    p.rotation.y = ry;
    scene.add(p);
  };

  const rampRun = Math.abs(D.platformZ0 - D.rampZ0);
  const inBand = (b, x) => x > b.x0 && x < b.x1;
  const onPlatformX = (x) => LAY.platforms.some((p) => x > p.x0 && x < p.x1);
  const CEIL = under ? fam.ceilH || 3.8 : 0;

  // Ceiling of an underground room, from x0..x1 and z0..z1, in the family's style.
  const ceiling = (x0, x1, z0, z1) => {
    const y = CEIL;
    const cm = mat(fam.ceilColor, { roughness: 0.9 });
    const kindC = fam.ceil;
    if (kindC === 'vault') {
      const half = (x1 - x0) / 2, rise = 3.2, len = z1 - z0;
      const vm = texMat(texFor('coffer', fam.ceilColor), 14, Math.max(2, len / 2.4), { side: THREE.DoubleSide });
      const vault = new THREE.Mesh(new THREE.CylinderGeometry(half, half, len, 48, 1, true, Math.PI / 2, Math.PI), vm);
      vault.rotation.x = Math.PI / 2;
      vault.scale.set(1, 1, rise / half);
      vault.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
      scene.add(vault);
      for (const z of [z0, z1]) {
        const cap = new THREE.Mesh(new THREE.CircleGeometry(half, 48, 0, Math.PI), mat(fam.wallColor, { side: THREE.DoubleSide }));
        cap.scale.set(1, rise / half, 1);
        cap.position.set((x0 + x1) / 2, y, z);
        scene.add(cap);
      }
      for (const s of [-1, 1]) slab((x0 + x1) / 2 + s * (half - 0.35) - 0.12, (x0 + x1) / 2 + s * (half - 0.35) + 0.12, y - 0.05, y + 0.05, z0, z1, lampMat); // cove uplights
      return;
    }
    slab(x0, x1, y, y + 0.3, z0, z1, cm);
    if (kindC === 'coffer') {
      const step = 2.2, nx = Math.round((x1 - x0) / step), nz = Math.round((z1 - z0) / step);
      const sx = (x1 - x0) / nx, sz = (z1 - z0) / nz;
      for (let i = 0; i <= nx; i++) slab(x0 + i * sx - 0.13, x0 + i * sx + 0.13, y - 0.6, y, z0, z1, cm);
      for (let j = 0; j <= nz; j++) slab(x0, x1, y - 0.6, y, z0 + j * sz - 0.13, z0 + j * sz + 0.13, cm);
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) lamp(x0 + (i + 0.5) * sx, y - 0.02, z0 + (j + 0.5) * sz, sx * 0.42, sz * 0.42);
    } else if (kindC === 'ribbed') {
      for (let z = z0 + 0.75; z < z1; z += 1.5) slab(x0, x1, y - 0.5, y, z - 0.1, z + 0.1, cm);
      for (let x = x0 + 2.5; x < x1 - 1; x += 5) lamp(x, y - 0.52, (z0 + z1) / 2, 0.22, z1 - z0 - 1);
    } else if (kindC === 'panel') {
      for (let x = x0 + 1.2; x < x1; x += 2.4) for (let z = z0 + 1.2; z < z1; z += 2.4) {
        const dl = new THREE.Mesh(new THREE.CircleGeometry(0.16, 20), lampMat);
        dl.rotation.x = Math.PI / 2;
        dl.position.set(x, y - 0.01, z);
        scene.add(dl);
      }
    } else {
      for (let x = x0 + 2.5; x < x1 - 1; x += 4.5) lamp(x, y - 0.02, (z0 + z1) / 2, 0.24, z1 - z0 - 1.5);
    }
  };

  /* ----- Sky and street level / concourse ----- */
  if (!under) {
    const skyTex = canvasTex(8, 512, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#3f7fc4'); gr.addColorStop(0.32, '#8fbbe2'); gr.addColorStop(0.49, '#dbe4ea'); gr.addColorStop(1, '#dbe4ea');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }, false);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }));
    scene.add(dome);
    // a few soft clouds
    const cloudTex = canvasTex(256, 128, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      for (let i = 0; i < 14; i++) {
        const x = 40 + rand() * (w - 80), y = 50 + rand() * 40, r = 20 + rand() * 30;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      }
    }, false);
    const cloudMat = new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, toneMapped: false });
    for (let i = 0; i < 9; i++) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(160, 60), cloudMat);
      const a = rand() * TAU, d = 500 + rand() * 250;
      c.position.set(Math.cos(a) * d, 120 + rand() * 120, Math.sin(a) * d);
      c.lookAt(0, c.position.y * 0.6, 0);
      scene.add(c);
    }

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), tm('gravel', kind === 'surface' ? 0x8a8f6a : 0x86906a, 1400, 1400, { roughness: 1 }));
    ground.material.map.repeat.set(250, 250);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.08;
    scene.add(ground);
    plane(-60, 60, 22, 70, -0.02, tm('asphalt', 0x4b4d50, 120, 48));
    plane(-24, 24, -1.7, 22, 0, floorMat(48, 23.7));
    slab(-24, 24, -0.4, 0, 22, 22.3, mat(0xbcbab3));

    if (classic) {
      // 1970s: heavy concrete canopy with a dark fascia on tapered round columns
      slab(-20, 20, 3.9, 4.35, -1.7, 14, concrete);
      slab(-20.1, 20.1, 3.6, 4.6, 13.9, 14.2, trim);
      for (const s of [-1, 1]) slab(s * 20 - 0.15, s * 20 + 0.15, 3.6, 4.6, -1.7, 14.2, trim);
      for (let x = -16; x <= 16; x += 8) for (let z = 1; z <= 11; z += 5) lamp(x, 3.88, z, 0.9, 2.4);
      for (const x of [-16, -8, 8, 16]) { cyl(0.28, 3.9, x, 0, 12.4, concrete, 20, 0.42); solid(x - 0.4, x + 0.4, 12, 12.8); }
    } else {
      // newer stations: thin white roof on slim steel columns, glass windscreen at the sides
      slab(-21, 21, 4.6, 4.85, -1.7, 15.5, whiteSteel);
      slab(-21.05, 21.05, 4.45, 4.6, 15.3, 15.6, trim);
      for (let x = -18; x <= 18; x += 4) for (let z = 1.5; z <= 13.5; z += 4) {
        const dl = new THREE.Mesh(new THREE.CircleGeometry(0.18, 18), lampMat);
        dl.rotation.x = Math.PI / 2; dl.position.set(x, 4.59, z); scene.add(dl);
      }
      for (const x of [-18, -9, 9, 18]) { cyl(0.16, 4.6, x, 0, 13.6, whiteSteel, 16); solid(x - 0.2, x + 0.2, 13.4, 13.8); }
      for (const s of [-1, 1]) slab(s * 20.9 - 0.03, s * 20.9 + 0.03, 0, 2.6, -1.7, 13, glass);
    }
    slab(-14, 14, 4.3, 6.5, -1.95, -1.3, classic ? trim : whiteSteel); // fascia above the gates with the station name
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 1.2), signMat);
    sign.position.set(0, 5.4, -1.27);
    scene.add(sign);
    // and on the canopy edge, so it can be read from the street
    const front = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), signMat);
    front.position.set(0, classic ? 5.25 : 5.6, classic ? 14.25 : 15.65);
    scene.add(front);
    slab(-3.1, 3.1, classic ? 4.45 : 4.8, classic ? 6.05 : 6.4, classic ? 14.1 : 15.5, classic ? 14.2 : 15.6, classic ? trim : whiteSteel);
    // a street-side totem with the station name
    slab(10.5, 11.1, 0, 4.2, 19.4, 20.0, classic ? trim : mat(0x141d26));
    const tot = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), signMat);
    tot.rotation.y = Math.PI / 2; tot.position.set(11.12, 3.4, 19.7); scene.add(tot);
    solid(10.4, 11.2, 19.3, 20.1);
  } else {
    // Underground mezzanine: floor, walls and ceiling in the family's materials, stairs up to the street.
    plane(-14, 14, -1.7, 14, 0.001, floorMat(28, 15.7));
    ceiling(-14, 14, -1.7, 14.4);
    for (const s of [-1, 1]) slab(s * 14 - 0.2, s * 14 + 0.2, 0, CEIL, -1.7, 14, wallMat(15.7, CEIL));
    slab(-14, 14, 0, CEIL, 14, 14.4, wallMat(28, CEIL));
    slab(-14, -9, 0, CEIL, -2, -1.7, wallMat(5, CEIL));
    slab(9, 14, 0, CEIL, -2, -1.7, wallMat(5, CEIL));
    if (fam.ceil !== 'vault') slab(-9, 9, CEIL - 0.6, CEIL, -2, -1.7, wallMat(18, 0.6));
    // a metal trim line around the room and a dark base
    for (const s of [-1, 1]) {
      slab(s * 13.8 - 0.02, s * 13.8 + 0.02, 2.5, 2.62, -1.7, 14, trim);
      slab(s * 13.8 - 0.02, s * 13.8 + 0.02, 0, 0.15, -1.7, 14, mat(0x2c2a28));
    }
    // posters on the side walls
    posterAt(0, -13.74, 1.5, 3, Math.PI / 2);
    posterAt(1, -13.74, 1.5, 9, Math.PI / 2);
    posterAt(2, 13.74, 1.5, 9, -Math.PI / 2);
    // stairs up to the street (decoration; the street is not modeled), with daylight at the top
    const stairs = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 7), tm('quarry', 0x6a6560, 4, 7));
    stairs.position.set(0, CEIL / 2 - 0.15, 10.5);
    stairs.rotation.x = -Math.atan2(CEIL, 7);
    scene.add(stairs);
    for (const s of [-1, 1]) slab(s * 2.15 - 0.15, s * 2.15 + 0.15, 0, 1.1, 7, 14, wallMat(7, 1.1));
    for (const s of [-1, 1]) rod(new THREE.Vector3(s * 1.95, 0.95, 7), new THREE.Vector3(s * 1.95, CEIL + 0.95, 14), 0.035, steel);
    if (fam.ceil !== 'vault') lamp(0, CEIL - 0.015, 12.6, 3.6, 2.4, new THREE.MeshBasicMaterial({ color: 0xe9f2fa, toneMapped: false })); // daylight from the street
    solid(-2.4, 2.4, 7, 14);
    const up = labelMesh('Street ▲ Exit', 2.4, 0.6);
    up.position.set(0, Math.min(3.0, CEIL - 0.7), 6.9);
    scene.add(up);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.75), signMat);
    sign.position.set(0, Math.max(3.25, CEIL - (fam.ceil === 'coffer' ? 1.0 : 0.5)), -1.64);
    scene.add(sign);
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), signMat);
      m.position.set(s * 13.75, 3.1, 5.6);
      m.rotation.y = -s * Math.PI / 2;
      scene.add(m);
    }
  }

  /* ----- Station agent booth, ticket machines ----- */
  slab(-8.8, -5.2, 0, 1.1, -1.7, 2.6, classic ? trim : whiteSteel);
  slab(-8.8, -5.2, 1.1, 2.6, -1.7, 2.6, glass);
  slab(-8.9, -5.1, 2.6, 3.0, -1.8, 2.7, classic ? trim : mat(0x141d26));
  const boothSign = labelMesh('Station Agent', 2.2, 0.36);
  boothSign.position.set(-7, 2.8, 2.72);
  scene.add(boothSign);
  solid(-8.9, -5.1, -1.8, 2.7);
  const tvmScreen = canvasTex(256, 192, (g, w, h) => {
    g.fillStyle = '#0d2a44'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#0099d8'; g.fillRect(0, 0, w, 34);
    g.fillStyle = '#fff'; g.font = `700 22px ${FONT}`; g.fillText('Clipper', 14, 25);
    g.fillStyle = '#dbe8f2'; g.font = `20px ${FONT}`; g.fillText('Add value', 14, 80); g.fillText('Buy a card', 14, 112);
    g.fillStyle = '#f2b134'; g.fillRect(14, 140, 110, 34);
    g.fillStyle = '#10202e'; g.font = `700 18px ${FONT}`; g.fillText('Start', 44, 163);
  }, false);
  for (const x of [5.3, 6.5, 7.7]) {
    slab(x - 0.42, x + 0.42, 0, 1.85, -0.5, 0.5, mat(0x2f353c, { metalness: 0.4, roughness: 0.4 }));
    slab(x - 0.42, x + 0.42, 1.85, 2.05, -0.5, 0.5, mat(0x0099d8, { roughness: 0.4 }));
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.46), new THREE.MeshBasicMaterial({ map: tvmScreen, toneMapped: false }));
    s.position.set(x, 1.35, 0.505);
    scene.add(s);
    slab(x - 0.2, x + 0.2, 0.85, 0.95, 0.5, 0.56, mat(0x111111)); // card slot / tray
  }
  solid(4.8, 8.2, -0.6, 0.6);

  /* ----- Fare gates (BART's newer tall glass swing gates) ----- */
  const arrow = (ok) => canvasTex(64, 64, (g) => {
    g.fillStyle = ok ? '#0a1a0a' : '#1a0a0a'; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = ok ? '#3ff56a' : '#ff4a3a'; g.lineWidth = 8; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath();
    if (ok) { g.moveTo(32, 10); g.lineTo(32, 52); g.moveTo(14, 34); g.lineTo(32, 54); g.lineTo(50, 34); } else { g.moveTo(14, 14); g.lineTo(50, 50); g.moveTo(50, 14); g.lineTo(14, 50); }
    g.stroke();
  }, false);
  const arrowOk = arrow(true), arrowNo = arrow(false);
  const GATE_N = 8, GAP = 0.75, PED = 0.35, PITCH = GAP + PED;
  const gateX0 = -(GATE_N * PITCH + PED) / 2 + PED / 2;
  const gateLights = [], flaps = [];
  const cabinet = mat(0x262a30, { metalness: 0.35, roughness: 0.35 });
  const ledBlue = new THREE.MeshBasicMaterial({ color: 0x35b4ff, toneMapped: false });
  const reader = mat(0x0a5fa8, { roughness: 0.3 });
  const gateGlass = new THREE.MeshStandardMaterial({ color: 0xd8f0f8, transparent: true, opacity: 0.35, roughness: 0.04, metalness: 0.1, depthWrite: false });
  for (let i = 0; i <= GATE_N; i++) {
    const x = gateX0 + i * PITCH;
    slab(x - PED / 2, x + PED / 2, 0, 1.05, -1.7, -0.3, cabinet);
    slab(x - PED / 2, x + PED / 2, 1.05, 1.075, -1.7, -0.3, ledBlue);
    slab(x - 0.1, x + 0.1, 1.075, 1.11, -0.62, -0.38, reader);
    solid(x - PED / 2, x + PED / 2, -1.7, -0.3);
    if (i < GATE_N) {
      const cx = x + PITCH / 2;
      const m = new THREE.MeshBasicMaterial({ map: arrowNo, toneMapped: false });
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), m);
      panel.position.set(cx, 2.55, -0.18);
      scene.add(panel);
      gateLights.push(m);
      const flap = slab(cx - GAP / 2, cx + GAP / 2, 0.3, 1.8, -1.04, -0.96, gateGlass);
      flap.userData.dynamic = true; // shown and hidden as the gates open
      flaps.push(flap);
      solid(cx - GAP / 2, cx + GAP / 2, -1.06, -0.94, 'low', () => !game.gatesOpen);
    }
  }
  slab(gateX0 - 0.2, -gateX0 + 0.2, 2.35, 2.85, -1.75, -0.2, classic ? trim : mat(0x141d26));
  const gateEdge = -gateX0 + PED / 2;
  slab(gateEdge, 9, 0, 1.1, -1.7, -1.5, steel);
  slab(-9, -gateEdge, 0, 1.1, -1.7, -1.5, steel);
  solid(gateEdge, 9.6, -1.75, -1.4);
  solid(-9.6, -gateEdge, -1.75, -1.4);

  /* ----- Paid hall: floor, walls ----- */
  // The hall floor is a slab with openings where the ramps go down (underground) so you can see
  // the platform below. Elsewhere it is solid.
  const hallFloorMat = floorMat(19.2, 19.2);
  const floorStrips = (z0, z1) => {
    const cuts = under ? LAY.ramps.map((r) => [r.x0 - 0.15, r.x1 + 0.15]).sort((a, b) => a[0] - b[0]) : [];
    let x = -9.6;
    for (const [c0, c1] of [...cuts, [9.6, 9.6]]) { if (c0 > x) slab(x, c0, -0.3, 0, z0, z1, hallFloorMat); x = c1; }
  };
  floorStrips(D.platformZ0, D.rampZ0);
  slab(-9.6, 9.6, -0.3, 0, D.rampZ0, -1.7, hallFloorMat);
  slab(-9.6, 9.6, -0.3, 0, -19.4, D.platformZ0, hallFloorMat);
  const hallTop = under ? CEIL : PY - 1.2;
  for (const s of [-1, 1]) slab(s * 9.2 - 0.2, s * 9.2 + 0.2, 0, hallTop, -19, -1.7, wallMat(17.3, hallTop));
  slab(-9.4, 9.4, 0, hallTop, -19.4, -19, wallMat(18.8, hallTop));
  if (under) {
    ceiling(-9.4, 9.4, -19.4, -2);
  } else {
    for (let z = -4; z > -18; z -= 4) lamp(0, PY - 1.02, z, 6, 0.25);
    for (const s of [-1, 1]) posterAt(s + 3, s * 8.98, 1.6, -8, -s * Math.PI / 2);
  }
  solid(-9.6, -9, -19.6, -1.7);
  solid(9, 9.6, -19.6, -1.7);
  solid(-9.6, 9.6, -19.8, -19);

  /* ----- Escalator and stairs between hall and platform ----- */
  const rise = PY;
  const rampLen = Math.hypot(rise, rampRun);
  const rampAng = Math.atan2(rise, rampRun);
  const rampMesh = (x0, x1, m, yOff = 0, h = 0.3) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, h, rampLen), m);
    mesh.position.set((x0 + x1) / 2, rise / 2 - 0.15 + yOff, (D.rampZ0 + D.platformZ0) / 2);
    mesh.rotation.x = rampAng;
    scene.add(mesh);
    return mesh;
  };
  const grate = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#3e4044'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 4) { g.fillStyle = '#8a8d92'; g.fillRect(x, 0, 2, h); }
    g.fillStyle = '#e8b830'; g.fillRect(0, 0, 3, h); g.fillRect(w - 3, 0, 3, h);
  });
  const steps = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = css(classic ? 0x6a6560 : 0x9a9894); g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8b830'; g.fillRect(0, 0, w, 8);
  });
  for (const r of LAY.ramps) {
    rampMesh(r.x0, r.x1, r.esc ? texMat(grate, 3, 60, { metalness: 0.6, roughness: 0.4 }) : texMat(steps, 2, 44));
    for (const x of [r.x0 - 0.1, r.x1 + 0.1]) {
      // balustrade: glass and steel on escalators, a low wall beside stairs
      const bal = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, rampLen), r.esc ? glass : concrete);
      bal.position.set(x, rise / 2 + 0.45, (D.rampZ0 + D.platformZ0) / 2);
      bal.rotation.x = rampAng;
      scene.add(bal);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, rampLen), r.esc ? mat(0x111214, { roughness: 0.5 }) : steel);
      rail.position.set(x, rise / 2 + 0.95, (D.rampZ0 + D.platformZ0) / 2);
      rail.rotation.x = rampAng;
      scene.add(rail);
      solid(x - 0.1, x + 0.1, D.platformZ0 - 0.1, D.rampZ0 + 0.2, 'both');
    }
    if (under) {
      // the far end of each opening, at hall level, so you can't walk off the edge
      slab(r.x0 - 0.15, r.x1 + 0.15, 0, 1.0, D.platformZ0 - 0.1, D.platformZ0 + 0.1, glass);
      slab(r.x0 - 0.15, r.x1 + 0.15, 1.0, 1.06, D.platformZ0 - 0.12, D.platformZ0 + 0.12, steel);
      // side walls of the shaft, so the opening reads as a stairwell
      for (const x of [r.x0 - 0.2, r.x1 + 0.2]) slab(x - 0.05, x + 0.05, PY, -0.3, D.platformZ0, D.rampZ0, wallMat(rampRun, -PY));
    }
    const sgn = labelMesh(`${r.label} ${PY > 0 ? '▲' : '▼'}`, 2.0, 0.5);
    sgn.position.set((r.x0 + r.x1) / 2, 2.6, D.rampZ0 + 0.3);
    scene.add(sgn);
  }
  // rail across the top/bottom of the ramps at platform level, leaving the ramp openings
  const xsAround = (p) => {
    const out = [];
    let x = p.x0;
    for (const r of [...LAY.ramps].sort((a, b) => a.x0 - b.x0)) {
      if (r.x1 <= p.x0 || r.x0 >= p.x1) continue;
      if (r.x0 - 0.1 > x) out.push([x, r.x0 - 0.1]);
      x = r.x1 + 0.1;
    }
    if (x < p.x1) out.push([x, p.x1]);
    return out;
  };
  for (const p of LAY.platforms) {
    for (const [x0, x1] of xsAround(p)) {
      slab(x0, x1, PY, PY + 1.0, D.platformZ0 - 0.1, D.platformZ0 + 0.1, glass);
      slab(x0, x1, PY + 1.0, PY + 1.06, D.platformZ0 - 0.12, D.platformZ0 + 0.12, steel);
      solid(x0, x1, D.platformZ0 - 0.15, D.platformZ0 + 0.15, 'high');
    }
  }

  /* ----- Track structure ----- */
  const ZA = 300, ZB = -300; // tracks run far in both directions
  const trackbed = tm('gravel', under ? 0x4a4744 : 0x6a6660, 2.8, 600);
  trackbed.map.repeat.set(2, 500);
  const railMat = mat(0xa9acb2, { metalness: 0.85, roughness: 0.3 });
  const plinth = mat(0x8a8780);
  const thirdCover = mat(0xd9d6cc, { roughness: 0.6 });
  for (const t of LAY.tracks) {
    const cx = t.x;
    if (!under) slab(cx - 2.0, cx + 2.0, PY - 1.2, PY - 0.8, ZB, ZA, concrete);
    slab(cx - 1.4, cx + 1.4, PY - 0.8, PY - 0.7, ZB, ZA, trackbed);
    for (const dx of [-0.84, 0.84]) {
      slab(cx + dx - 0.2, cx + dx + 0.2, PY - 0.7, PY - 0.62, ZB, ZA, plinth);
      slab(cx + dx - 0.04, cx + dx + 0.04, PY - 0.62, PY - 0.5, ZB, ZA, railMat);
    }
    // third rail with its cover board, on the side away from the platform
    const away = st.platform === 'side' ? -Math.sign(cx) : Math.sign(cx);
    const tx = cx + away * 1.42;
    slab(tx - 0.05, tx + 0.05, PY - 0.7, PY - 0.55, ZB, ZA, mat(0x6a6c70, { metalness: 0.6 }));
    slab(tx - 0.16, tx + 0.16, PY - 0.5, PY - 0.47, ZB, ZA, thirdCover);
  }
  // Portal frames: piers just outside the hall walls with a crossbeam under both tracks.
  // Elevated stations have them everywhere; surface stations only where the track bridges the
  // concourse and the street (the rest sits on an embankment).
  const portal = (z) => {
    for (const s of [-1, 1]) {
      slab(s * 10 - 0.45, s * 10 + 0.45, 0, PY - 1.2, z - 0.45, z + 0.45, concrete);
      if (z > -19.5) solid(s * 10 - 0.5, s * 10 + 0.5, z - 0.5, z + 0.5);
    }
    slab(-10.4, 10.4, PY - 1.9, PY - 1.2, z - 0.5, z + 0.5, concrete);
  };
  if (kind === 'elevated') {
    for (let z = 250; z >= -250; z -= 14) portal(z);
  } else if (kind === 'surface') {
    slab(-10.5, 10.5, -0.1, PY - 1.2, ZB, -19.4, tm('board', 0x9a8f7a, 600, 4)); // embankment wall beyond the hall
    for (let z = 250; z > -19; z -= 14) portal(z);
    for (const s of [-1, 1]) {
      slab(s * 10 - 0.5, s * 10 + 0.5, 0, PY - 1.2, -19.4, -1.7, concrete); // underpass walls (the hall walls already block you)
    }
  } else {
    // tunnel box around the platform and tracks
    const tunnelWall = tm(fam.wall, fam.wallColor, 600, -PY + 1);
    for (const s of [-1, 1]) {
      slab(s * 9.8 - 0.2, s * 9.8 + 0.2, PY - 1, 0, ZB, ZA, tunnelWall);
      slab(s * 9.58 - 0.02, s * 9.58 + 0.02, PY - 1, PY + 0.3, ZB, ZA, mat(0x2a2826)); // soot-dark base
      slab(s * 9.58 - 0.02, s * 9.58 + 0.02, PY + 3.4, PY + 3.55, ZB, ZA, trim);
    }
    const under_ceil = mat(classic ? 0x5a554e : 0xd9dcde, { roughness: 0.9 });
    slab(-10, 10, -0.3, 0, ZB, -19.4, under_ceil);
    slab(-10, 10, -0.3, 0, 14, ZA, under_ceil);
    slab(-10, 10, PY - 1.1, PY - 0.8, ZB, ZA, mat(0x34302c));
    slab(-14, 14, -0.3, 0, -1.7, 14, under_ceil);
    if (fam.ceil === 'coffer' || fam.ceil === 'ribbed') {
      for (let z = -21; z > D.platformZ1 - 4; z -= 4) slab(-9.6, 9.6, -0.65, -0.3, z - 0.18, z + 0.18, under_ceil);
    }
  }

  /* ----- Platforms ----- */
  const roofY = PY + 4.4;
  const WAVE_W = 10.2, WAVE_DROP = 1.4, WAVE_R = (WAVE_W * WAVE_W + WAVE_DROP * WAVE_DROP) / (2 * WAVE_DROP);
  // Height of the underside of the platform roof (or tunnel ceiling) at x, for things hung from it.
  const roofAt = (x) => {
    if (under) return -0.3;
    if (fam.roof === 'wave' || fam.roof === 'glass') return roofY + WAVE_DROP + 0.4 - (WAVE_R - Math.sqrt(WAVE_R * WAVE_R - x * x));
    if (fam.roof === 'gable') return roofY + 0.15 + 0.7 * (1 - Math.abs(x) / 9.8);
    return roofY;
  };
  const centerCols = st.platform !== 'side' && ['gable', 'wave'].includes(fam.roof);
  const colX = centerCols ? [0] : LAY.columnX;
  const tactile = texFor('tactile', 0xe9c21b);
  const edgeStone = mat(0x6c6a66, { roughness: 0.7 });
  for (const p of LAY.platforms) {
    const pw = p.x1 - p.x0, plen = D.platformZ0 - D.platformZ1;
    slab(p.x0, p.x1, PY - 1.0, PY, D.platformZ1, D.platformZ0, concrete);
    plane(p.x0, p.x1, D.platformZ1, D.platformZ0, PY + 0.005, floorMat(pw, plen));
    // platform edge: a dark stone edge strip, then the yellow truncated-dome warning strip
    const edgeStrip = (x0, x1, m) => plane(x0, x1, D.platformZ1, D.platformZ0, PY + 0.012, m);
    const tMat = () => { const t = tactile.clone(); t.needsUpdate = true; t.repeat.set(1, plen / 0.6); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }); };
    for (const t of LAY.tracks) {
      if (Math.abs(t.x - p.x0) < 2.5) { edgeStrip(p.x0, p.x0 + 0.3, edgeStone); edgeStrip(p.x0 + 0.3, p.x0 + 0.9, tMat()); }
      if (Math.abs(t.x - p.x1) < 2.5) { edgeStrip(p.x1 - 0.3, p.x1, edgeStone); edgeStrip(p.x1 - 0.9, p.x1 - 0.3, tMat()); }
    }
    solid(p.x0 - 2, p.x0 + 0.15, D.platformZ1 - 1, D.platformZ0 - 0.2, 'high');
    solid(p.x1 - 0.15, p.x1 + 2, D.platformZ1 - 1, D.platformZ0 - 0.2, 'high');
    solid(p.x0 - 2, p.x1 + 2, D.platformZ1 - 2, D.platformZ1, 'high');
    // benches: wood slats on concrete (classic) or perforated steel (newer)
    const cx = (p.x0 + p.x1) / 2;
    const benchZ = centerCols ? [-30, -66] : [-36, -54, -72];
    for (const z of benchZ) {
      if (classic) {
        for (const dz of [-0.8, 0.8]) slab(cx - 0.2, cx + 0.2, PY, PY + 0.4, z + dz - 0.15, z + dz + 0.15, concrete);
        for (let k = -2; k <= 2; k++) slab(cx + k * 0.11 - 0.045, cx + k * 0.11 + 0.045, PY + 0.4, PY + 0.46, z - 1.05, z + 1.05, mat(0x8a5a32, { roughness: 0.7 }));
      } else {
        slab(cx - 0.3, cx + 0.3, PY + 0.4, PY + 0.45, z - 1, z + 1, steel);
        for (const dz of [-0.85, 0.85]) slab(cx - 0.05, cx + 0.05, PY, PY + 0.4, z + dz - 0.05, z + dz + 0.05, steel);
      }
      solid(cx - 0.35, cx + 0.35, z - 1.05, z + 1.05, 'high');
    }
    // trash bins and an emergency call box
    const bx = cx + (centerCols ? 1.3 : 0);
    for (const z of [-46, -78]) { cyl(0.28, 0.95, bx, PY, z, mat(classic ? 0x3a2c22 : 0x2c3238, { roughness: 0.5 }), 18); solid(bx - 0.3, bx + 0.3, z - 0.3, z + 0.3, 'high'); }
    slab(cx - 0.18, cx + 0.18, PY, PY + 1.5, -86.5, -86.2, mat(0x1f5fae));
    slab(cx - 0.08, cx + 0.08, PY + 1.5, PY + 1.62, -86.45, -86.25, new THREE.MeshBasicMaterial({ color: 0x5ab8ff, toneMapped: false }));
    // hanging station name signs, readable along the platform
    const signTop = roofAt(cx + 1);
    for (const z of [-28, -58, -82]) {
      for (const dz of [0.05, -0.05]) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.7), signMat);
        m.position.set(cx, PY + 2.75, z + dz);
        if (dz < 0) m.rotation.y = Math.PI;
        scene.add(m);
      }
      for (const dx of [-1, 1]) slab(cx + dx - 0.02, cx + dx + 0.02, PY + 3.1, signTop, z - 0.02, z + 0.02, steel);
    }
  }

  /* ----- Platform roof (open-air) or ceiling (underground) ----- */
  const roofMat = mat(fam.roofColor || 0xd2c7ab, { roughness: classic ? 0.9 : 0.4, side: THREE.DoubleSide });
  const zA = D.platformZ1, zB = D.platformZ0, zMid = (zA + zB) / 2, zLen = zB - zA;
  if (!under) {
    if (fam.roof === 'gable') {
      // 1972 aerial: shallow gable of concrete on a central spine, exposed ribs, dark fascia
      const half = 9.8, ridge = 0.7, ang = Math.atan2(ridge, half);
      for (const s of [-1, 1]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(half / Math.cos(ang) + 0.1, 0.3, zLen), roofMat);
        m.position.set(s * half / 2, roofY + ridge / 2 + 0.15, zMid);
        m.rotation.z = -s * ang;
        scene.add(m);
        slab(s * half - 0.1, s * half + 0.1, roofY - 0.55, roofY + 0.3, zA, zB, trim);
        lamp(s * 3.4, roofY - 0.37, zMid, 0.22, zLen - 4);
      }
      slab(-0.4, 0.4, roofY - 0.4, roofY + 0.7, zA, zB, concrete);
      for (let z = zA + 3; z < zB; z += 6) slab(-9.6, 9.6, roofY - 0.35, roofY, z - 0.15, z + 0.15, concrete);
    } else if (fam.roof === 'flat') {
      // original ground-level: flat concrete roof, deep fascia, a skylight down the middle
      slab(-9.5, -1.1, roofY, roofY + 0.35, zA, zB, roofMat);
      slab(1.1, 9.5, roofY, roofY + 0.35, zA, zB, roofMat);
      plane(-1.1, 1.1, zA, zB, roofY + 0.3, new THREE.MeshBasicMaterial({ color: 0xe8f1f8, toneMapped: false, side: THREE.DoubleSide }));
      for (const s of [-1, 1]) {
        slab(s * 9.5 - 0.1, s * 9.5 + 0.1, roofY - 0.9, roofY + 0.4, zA, zB, trim);
        slab(s * 1.15 - 0.08, s * 1.15 + 0.08, roofY - 0.3, roofY + 0.6, zA, zB, concrete);
        for (let z = zA + 5; z < zB; z += 10) lamp(s * 4.5, roofY - 0.01, z, 0.35, 3);
      }
    } else if (fam.roof === 'wave' || fam.roof === 'glass') {
      // newer stations: a white curved roof with a skylight along the ridge
      const halfW = WAVE_W, drop = WAVE_DROP, R = WAVE_R, a = Math.asin(halfW / R);
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(R, R, zLen, 64, 1, true, Math.PI - a, 2 * a), roofMat);
      shell.rotation.x = Math.PI / 2;
      shell.position.set(0, roofY + drop + 0.4 - R, zMid);
      scene.add(shell);
      const sky = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.05, R - 0.05, zLen, 8, 1, true, Math.PI - 0.035, 0.07), new THREE.MeshBasicMaterial({ color: 0xeaf4fb, toneMapped: false, side: THREE.DoubleSide }));
      sky.rotation.x = Math.PI / 2;
      sky.position.copy(shell.position);
      scene.add(sky);
      for (const s of [-1, 1]) slab(s * halfW - 0.1, s * halfW + 0.1, roofY + 0.2, roofY + 0.5, zA, zB, trim);
      for (let z = zA + 4; z < zB; z += 6) for (const x of [-5, 5]) {
        const dl = new THREE.Mesh(new THREE.CircleGeometry(0.2, 18), lampMat);
        dl.rotation.x = Math.PI / 2; dl.position.set(x, roofAt(x) - 0.03, z); scene.add(dl);
      }
      if (fam.roof === 'glass') {
        // airport: glass walls beyond the tracks with steel mullions
        for (const s of [-1, 1]) {
          slab(s * 9.9 - 0.03, s * 9.9 + 0.03, PY - 1, roofY + 0.4, zA, zB, glass);
          for (let z = zA; z <= zB; z += 3) slab(s * 9.9 - 0.06, s * 9.9 + 0.06, PY - 1, roofY + 0.4, z - 0.06, z + 0.06, whiteSteel);
        }
      }
    } else if (fam.roof === 'saw') {
      // Silicon Valley extension: big white roof folded into tilted panels, glass in the steps
      for (let z = zA; z < zB; z += 8) {
        const seg = Math.min(8, zB - z);
        const m = new THREE.Mesh(new THREE.BoxGeometry(20.4, 0.25, Math.hypot(seg, 1.6)), roofMat);
        m.position.set(0, roofY + 0.8, z + seg / 2);
        m.rotation.x = -Math.atan2(1.6, seg);
        scene.add(m);
        slab(-10.2, 10.2, roofY, roofY + 1.6, z + seg - 0.04, z + seg + 0.04, new THREE.MeshBasicMaterial({ color: 0xe6f0f7, toneMapped: false, transparent: true, opacity: 0.85 }));
        for (const x of [-6, 0, 6]) lamp(x, roofY + 0.2, z + seg / 2, 0.25, seg - 2);
      }
      for (const s of [-1, 1]) slab(s * 10.2 - 0.1, s * 10.2 + 0.1, roofY - 0.2, roofY + 0.3, zA, zB, trim);
    }
  } else {
    for (let z = -22; z > D.platformZ1; z -= 8) for (const x of LAY.columnX) lamp(x, -0.7, z, 0.24, 5);
    // station name on the tunnel walls, facing the platform across the tracks
    for (const z of [-30, -50, -70]) for (const s of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 1.2), signMat);
      m.position.set(s * 9.55, PY + 2.2, z);
      m.rotation.y = -s * Math.PI / 2;
      scene.add(m);
    }
    for (const [i, z] of [[0, -40], [1, -60], [2, -80]]) for (const s of [-1, 1]) posterAt(i + (s > 0 ? 3 : 0), s * 9.52, PY + 1.6, z, -s * Math.PI / 2);
  }
  // Columns
  const colTop = under ? -0.3 : roofY;
  const colMat = under ? tm(fam.col === 'steel' ? 'panel' : fam.col, fam.col === fam.wall ? fam.wallColor : (fam.col === 'steel' ? 0xe0e3e5 : 0xa8a197), 0.6, Math.abs(colTop - PY)) : null;
  for (let z = -24; z >= -84; z -= 12) {
    for (const x of colX) {
      if (under) {
        slab(x - 0.3, x + 0.3, PY, colTop, z - 0.3, z + 0.3, colMat);
      } else if (fam.col === 'round') {
        cyl(0.32, roofY - PY, x, PY, z, concrete, 24, 0.55);
      } else if (fam.col === 'square') {
        slab(x - 0.28, x + 0.28, PY, colTop, z - 0.28, z + 0.28, concrete);
      } else if (fam.col === 'tree') {
        cyl(0.2, 3.3, x, PY, z, whiteSteel, 18);
        for (const [dx, dz] of [[-3, -2.5], [3, -2.5], [-3, 2.5], [3, 2.5]]) rod(new THREE.Vector3(x, PY + 3.3, z), new THREE.Vector3(x + dx, roofAt(x + dx), z + dz), 0.08, whiteSteel);
      } else {
        cyl(0.2, roofAt(x) - PY, x, PY, z, whiteSteel, 18);
      }
      solid(x - 0.35, x + 0.35, z - 0.35, z + 0.35, 'high');
    }
  }

  /* ----- Scenery around open-air stations ----- */
  if (!under) {
    const trunkMat = mat(0x5a4636);
    const crownMats = [mat(0x4b6b32), mat(0x5a7a3a), mat(0x3f5e2c), mat(0x6a7a3a)];
    const treeAt = (x, z, s = 1) => {
      cyl(0.25 * s, 3 * s, x, 0, z, trunkMat, 8);
      const cone = rand() < 0.3;
      const crown = new THREE.Mesh(cone ? new THREE.ConeGeometry(1.8 * s, 7 * s, 10) : new THREE.SphereGeometry(2.6 * s, 12, 10), crownMats[Math.floor(rand() * crownMats.length)]);
      crown.position.set(x, (cone ? 5.5 : 4.6) * s, z);
      if (!cone) crown.scale.y = 1.1;
      scene.add(crown);
    };
    const freeway = FREEWAY.has(st.abbr);
    for (let i = 0; i < 28; i++) {
      const side = rand() > 0.5 ? 1 : -1;
      treeAt(side * (freeway ? 50 + rand() * 30 : 16 + rand() * 9), 60 - rand() * 220, 0.8 + rand() * 0.6);
    }
    // buildings with window grids; taller in Oakland and around the newer transit villages
    const tall = ['WOAK', 'MCAR', 'FTVL', 'COLS', 'PHIL', 'WCRK', 'MLPT', 'BERY', 'DUBL'].includes(st.abbr);
    const bColors = [0xd9cfbd, 0xc9b9a0, 0xe6e2d8, 0xb7a58e, 0xcfd3d6, 0xa98f7a];
    for (let i = 0; i < 14; i++) {
      const side = i % 2 ? 1 : -1, w = 12 + rand() * 18, d = 12 + rand() * 20, h = 7 + rand() * (tall ? 34 : 12);
      const x = side * (freeway ? 95 + rand() * 40 : (side > 0 ? 95 : 50) + rand() * 40), z = 50 - i * 22 - rand() * 10;
      const c = bColors[i % bColors.length];
      slab(x - w / 2, x + w / 2, 0, h, z - d / 2, z + d / 2, tm('facade', c, Math.max(w, d), h, { roughness: 0.7 }));
      slab(x - w / 2 - 0.2, x + w / 2 + 0.2, h, h + 0.4, z - d / 2 - 0.2, z + d / 2 + 0.2, mat(0x5b5550));
    }
    // golden East Bay hills on the horizon
    for (const [x, y, z, s, c] of [[-120, -40, -420, 190, 0xb5a46a], [140, -40, -460, 220, 0xa89a5e], [0, -55, -560, 260, 0x8f9a63], [-300, -45, 120, 220, 0xb0a06a], [320, -50, 60, 240, 0x9fa067]]) {
      const hill = new THREE.Mesh(new THREE.SphereGeometry(s, 32, 14), mat(c, { roughness: 1 }));
      hill.position.set(x, y, z);
      hill.scale.y = 0.38;
      scene.add(hill);
    }
    // cars: parked in the lot, or driving on the freeway
    const carColors = [0xf2f2f0, 0x1c1d20, 0x8a9096, 0xb02a2a, 0x2a4a8a, 0xc9c9c4, 0x3a5a3a, 0xd9b04a];
    const carGlass = mat(0x1d262e, { roughness: 0.15, metalness: 0.3 });
    const makeCar = () => {
      const g = new THREE.Group();
      const bm = mat(carColors[Math.floor(rand() * carColors.length)], { metalness: 0.5, roughness: 0.3 });
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 4.4), bm); b.position.y = 0.6; g.add(b);
      const c = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 2.3), carGlass); c.position.set(0, 1.22, -0.2); g.add(c);
      for (const [x, z] of [[-0.8, -1.4], [0.8, -1.4], [-0.8, 1.4], [0.8, 1.4]]) {
        const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 12), mat(0x18191b)); wh.rotation.z = Math.PI / 2; wh.position.set(x, 0.33, z); g.add(wh);
      }
      scene.add(g);
      return g;
    };
    if (freeway) {
      const laneTex = canvasTex(256, 256, (g, w, h) => {
        g.fillStyle = '#55575a'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 2000; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.08})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
        g.fillStyle = '#f2f2ee';
        for (const x of [w * 0.25, w * 0.5, w * 0.75]) for (let y = 0; y < h; y += 64) g.fillRect(x - 2, y, 4, 30);
        g.fillStyle = '#e8c23a'; g.fillRect(6, 0, 5, h);
        g.fillStyle = '#f2f2ee'; g.fillRect(w - 10, 0, 5, h);
      });
      // The freeway runs on a raised roadway on both sides of the station and bridges the street.
      const FH = 5.2, barrierMat = mat(0xc2bfb8);
      for (const s of [-1, 1]) {
        const xa = Math.min(s * 25, s * 41), xb = Math.max(s * 25, s * 41);
        plane(xa, xb, -400, 400, FH + 0.01, texMat(laneTex, 1, 60));
        slab(xa, xb, FH - 0.7, FH, -400, 400, concrete);
        slab(xa, xb, 0, FH - 0.7, -400, 16, tm('board', 0xb3ada2, 400, FH));
        slab(xa, xb, 0, FH - 0.7, 76, 400, tm('board', 0xb3ada2, 400, FH));
        for (const z of [30, 46, 62]) slab(s * 33 - 0.8, s * 33 + 0.8, 0, FH - 0.7, z - 0.8, z + 0.8, concrete);
        for (const x of [s * 25.3, s * 40.7]) slab(x - 0.25, x + 0.25, FH, FH + 0.9, -400, 400, barrierMat);
        for (let i = 0; i < 14; i++) {
          const car = makeCar();
          const lane = 27 + Math.floor(rand() * 4) * 3.6;
          car.position.set(s * lane, FH, -400 + rand() * 800);
          const v = (24 + rand() * 9) * -s; // right-hand traffic
          car.rotation.y = v > 0 ? 0 : Math.PI;
          animators.push((dt) => { car.position.z += v * dt; if (car.position.z > 400) car.position.z -= 800; if (car.position.z < -400) car.position.z += 800; });
        }
      }
    } else {
      // the classic BART park-and-ride lot
      const lotTex = canvasTex(256, 256, (g, w, h) => {
        g.fillStyle = '#4d4f52'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 2000; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.07})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
        g.fillStyle = '#eeeeea';
        for (let y = 0; y < h; y += 32) { g.fillRect(0, y, w * 0.42, 3); g.fillRect(w * 0.58, y, w * 0.42, 3); }
      });
      plane(28, 86, -60, 60, 0.01, texMat(lotTex, 2, 8));
      for (const zc of [-60, -30, 0, 30]) for (const xr of [30, 52, 70]) {
        for (let k = 0; k < 10; k++) {
          if (rand() < 0.3) continue;
          const car = makeCar();
          car.position.set(xr + (k % 2 ? 6.4 : 0), 0, zc + 2 + Math.floor(k / 2) * 2.6);
          car.rotation.y = Math.PI / 2 + (k % 2 ? Math.PI : 0);
          // parked cars never move: hand their parts to the scene so they merge with the static meshes
          car.updateMatrixWorld();
          for (const part of [...car.children]) scene.attach(part);
          scene.remove(car);
        }
      }
      for (let z = -55; z <= 55; z += 22) { cyl(0.1, 9, 44, 0, z, mat(0x8f9399, { metalness: 0.5 })); lamp(44, 9, z, 1.2, 0.4); }
    }
  }

  /* ----- Trains and departure boards ----- */
  // A 3-car train (BART runs longer trains; 3 cars fit the modeled platform). Each track serves one
  // direction: South on the +x track, North on the -x track. Trains stand at the platform until the
  // estimated departure time, then pull out.
  const APPROACH = 20, DWELL = 35, DEPART = 8, FAR = 170;
  const CL = 21.3, CG = 0.7;
  const CAR_Z = [-(CL + CG), 0, CL + CG];
  const DOOR_Z = CAR_Z.flatMap((c) => [-6.9, 0, 6.9].map((d) => c + d));
  let skew = 0;
  const nowMs = () => Date.now() + skew;
  const live = { rows: null, at: 0, note: 'Waiting for train data…', demo: true };

  // Fleet of the Future cars (see fleet.js), the same model at every station.
  const makeTrain = () => {
    const train = buildFleetTrain({ cars: 3, carLength: CL, gap: CG, floorY: PY, doorZ: [-6.9, 0, 6.9] });
    train.group.visible = false;
    scene.add(train.group);
    return train;
  };
  const tracks = LAY.tracks.map((t, i) => {
    const train = makeTrain();
    const g = train.group;
    g.position.x = t.x;
    train.setHeading(t.dir === 'South' ? -1 : 1);
    const c = document.createElement('canvas');
    c.width = 512; c.height = 160;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return { ...t, i, s: t.dir === 'South' ? 1 : -1, g, train, lineKey: '', tracked: null, phase: 'none', canvas: c, tex, bm: new THREE.MeshBasicMaterial({ map: tex }) };
  });
  const rowsForTrack = (t) => (live.rows || []).filter((r) => (r.direction || 'South') === t.dir);
  const fmtRemain = (sec) => (sec < 45 ? 'Leaving' : `${Math.ceil(sec / 60)} min`);
  const drawBoard = (t) => {
    const g = t.canvas.getContext('2d');
    g.fillStyle = '#140808'; g.fillRect(0, 0, 512, 160);
    g.fillStyle = '#ff4a3a'; g.textBaseline = 'top'; g.font = 'bold 26px monospace';
    const elapsed = (nowMs() - live.at) / 1000;
    const rows = live.demo ? [{ destination: 'Demo train', minutes: null }] : rowsForTrack(t).slice(0, 3);
    if (!rows.length) g.fillText('No trains listed', 14, 14);
    rows.forEach((r, i) => {
      g.textAlign = 'left'; g.fillText(r.destination.slice(0, 16), 14, 10 + i * 34);
      g.textAlign = 'right';
      g.fillText(r.minutes == null ? '' : `${r.cars ? r.cars + 'c ' : ''}${fmtRemain(Math.max(0, r.minutes * 60 - elapsed))}`, 498, 10 + i * 34);
    });
    g.textAlign = 'right'; g.font = '16px monospace';
    g.fillText(`${t.dir}bound${rows[0] && rows[0].platform ? ` · Platform ${rows[0].platform}` : ''}`, 498, 136);
    t.tex.needsUpdate = true;
  };
  const boardFrame = mat(0x2a2a2e);
  for (const t of tracks) {
    const x = LAY.boardX[t.i];
    for (const z of [-42, -68]) {
      slab(x - 1.3, x + 1.3, PY + 3.05, PY + 3.85, z - 0.06, z + 0.06, boardFrame);
      slab(x - 0.03, x + 0.03, PY + 3.85, roofAt(x), z - 0.03, z + 0.03, boardFrame);
      for (const dz of [0.08, -0.08]) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.75), t.bm);
        p.position.set(x, PY + 3.45, z + dz);
        if (dz < 0) p.rotation.y = Math.PI;
        scene.add(p);
      }
    }
  }

  const syncTrack = (t, cand, at) => {
    const cur = t.tracked;
    const sec = cur ? (at - cur.etaAt) / 1000 : null;
    if (cur && sec >= -DWELL && sec < DEPART) return; // standing or pulling out: leave it alone
    if (!cand) { if (!cur || sec >= DEPART) t.tracked = null; return; }
    const etaAt = at + (cand.minutes === 0 ? 30 : cand.minutes * 60) * 1000;
    if (cur && sec < -DWELL && cur.destAbbr === cand.destAbbr) { cur.etaAt = etaAt; return; }
    t.tracked = { etaAt, hex: cand.hex, dest: cand.destination, destAbbr: cand.destAbbr, direction: cand.direction || t.dir, cars: cand.cars };
  };
  const setLive = (rows, note) => {
    const at = nowMs();
    live.at = at;
    live.demo = !rows;
    live.rows = rows ? rows.filter((r) => !r.cancelled && r.minutes !== null) : null;
    live.note = note || (rows ? 'Live data' : 'Demo timing');
    for (const t of tracks) syncTrack(t, live.rows && rowsForTrack(t)[0], at);
    renderHud();
  };
  const updateTrains = () => {
    const at = nowMs();
    if (live.demo) {
      const t = tracks[0];
      if (!t.tracked || (at - t.tracked.etaAt) / 1000 > DEPART) t.tracked = { etaAt: at + (APPROACH + DWELL + 5) * 1000, hex: null, dest: 'Demo train', destAbbr: null, direction: t.dir, cars: '' };
    }
    for (const t of tracks) {
      const cur = t.tracked;
      let phase = 'none', off = 0;
      if (cur) {
        const sec = (at - cur.etaAt) / 1000;
        if (sec < -(APPROACH + DWELL)) phase = 'none';
        else if (sec < -DWELL) { phase = 'approach'; off = t.s * FAR * (1 - easeOut((sec + APPROACH + DWELL) / APPROACH)); }
        else if (sec < 0) phase = 'dwell';
        else if (sec < DEPART) { phase = 'depart'; off = -t.s * FAR * easeIn(sec / DEPART); }
        else t.tracked = null;
      }
      t.phase = phase;
      t.g.visible = phase !== 'none';
      t.g.position.z = D.trainStopZ + off;
      if (cur) {
        const key = `${cur.hex}|${cur.dest}`;
        if (key !== t.lineKey) { t.lineKey = key; t.train.setLine(cur.hex, cur.dest); }
      }
    }
  };

  /* ----- Inside the train (shared with Bay Fair) ----- */
  const ride = createTrainRide(scene, { floorY: PY, x: 400 });

  /* ----- Game state, HUD ----- */
  const game = {
    balance: Number(opts.balance) || 0, gatesOpen: false, openUntil: 0, flash: 0,
    steps: { funds: false, tapped: false, platform: false, boarded: false },
    onBoard: false, sitting: null, arrived: false,
  };
  const hud = document.createElement('div');
  hud.className = 'bf-hud';
  hud.innerHTML = `
    <div class="bf-top">
      <ol class="bf-steps"></ol>
      <div class="bf-ride" hidden></div>
      <div class="bf-wallet"><div class="bf-bal"></div><div class="bf-live"></div></div>
    </div>
    <div class="bf-toast" role="status" aria-live="polite"></div>
    <div class="bf-prompt" aria-live="polite"></div>
    <div class="bf-board" hidden><strong></strong><span></span><div class="bf-board-btns"><button type="button" data-act="get-off" hidden>Get off here</button><button type="button" data-act="ride-again">Ride again</button><button type="button" data-act="reset"></button></div></div>
    <div class="bf-pad" aria-label="Touch controls">
      <div class="bf-dpad">
        <button type="button" data-hold="f" aria-label="Walk forward">▲</button>
        <button type="button" data-hold="l" aria-label="Step left">◀</button>
        <button type="button" data-hold="b" aria-label="Walk back">▼</button>
        <button type="button" data-hold="r" aria-label="Step right">▶</button>
      </div>
      <button type="button" class="bf-act" data-act="interact">Use</button>
    </div>
    <p class="bf-help">Click the view, then use W A S D or arrow keys to walk, drag to look, E to use things, Shift to run.</p>`;
  host.append(hud);
  const $ = (sel) => hud.querySelector(sel);
  const stepsEl = $('.bf-steps'), walletEl = $('.bf-bal'), liveEl = $('.bf-live'), toastEl = $('.bf-toast'), promptEl = $('.bf-prompt'), boardEl = $('.bf-board'), rideEl = $('.bf-ride');
  $('[data-act="reset"]').textContent = `Back to the ${st.name} entrance`;

  const upWord = PY > 0 ? 'up' : 'down';
  const STEP_LABELS = [
    ['funds', 'Add money at a ticket machine'],
    ['tapped', 'Tap your card at a fare gate'],
    ['platform', `Take the escalator or stairs ${upWord}`],
    ['boarded', 'Board the train when the doors open'],
  ];
  const renderHud = () => {
    stepsEl.replaceChildren(...STEP_LABELS.map(([k, label]) => {
      const li = document.createElement('li');
      li.textContent = label;
      if (game.steps[k]) li.className = 'done';
      return li;
    }));
    walletEl.textContent = `Card balance (demo): $${game.balance.toFixed(2)}`;
    liveEl.textContent = live.note;
    stepsEl.hidden = game.onBoard;
    rideEl.hidden = !game.onBoard;
    const r = game.onBoard && ride.state;
    if (r) {
      const status = { boarding: 'Doors open', closing: 'Doors closing', moving: `Next stop: ${r.next}`, arriving: `Now arriving: ${r.next}`, arrived: `Arrived at ${r.next}` }[r.phase];
      rideEl.replaceChildren();
      const a = document.createElement('strong'); a.textContent = `Train to ${r.dest}`;
      const b = document.createElement('span'); b.textContent = `${status} · ${Math.round(r.speed * 3.6)} km/h${r.remaining > 0 ? ` · ${r.remaining} more stop${r.remaining === 1 ? '' : 's'}` : ''}`;
      const c = document.createElement('span'); c.className = 'bf-ride-tip';
      c.textContent = r.here ? `Doors open at ${r.here.name}. Walk to a door on the left and press E to get off.`
        : game.sitting ? 'Sitting. Press E or walk to stand up.' : 'Walk around the car. Press E near a seat to sit.';
      rideEl.append(a, b, c);
    }
  };
  let toastTimer = 0;
  const toast = (text, ms = 4000) => {
    toastEl.textContent = text;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('on'), ms);
  };
  const beep = (freq = 880, dur = 0.12) => {
    try {
      const ac = beep.ac || (beep.ac = new (window.AudioContext || window.webkitAudioContext)());
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = freq; o.type = 'sine';
      g.gain.setValueAtTime(0.08, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
      o.connect(g).connect(ac.destination);
      o.start(); o.stop(ac.currentTime + dur);
    } catch { /* audio is optional */ }
  };
  const chime = (notes) => notes.forEach(([f, d], i) => setTimeout(() => beep(f, d), i * 260));

  const P = { x: 0, z: 12, y: 0, yaw: 0, pitch: -0.05 };
  const plat0 = LAY.platforms[0];
  const SPOTS = {
    entrance: { x: 0, z: under ? 5 : 20, yaw: 0 },
    machines: { x: 6.5, z: 3, yaw: 0 },
    gates: { x: 0, z: 3.5, yaw: 0 },
    hall: { x: 0, z: -7, yaw: 0 },
    platform: { x: (plat0.x0 + plat0.x1) / 2, z: -22, yaw: 0 },
    // beside the +x (southbound) track, facing it
    'platform-train': st.platform === 'side' ? { x: 5.4, z: -45, yaw: Math.PI / 2 } : { x: 1.8, z: -45, yaw: -Math.PI / 2 },
  };

  const onRamp = (x, z) => z <= D.rampZ0 && z >= D.platformZ0 && LAY.ramps.some((r) => inBand(r, x));
  const groundAt = (x, z, curY) => {
    if (onRamp(x, z)) return ((D.rampZ0 - z) / rampRun) * rise;
    if (z < D.platformZ0 && onPlatformX(x) && atPlatform(curY)) return PY;
    return 0;
  };
  // Escalators carry you toward the platform (up or down).
  const escalatorAt = (x, z) => onRamp(x, z) && LAY.ramps.some((r) => r.esc && inBand(r, x));

  const keys = new Set();
  const touch = { f: 0, b: 0, l: 0, r: 0 };
  const paidSide = () => P.z < D.gateZ;
  const nearGates = () => P.y > -1 && P.y < 1 && Math.abs(P.x) < 4.6 && P.z > -3.4 && P.z < 2.4;

  const interactables = [
    {
      test: () => P.y > -1 && P.y < 1 && Math.hypot(P.x - 6.5, P.z - 0.6) < 2.6 && P.z > 0.4,
      label: () => `Press E: add $${D.topUp} to your card (demo)`,
      run() { game.balance += D.topUp; game.steps.funds = true; beep(660); toast(`Added $${D.topUp}. Balance is $${game.balance.toFixed(2)}. Now walk to the fare gates.`); },
    },
    {
      test: () => nearGates() && !paidSide(),
      label: () => (game.gatesOpen ? 'Gates are open, walk through' : `Press E: tap your card at the gate (demo fare $${D.fare.toFixed(2)})`),
      run() {
        if (game.gatesOpen) return;
        if (game.balance < D.fare) { game.flash = 1.2; beep(220, 0.3); toast('The gate shows a red X: not enough value. Add money at a ticket machine first.'); return; }
        game.balance -= D.fare;
        game.steps.tapped = true;
        game.gatesOpen = true;
        game.openUntil = performance.now() + 10_000;
        beep(990);
        toast(`Tap accepted, $${D.fare.toFixed(2)} charged. Walk through the green arrows.`);
      },
    },
    {
      test: () => nearGates() && paidSide(),
      label: () => (game.gatesOpen ? 'Gates are open, walk through' : 'Press E: tap out to leave the station'),
      run() { if (game.gatesOpen) return; game.gatesOpen = true; game.openUntil = performance.now() + 10_000; beep(990); toast(`Tapped out at ${st.name}. Thanks for riding (demo).`); },
    },
    {
      test: () => P.y > -1 && P.y < 1 && Math.hypot(P.x + 7, P.z - 3.4) < 2.6,
      label: () => 'Press E: talk to the station agent',
      run() { toast(`Station agent: "Welcome to ${st.name}. Add value at the machines, then tap in at the gates. The platform is ${upWord} the escalator or stairs past the gates."`, 6000); },
    },
    {
      test: () => game.steps.platform && !!boardable(),
      label: () => 'Press E: board the train',
      run() { const t = boardable(); if (t) { game.steps.boarded = true; startRide(t.tracked); } },
    },
  ];
  const nearestSeat = () => {
    let best = null, bd = 0.9;
    for (const s of ride.seats) { const d = Math.hypot(P.x - s.x, P.z - s.z); if (d < bd) { bd = d; best = s; } }
    return best;
  };
  const rideActs = [
    {
      // Doors open at a station and you're standing in a doorway: step off here.
      test: () => !game.sitting && !!(ride.state && ride.state.here) && atLeftDoor(P.x, P.z),
      label: () => `Press E: get off at ${ride.state.here.name}`,
      run() { getOff(ride.state.here.index); },
    },
    { test: () => !!game.sitting, label: () => 'Press E: stand up', run() { standUp(); } },
    {
      test: () => !game.sitting && !!nearestSeat(),
      label: () => (nearestSeat().priority ? 'Press E: sit down (priority seat)' : 'Press E: sit down'),
      run() { const s = nearestSeat(); game.sitting = { x0: P.x, z0: P.z }; P.x = s.x; P.z = s.z; P.yaw = s.yaw; P.pitch = -0.08; renderHud(); },
    },
  ];
  const standUp = () => { if (!game.sitting) return; P.x = game.sitting.x0; P.z = game.sitting.z0; game.sitting = null; renderHud(); };

  let rideInfo = null;
  const startRide = (train) => {
    // The network knows every stop this train makes; fall back to just the next stop.
    const req = { from: st.abbr, destAbbr: train.destAbbr, hex: train.hex, direction: train.direction };
    const route = (opts.route && train.destAbbr && opts.route(req)) || [];
    const nx = route[0] || (opts.nextStop && train.destAbbr && opts.nextStop(req)) || null;
    const stops = route.length ? route : nx ? [nx] : [];
    rideInfo = { train, next: nx, stops };
    game.onBoard = true;
    game.arrived = false;
    game.sitting = null;
    boardEl.hidden = true;
    const nextName = nx ? nx.name : 'the next station';
    ride.start({ dest: train.dest, color: train.hex, next: nextName, stops: stops.map((x) => x.name), from: st.name });
    P.x = -0.95; P.z = 0; P.y = 0; P.yaw = -Math.PI / 2; P.pitch = -0.05;
    beep(520, 0.2);
    toast(`Welcome aboard the train to ${train.dest}. Next stop: ${nextName}.`, 4500);
    renderHud();
  };
  const stopRide = () => { ride.stop(); game.onBoard = false; game.sitting = null; game.arrived = false; };
  // Step off at stop `index` of the route: load that station with you on its platform.
  const getOff = (index) => {
    const stop = rideInfo && rideInfo.stops[index];
    if (stop && stop.abbr && opts.onExit) { opts.onExit(stop.abbr, { balance: game.balance }); return; }
    // Not a station we can load (no network data): end the demo ride with the menu.
    boardEl.querySelector('strong').textContent = `You got off at ${ride.state ? ride.state.here?.name || ride.state.next : 'the station'}.`;
    boardEl.querySelector('span').textContent = `That's the end of the demo ride. You can ride again or go back to ${st.name}.`;
    $('[data-act="get-off"]').hidden = true;
    boardEl.hidden = false;
  };
  const onRideEvent = (e, r) => {
    if (e === 'closing') { chime([[784, 0.18], [659, 0.18], [523, 0.32]]); toast('Doors closing. Please stand clear.'); }
    if (e === 'departed') toast(`Next stop: ${r.next}${r.last ? ', the last stop' : ''}.`);
    if (e === 'arriving') { chime([[523, 0.2], [659, 0.3]]); toast(`Now arriving at ${r.next}${r.last ? ', the last stop on this train' : ''}. Doors will open on the left.`, 5000); }
    if (e === 'opened') {
      game.arrived = true;
      chime([[523, 0.18], [659, 0.18], [784, 0.3]]);
      if (!r.last) { toast(`This is ${r.next}. To get off, walk to a door on the left and press E.`, 6000); return; }
      toast(`This is ${r.next}, the last stop. Everyone please leave the train: walk to a door and press E.`, 7000);
      // End of the line: if you stay on, offer the menu after a while.
      setTimeout(() => {
        const now = ride.state;
        if (!game.onBoard || !now || !now.last || now.phase !== 'arrived') return;
        const canExit = !!(rideInfo && rideInfo.stops.length && opts.onExit);
        boardEl.querySelector('strong').textContent = `End of the line: ${r.next}.`;
        boardEl.querySelector('span').textContent = canExit ? `This train doesn't go any further. Get off to walk around ${r.next}, ride again, or go back to ${st.name}.` : `You can ride again or go back to ${st.name}.`;
        $('[data-act="get-off"]').hidden = !canExit;
        $('[data-act="get-off"]').textContent = `Get off at ${r.next}`;
        boardEl.hidden = false;
      }, 10_000);
    }
  };
  const boardable = () => tracks.find((t) => {
    if (t.phase !== 'dwell' || !atPlatform(P.y)) return false;
    const d = Math.abs(P.x - t.x);
    if (d < 1.6 || d > 4.5) return false;
    return DOOR_Z.some((dz) => Math.abs(P.z - (D.trainStopZ + dz)) < 1.9);
  });
  let activeAct = null;
  const interact = () => { if (activeAct) { activeAct.run(); renderHud(); } };

  const teleport = (name) => {
    if (game.onBoard) { stopRide(); boardEl.hidden = true; renderHud(); }
    const s = SPOTS[name] || SPOTS.entrance;
    P.x = s.x; P.z = s.z; P.yaw = s.yaw; P.pitch = -0.05;
    P.y = name.startsWith('platform') ? PY : groundAt(P.x, P.z, 0);
  };
  const reset = (spot = 'entrance') => {
    stopRide();
    Object.assign(game, { gatesOpen: false, openUntil: 0, flash: 0, onBoard: false, steps: { funds: game.balance >= D.fare, tapped: false, platform: false, boarded: false } });
    boardEl.hidden = true;
    teleport(spot);
    renderHud();
  };

  /* ----- Input ----- */
  const KEYMAP = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };
  const onKeyDown = (e) => {
    if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat) interact(); return; }
    if (KEYMAP[e.code]) { e.preventDefault(); keys.add(KEYMAP[e.code]); }
    if (e.key === 'Shift') keys.add('run');
  };
  const onKeyUp = (e) => { if (KEYMAP[e.code]) keys.delete(KEYMAP[e.code]); if (e.key === 'Shift') keys.delete('run'); };
  const onBlur = () => keys.clear();
  host.addEventListener('keydown', onKeyDown);
  host.addEventListener('keyup', onKeyUp);
  host.addEventListener('blur', onBlur);

  let dragging = false, lastX = 0, lastY = 0;
  canvas.addEventListener('pointerdown', (e) => { host.focus({ preventScroll: true }); dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    P.yaw -= (e.clientX - lastX) * 0.005;
    P.pitch = clamp(P.pitch - (e.clientY - lastY) * 0.005, -1.2, 1.2);
    lastX = e.clientX; lastY = e.clientY;
  });
  const stopDrag = () => { dragging = false; };
  canvas.addEventListener('pointerup', stopDrag);
  canvas.addEventListener('pointercancel', stopDrag);
  hud.addEventListener('pointerdown', (e) => {
    const hold = e.target.closest('[data-hold]');
    if (hold) { touch[hold.dataset.hold] = 1; hold.setPointerCapture(e.pointerId); e.preventDefault(); }
  });
  const release = (e) => { const hold = e.target.closest && e.target.closest('[data-hold]'); if (hold) touch[hold.dataset.hold] = 0; };
  hud.addEventListener('pointerup', release);
  hud.addEventListener('pointercancel', release);
  hud.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (!act) return;
    if (act.dataset.act === 'interact') interact();
    if (act.dataset.act === 'reset') reset('entrance');
    if (act.dataset.act === 'ride-again' && rideInfo) startRide(rideInfo.train);
    if (act.dataset.act === 'get-off' && rideInfo && rideInfo.stops.length) getOff(rideInfo.stops.length - 1);
  });

  /* ----- Movement and collisions ----- */
  const collide = (list = colliders, high = atPlatform(P.y)) => {
    for (const c of list) {
      if (c.level === 'low' && high) continue;
      if (c.level === 'high' && !high) continue;
      if (c.when && !c.when()) continue;
      const cx = clamp(P.x, c.x0, c.x1), cz = clamp(P.z, c.z0, c.z1);
      const dx = P.x - cx, dz = P.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= D.radius * D.radius) continue;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2), push = D.radius - d;
        P.x += (dx / d) * push; P.z += (dz / d) * push;
      } else {
        const o = [[P.x - c.x0, -1, 0], [c.x1 - P.x, 1, 0], [P.z - c.z0, 0, -1], [c.z1 - P.z, 0, 1]].sort((a, b) => a[0] - b[0])[0];
        P.x += o[1] * (o[0] + D.radius); P.z += o[2] * (o[0] + D.radius);
      }
    }
    if (list !== colliders) return;
    if (under) P.x = clamp(P.x, -13.5, 13.5); else P.x = clamp(P.x, -23, 23);
    P.z = clamp(P.z, -88.5, under ? 13.5 : 40);
  };

  const step = (dt) => {
    const f = (keys.has('f') || touch.f ? 1 : 0) - (keys.has('b') || touch.b ? 1 : 0);
    const s = (keys.has('r') || touch.r ? 1 : 0) - (keys.has('l') || touch.l ? 1 : 0);
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
    const len = Math.hypot(f, s) || 1;
    if (game.onBoard) {
      if (game.sitting) { if (f || s) standUp(); else return; }
      P.x += ((fx * f + rx * s) / len) * D.walk * 0.7 * dt;
      P.z += ((fz * f + rz * s) / len) * D.walk * 0.7 * dt;
      collide(ride.colliders, true);
      P.x = clamp(P.x, -ride.bounds.x, ride.bounds.x);
      P.z = clamp(P.z, -ride.bounds.z, ride.bounds.z);
      return;
    }
    const speed = keys.has('run') ? D.run : D.walk;
    P.x += ((fx * f + rx * s) / len) * speed * dt;
    P.z += ((fz * f + rz * s) / len) * speed * dt;
    if (escalatorAt(P.x, P.z)) P.z -= D.escalatorSpeed * dt;
    collide();
    const target = groundAt(P.x, P.z, P.y);
    P.y += (target - P.y) * Math.min(1, dt * 12);
    if (!game.steps.platform && atPlatform(P.y) && P.z < D.platformZ0 - 0.5) {
      game.steps.platform = true;
      toast('You made it to the platform. Wait for a train and board when the doors open.');
      renderHud();
    }
    if (game.gatesOpen && performance.now() > game.openUntil && !(nearGates() && Math.abs(P.z - D.gateZ) < 1.2)) game.gatesOpen = false;
    if (game.flash > 0) game.flash -= dt;
  };

  // The station is built from well over a thousand simple pieces. Pieces that never move are merged
  // into one mesh per material, so the GPU draws a few hundred things instead of thousands.
  const mergeStatic = () => {
    const groups = new Map();
    for (const o of [...scene.children]) {
      if (!o.isMesh || o.userData.dynamic || Array.isArray(o.material) || !o.geometry.index) continue;
      const attrs = Object.keys(o.geometry.attributes).sort().join();
      if (attrs !== 'normal,position,uv') continue;
      const key = o.material.uuid;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(o);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const geos = list.map((o) => { o.updateMatrix(); return o.geometry.clone().applyMatrix4(o.matrix); });
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      for (const o of list) { scene.remove(o); o.geometry.dispose(); }
      scene.add(new THREE.Mesh(merged, list[0].material));
    }
  };
  mergeStatic();

  // Everything solid casts and catches the sun's shadows (open-air stations only).
  if (!under) {
    scene.traverse((o) => {
      if (!o.isMesh || o.material.isMeshBasicMaterial || o.material.transparent) return;
      o.castShadow = true;
      o.receiveShadow = true;
    });
  }

  /* ----- Render loop ----- */
  const resize = () => {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  if (opts.spawn === 'platform') {
    // arrived by train: already paid and on the platform
    Object.assign(game.steps, { funds: true, tapped: true, platform: true });
    teleport('platform-train');
    toast(`Welcome to ${st.name}. Tap out at the gates to leave, or catch another train.`, 5000);
  } else {
    teleport('entrance');
  }
  renderHud();

  let last = 0, hudTick = 0, boardTick = 99;
  renderer.setAnimationLoop((ms) => {
    const dt = Math.min(0.05, last ? (ms - last) / 1000 : 0.016);
    last = ms;
    step(dt);
    updateTrains();
    for (const a of animators) a(dt);
    boardTick += dt;
    if (boardTick > 1) { boardTick = 0; for (const t of tracks) drawBoard(t); }
    const showOk = game.gatesOpen, showNo = game.flash > 0 && Math.floor(game.flash * 6) % 2 === 0;
    for (const m of gateLights) { m.map = showOk ? arrowOk : arrowNo; m.color.setScalar(showOk || showNo ? 1 : 0.35); }
    for (const fl of flaps) fl.visible = !game.gatesOpen;

    const r = game.onBoard ? ride.update(dt) : null;
    if (r) for (const e of r.events) onRideEvent(e, r);

    activeAct = (game.onBoard ? (boardEl.hidden ? rideActs : []) : interactables).find((a) => a.test()) || null;
    const text = activeAct ? activeAct.label() : '';
    if (promptEl.textContent !== text) promptEl.textContent = text;
    promptEl.classList.toggle('on', !!text);
    $('.bf-act').disabled = !activeAct;
    hudTick += dt;
    if (hudTick > 0.5) { hudTick = 0; renderHud(); }

    if (r) {
      camera.position.set(ride.x + P.x + r.sway.x, PY + (game.sitting ? 1.2 : D.eye) + r.sway.y, P.z);
      camera.rotation.set(P.pitch, P.yaw, r.sway.roll);
    } else {
      camera.position.set(P.x, P.y + D.eye, P.z);
      camera.rotation.set(P.pitch, P.yaw, 0);
    }
    renderer.render(scene, camera);
  });

  return {
    setLive,
    reset,
    teleport(name) { teleport(name); },
    getState: () => ({
      station: st.abbr, kind, family: fam.key, platform: st.platform, x: P.x, y: P.y, z: P.z, yaw: P.yaw, balance: game.balance,
      gatesOpen: game.gatesOpen, steps: { ...game.steps }, trains: Object.fromEntries(tracks.map((t) => [t.dir, t.phase])),
      live: live.demo ? 'demo' : 'live', ride: game.onBoard ? { ...ride.state, sitting: !!game.sitting } : null,
    }),
    _interact: interact,
    _skip(sec) { if (game.onBoard) ride.skip(sec); else skew += sec * 1000; },
    // test hook: park a train at the platform with its doors due in 30 s
    _park(dir = 'South', hex = '#ffe800', dest = 'SFO Airport') {
      const t = tracks.find((k) => k.dir === dir) || tracks[0];
      t.tracked = { etaAt: nowMs() + 30_000, hex, dest, destAbbr: null, direction: t.dir, cars: 3 };
    },
    _move(x, z, y = null) { P.x = x; P.z = z; if (y !== null) P.y = y; },
    _look(yaw, pitch = -0.05) { P.yaw = yaw; P.pitch = pitch; },
    dispose() {
      renderer.setAnimationLoop(null);
      ro.disconnect();
      clearTimeout(toastTimer);
      host.removeEventListener('keydown', onKeyDown);
      host.removeEventListener('keyup', onKeyUp);
      host.removeEventListener('blur', onBlur);
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      for (const t of tracks) t.train.dispose();
      envRT.dispose();
      pmrem.dispose();
      renderer.dispose();
      hud.remove();
      canvas.remove();
    },
  };
}
