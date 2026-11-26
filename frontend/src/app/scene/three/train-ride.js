// Inside the train: one BART-style car you can walk around in, the ride to the next station, and
// the scenery that moves past the windows.
//
// Modeled on BART's public descriptions of its Fleet of the Future cars (bart.gov/cars):
//   - blue vinyl seats, green priority seats near the doors, seats mounted high with open space under
//   - three doors per side, tripod poles at the end doors
//   - open wheelchair areas at the center doors with a floor graphic, no floor-to-ceiling poles there
//   - two bike areas per car
//   - screens next to the side doors with the next stop and a route line, next-stop displays at the car ends
// Sizes are estimates (car about 21 m long, 3.2 m wide). Not affiliated with BART, no logos.
//
// Car-local coordinates: x across the car (left wall at -1.45, right at +1.45), z along it,
// the train moves toward -z. The doors open on the platform's side: the left at an island platform,
// the right at side platforms (BART runs on the right).

import * as THREE from 'three';

export const CAR = {
  length: 21.3,
  wall: 1.45,      // inside face of the side walls
  outer: 1.6,      // outside of the car body
  ceiling: 2.12,   // ceiling height above the floor
  doorZ: [-6.9, 0, 6.9],
  doorHalf: 0.65,  // half the door opening
  doorH: 1.95,
};

// Ride timing. Each leg is as long as the real track between the two stations (from the network's
// track paths), at real time. Speed and acceleration match the backend's running-time model
// (Timetables.runSeconds: 35 s to speed up and brake, then 22 m/s), so a ride takes as long as the
// same trip does on the map. The train stops at every station; press E at an open door to get off.
export const RIDE = {
  vmax: 22,        // m/s at cruise (about 80 km/h)
  accel: 22 / 35,  // m/s^2, same for braking: V/A = 35 s, as in the backend model
  distance: 2000,  // m between platforms when the real track length isn't known (backend fallback)
  closeAt: 3,      // s after boarding when the doors start to close
  closeDur: 2,     // s the doors take to close
  announce: 600,   // m before the next station: "now arriving" (braking takes about 385 m)
  dwell: 20,       // s the doors stay open at each stop; with opening and closing about the backend's 25 s
};

// Is a rider at (x, z) standing at one of the doors on that side ('left' or 'right')?
export function atDoor(x, z, side = 'left') {
  const s = side === 'right' ? 1 : -1;
  return s * x > CAR.wall - 0.75 && CAR.doorZ.some((d) => Math.abs(z - d) < CAR.doorHalf + 0.35);
}
export const atLeftDoor = (x, z) => atDoor(x, z, 'left');

// One station as the ride needs it; anything missing falls back to an elevated island platform.
export function stationLook(v) {
  return {
    doors: v && v.doors === 'right' ? 'right' : 'left',
    layout: (v && v.layout) || 'island',
    level: v && ['tunnel', 'elevated', 'grade'].includes(v.level) ? v.level : 'elevated',
    segments: (v && v.segments) || null,
  };
}

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mod = (a, n) => ((a % n) + n) % n;

// Next station after Bay Fair, from the train's destination.
export function nextStopFrom(dest = '') {
  const d = dest.toLowerCase();
  if (d.includes('dublin') || d.includes('pleasanton')) return 'Castro Valley';
  if (['berryessa', 'warm springs', 'fremont', 'milpitas', 'union city'].some((k) => d.includes(k))) return 'Hayward';
  return 'San Leandro';
}

// Distance and speed tau seconds after leaving, for a leg of S meters. Short legs never reach
// full speed: the train speeds up for half the way and brakes for the other half.
function profile(tau, S) {
  const { accel: A } = RIDE;
  const V = Math.min(RIDE.vmax, Math.sqrt(A * S));
  const t1 = V / A, s1 = 0.5 * A * t1 * t1, tc = (S - 2 * s1) / V;
  if (tau <= 0) return { s: 0, v: 0, done: false };
  if (tau < t1) return { s: 0.5 * A * tau * tau, v: A * tau, done: false };
  if (tau < t1 + tc) return { s: s1 + V * (tau - t1), v: V, done: false };
  if (tau < 2 * t1 + tc) { const d = tau - t1 - tc; return { s: s1 + V * tc + V * d - 0.5 * A * d * d, v: V - A * d, done: false }; }
  return { s: S, v: 0, done: true };
}

// Seconds from leaving to stopping on a leg of S meters (the length of profile()).
export function legSeconds(S) {
  const A = RIDE.accel, V = Math.min(RIDE.vmax, Math.sqrt(A * S));
  return 2 * (V / A) + (S - (V * V) / A) / V;
}

function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const cssColor = (hex) => (typeof hex === 'string' && /^#?[0-9a-f]{6}$/i.test(hex) ? (hex[0] === '#' ? hex : `#${hex}`) : '#3a8fd6');
const isLight = (css) => {
  const n = parseInt(css.slice(1), 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 160;
};

export function createTrainRide(scene, { floorY, x: originX = 400 }) {
  const FY = floorY;
  const HL = CAR.length / 2;
  const W = CAR.wall;
  const rand = (() => { let s = 11; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();

  const root = new THREE.Group();
  root.position.x = originX;
  root.visible = false;
  scene.add(root);
  const car = new THREE.Group();
  const world = new THREE.Group();
  root.add(car, world);

  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...o });
  const geoBox = new THREE.BoxGeometry(1, 1, 1);
  const box = (parent, x0, x1, y0, y1, z0, z1, m) => {
    const mesh = new THREE.Mesh(geoBox, m);
    mesh.scale.set(x1 - x0, y1 - y0, z1 - z0);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    parent.add(mesh);
    return mesh;
  };
  const planeAt = (parent, w, h, m, x, y, z, ry = 0, rx = 0) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, 0, 'YXZ');
    parent.add(mesh);
    return mesh;
  };
  const rod = (parent, a, b, r, m) => {
    const dir = new THREE.Vector3().subVectors(b, a);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, dir.length(), 10), m);
    mesh.position.copy(a).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    parent.add(mesh);
    return mesh;
  };

  /* ---------- Materials ---------- */
  const T = {
    // dark gray speckled rubber floor, as in the photos
    floor: canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#4c5156'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) {
        const r = rand();
        g.fillStyle = r < 0.4 ? 'rgba(255,255,255,.12)' : r < 0.8 ? 'rgba(0,0,0,.2)' : 'rgba(90,110,130,.3)';
        g.fillRect(rand() * w, rand() * h, 2, 2);
      }
    }),
    // BART blue seats and the lime (yellow-green) priority seats
    vinylBlue: canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#2a73c4'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 16) { g.fillStyle = 'rgba(0,0,0,.1)'; g.fillRect(0, y, w, 2); }
      g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(0, 0, w, h / 3);
    }),
    vinylGreen: canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#bcd12c'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 16) { g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(0, y, w, 2); }
      g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(0, 0, w, h / 3);
    }),
    grass: canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#74875a'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 160; i++) {
        const r = rand();
        g.fillStyle = r < 0.4 ? '#80935f' : r < 0.75 ? '#66794c' : '#8e8a62';
        g.beginPath(); g.ellipse(rand() * w, rand() * h, 6 + rand() * 22, 4 + rand() * 14, rand() * 3, 0, TAU); g.fill();
      }
    }),
    road: canvasTex(128, 256, (g, w, h) => {
      g.fillStyle = '#46484b'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#e9e9e4'; g.fillRect(6, 0, 4, h); g.fillRect(w - 10, 0, 4, h);
      g.fillStyle = '#e2b52e'; g.fillRect(58, 0, 4, h); g.fillRect(66, 0, 4, h);
    }),
    ballast: canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#5c5d5f'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${rand() > 0.5 ? '255,255,255' : '0,0,0'},${rand() * 0.25})`; g.fillRect(rand() * w, rand() * h, 3, 3); }
      for (let y = 6; y < h; y += 32) { g.fillStyle = '#8f8d88'; g.fillRect(8, y, w - 16, 12); }
    }),
  };
  const texMat = (tex, rx, ry, o = {}) => {
    const t = tex.clone(); t.needsUpdate = true; t.repeat.set(rx, ry);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, ...o });
  };

  const M = {
    // A little self-light stands in for the car's LED lighting, which the outdoor lights don't reach.
    wall: mat(0xe8e9e4, { roughness: 0.55, emissive: 0xe8e6df, emissiveIntensity: 0.28 }),
    ceil: mat(0xf4f4f1, { roughness: 0.6, emissive: 0xf4f2ea, emissiveIntensity: 0.75 }),
    led: new THREE.MeshBasicMaterial({ color: 0xfffcf2 }),
    diffuser: mat(0xc9ccce),
    floor: texMat(T.floor, 2, 14, { roughness: 0.95 }),
    blue: texMat(T.vinylBlue, 1, 1, { roughness: 0.45 }),
    green: texMat(T.vinylGreen, 1, 1, { roughness: 0.45 }),
    shell: mat(0x2a2e33, { roughness: 0.6 }),
    steel: mat(0xc9cdd3, { metalness: 0.8, roughness: 0.3 }),
    frame: mat(0x3b4046, { roughness: 0.5 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xa9c3cf, transparent: true, opacity: 0.16, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false }),
    door: mat(0xd5d8db, { roughness: 0.5 }),
    rubber: mat(0x1c1d20),
    threshold: mat(0x45484d, { roughness: 0.9 }),
    yellow: mat(0xe8b830),
    endGlass: mat(0x1b242b, { roughness: 0.15 }),
    lightRed: new THREE.MeshBasicMaterial({ color: 0x551511 }),
    lightGreen: new THREE.MeshBasicMaterial({ color: 0x113d1b }),
    // lime end walls around the gangway door, light plastic seat shells, yellow pole bands, straps
    endWall: mat(0xa9cc3a, { roughness: 0.5, emissive: 0x9cbf30, emissiveIntensity: 0.22 }),
    shellLight: mat(0xdadddf, { roughness: 0.45 }),
    band: mat(0xf2c21b, { roughness: 0.4 }),
    strap: mat(0x15171a, { roughness: 0.7 }),
  };

  const colliders = [];
  const solid = (x0, x1, z0, z1) => colliders.push({ x0, x1, z0, z1, level: 'both', when: null });
  const seats = [];

  /* ---------- Floor, ceiling, end walls ---------- */
  box(car, -W, W, FY - 0.06, FY, -HL, HL, M.floor);
  box(car, -W, W, FY + CAR.ceiling, FY + CAR.ceiling + 0.06, -HL, HL, M.ceil);
  // two long, wide LED light panels down the ceiling, as in the photos
  for (const sx of [-1, 1]) {
    planeAt(car, 0.4, CAR.length - 0.6, M.led, sx * 0.82, FY + CAR.ceiling - 0.02, 0, 0, Math.PI / 2);
  }
  box(car, -0.32, 0.32, FY + CAR.ceiling - 0.03, FY + CAR.ceiling, -HL + 0.3, HL - 0.3, M.diffuser);
  // CCTV domes
  for (const z of [-HL * 0.5, HL * 0.5]) {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 8, 0, TAU, Math.PI / 2, Math.PI / 2), mat(0x222428, { roughness: 0.2 }));
    dome.position.set(0, FY + CAR.ceiling - 0.03, z);
    car.add(dome);
  }

  const doorPanel = (z, face) => {
    const zw = z + face * 0.05;
    box(car, -W, W, FY, FY + CAR.ceiling, Math.min(z, zw), Math.max(z, zw), M.endWall);
    // gangway door to the next car, with a dark window
    const zi = z - face * 0.012;
    box(car, -0.42, 0.42, FY, FY + 1.9, Math.min(zi, zi - face * 0.03), Math.max(zi, zi - face * 0.03), M.door);
    planeAt(car, 0.46, 0.62, M.endGlass, 0, FY + 1.42, zi - face * 0.032, face > 0 ? Math.PI : 0);
    box(car, -0.44, -0.42, FY, FY + 1.9, zi - 0.04, zi + 0.04, M.rubber);
    box(car, 0.42, 0.44, FY, FY + 1.9, zi - 0.04, zi + 0.04, M.rubber);
  };
  doorPanel(-HL, -1);
  doorPanel(HL, 1);

  /* ---------- Side walls, windows, doors, ad cards ---------- */
  const PILLAR = 0.55; // solid wall next to each door, where the door screens hang
  const dz = CAR.doorZ, dh = CAR.doorHalf;
  const spans = [[-HL, dz[0] - dh - PILLAR], [dz[0] + dh + PILLAR, dz[1] - dh - PILLAR], [dz[1] + dh + PILLAR, dz[2] - dh - PILLAR], [dz[2] + dh + PILLAR, HL]];
  const adText = ['Keep the doors clear', 'Hold on while the train moves', 'Offer priority seats to those who need them', 'Bikes: please use the bike area', 'Thanks for riding', 'Eating and drinking: not on board'];
  const adColors = ['#f2efe6', '#e6eef4', '#eef3e4', '#f5ece4'];
  let adI = 0;
  const leaves = { '-1': [], '1': [] };
  const doorLights = [];

  for (const s of [-1, 1]) {
    const xi = s * W, xo = s * CAR.outer, x0 = Math.min(xi, xo), x1 = Math.max(xi, xo);
    const face = -s * Math.PI / 2; // planes on this wall face into the car
    for (const [a, b] of spans) {
      box(car, x0, x1, FY, FY + 0.85, a, b, M.wall);
      box(car, s * (W - 0.05), xi, FY + 0.85, FY + 0.88, a, b, M.frame); // sill
      box(car, x0, x1, FY + 1.78, FY + CAR.ceiling, a, b, M.wall);
      planeAt(car, b - a, 0.93, M.glass, s * 1.52, FY + 1.315, (a + b) / 2, Math.PI / 2);
      const n = Math.max(1, Math.round((b - a) / 1.6));
      for (let i = 0; i <= n; i++) {
        const z = a + ((b - a) * i) / n;
        box(car, x0, x1, FY + 0.85, FY + 1.78, z - 0.045, z + 0.045, M.frame);
      }
      // ad and notice cards along the upper wall
      const cards = Math.floor((b - a) / 1.5);
      for (let i = 0; i < cards; i++) {
        const z = a + ((b - a) * (i + 0.5)) / cards;
        const text = adText[adI % adText.length], bg = adColors[adI % adColors.length];
        adI++;
        const tex = canvasTex(256, 48, (g, w, h) => {
          g.fillStyle = bg; g.fillRect(0, 0, w, h);
          g.fillStyle = '#2b3138'; g.font = '600 15px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText(text, w / 2, h / 2);
        }, false);
        planeAt(car, 1.3, 0.24, new THREE.MeshBasicMaterial({ map: tex }), s * (W - 0.006), FY + 1.94, z, face);
      }
    }
    for (const z of dz) {
      // pillars beside the door and the header above it
      box(car, x0, x1, FY, FY + CAR.ceiling, z - dh - PILLAR, z - dh, M.wall);
      box(car, x0, x1, FY, FY + CAR.ceiling, z + dh, z + dh + PILLAR, M.wall);
      box(car, x0, x1, FY + CAR.doorH, FY + CAR.ceiling, z - dh, z + dh, M.wall);
      // threshold plate with a yellow edge
      box(car, s * 1.18, xi, FY, FY + 0.006, z - dh, z + dh, M.threshold);
      box(car, s * 1.18, s * 1.24, FY + 0.006, FY + 0.009, z - dh, z + dh, M.yellow);
      // door status light above the door
      const lm = new THREE.MeshBasicMaterial({ color: 0x551511 });
      planeAt(car, 0.16, 0.05, lm, s * (W - 0.006), FY + CAR.doorH + 0.08, z, face);
      doorLights.push({ s, m: lm });
      // two sliding leaves, each with a window
      for (const side of [-1, 1]) {
        const leaf = new THREE.Group();
        box(leaf, -0.02, 0.02, FY, FY + 0.95, -dh / 2, dh / 2, M.door);
        box(leaf, -0.02, 0.02, FY + 1.8, FY + CAR.doorH, -dh / 2, dh / 2, M.door);
        box(leaf, -0.02, 0.02, FY + 0.95, FY + 1.8, -dh / 2, -dh / 2 + 0.06, M.door);
        box(leaf, -0.02, 0.02, FY + 0.95, FY + 1.8, dh / 2 - 0.06, dh / 2, M.door);
        planeAt(leaf, dh - 0.12, 0.85, M.glass, 0, FY + 1.375, 0, Math.PI / 2);
        const ez = -side * (dh / 2 - 0.015);
        box(leaf, -0.025, 0.025, FY, FY + CAR.doorH, ez - 0.015, ez + 0.015, M.rubber);
        leaf.position.set(s * 1.53, 0, z + side * dh / 2);
        car.add(leaf);
        leaves[s].push({ leaf, z, side });
      }
    }
  }

  /* ---------- Screens beside the doors and next-stop displays at the car ends ---------- */
  const sideCanvas = document.createElement('canvas');
  sideCanvas.width = 256; sideCanvas.height = 352;
  const sideTex = new THREE.CanvasTexture(sideCanvas); sideTex.colorSpace = THREE.SRGBColorSpace;
  const overCanvas = document.createElement('canvas');
  overCanvas.width = 768; overCanvas.height = 96;
  const overTex = new THREE.CanvasTexture(overCanvas); overTex.colorSpace = THREE.SRGBColorSpace;
  const sideMat = new THREE.MeshBasicMaterial({ map: sideTex });
  const overMat = new THREE.MeshBasicMaterial({ map: overTex });
  for (const s of [-1, 1]) {
    for (const z of dz) {
      const zc = z + dh + PILLAR / 2;
      box(car, s * (W - 0.03), s * W, FY + 1.1, FY + 1.8, zc - 0.25, zc + 0.25, M.shell);
      planeAt(car, 0.42, 0.58, sideMat, s * (W - 0.032), FY + 1.45, zc, -s * Math.PI / 2);
    }
  }
  for (const face of [-1, 1]) {
    const z = face * (HL - 0.06);
    box(car, -0.52, 0.52, FY + 1.93, FY + CAR.ceiling - 0.01, z - 0.03, z + 0.03, M.shell);
    planeAt(car, 0.98, 0.13, overMat, 0, FY + 2.02, z - face * 0.032, face > 0 ? Math.PI : 0);
  }

  /* ---------- Seats, bike areas, wheelchair areas ---------- */
  const sections = [[-HL + 0.12, dz[0] - dh - 0.1], [dz[0] + dh + 0.1, -2.1], [2.1, dz[2] - dh - 0.1], [dz[2] + dh + 0.1, HL - 0.12]];
  const nearDoor = (z) => Math.min(...dz.map((d) => Math.abs(d - z)));
  const seatUnit = (s, za, zb, facing) => {
    // za..zb is the whole unit along z (back + cushion). facing +1 means riders face +z.
    const xa = s * 0.6, xb = s * (W - 0.03), x0 = Math.min(xa, xb), x1 = Math.max(xa, xb);
    const priority = nearDoor((za + zb) / 2) < 1.9;
    const m = priority ? M.green : M.blue;
    const back = facing > 0 ? [za, za + 0.09] : [zb - 0.09, zb];
    const cush = facing > 0 ? [za + 0.09, zb] : [za, zb - 0.09];
    const mid = (x0 + x1) / 2;
    box(car, x0, mid - 0.01, FY + 0.42, FY + 0.53, cush[0], cush[1], m);
    box(car, mid + 0.01, x1, FY + 0.42, FY + 0.53, cush[0], cush[1], m);
    box(car, x0, mid - 0.01, FY + 0.53, FY + 1.16, back[0], back[1], m);
    box(car, mid + 0.01, x1, FY + 0.53, FY + 1.16, back[0], back[1], m);
    box(car, x0, x1, FY + 0.36, FY + 0.42, cush[0] + 0.03, cush[1] - 0.03, M.shellLight); // seat shell
    box(car, x0 - 0.02, x1 + 0.02, FY + 1.14, FY + 1.19, back[0] - 0.01, back[1] + 0.01, M.shellLight); // back rim
    box(car, s * (W - 0.12), s * W, FY + 0.12, FY + 0.42, cush[0] + 0.1, cush[1] - 0.1, M.frame); // wall bracket, open floor below
    // grab handle on the aisle corner of the seat back
    rod(car, new THREE.Vector3(s * 0.64, FY + 1.16, (back[0] + back[1]) / 2), new THREE.Vector3(s * 0.64, FY + 1.3, (back[0] + back[1]) / 2), 0.018, M.steel);
    solid(x0, x1, za, zb);
    for (const sx of [0.8, 1.2]) seats.push({ x: s * sx, z: (cush[0] + cush[1]) / 2 + facing * 0.08, yaw: facing > 0 ? Math.PI : 0, priority });
  };
  const bikeArea = (s, a, b) => {
    const zc = (a + b) / 2;
    for (const z of [zc - 0.45, zc + 0.45]) {
      rod(car, new THREE.Vector3(s * 1.2, FY, z), new THREE.Vector3(s * 1.2, FY + 1.1, z), 0.025, M.steel);
      box(car, s * (W - 0.04), s * W, FY + 0.5, FY + 1.05, z - 0.3, z + 0.3, mat(0x2d3238)); // lean pad
    }
    rod(car, new THREE.Vector3(s * 1.2, FY + 1.1, zc - 0.45), new THREE.Vector3(s * 1.2, FY + 1.1, zc + 0.45), 0.025, M.steel);
    const tex = canvasTex(128, 128, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.strokeStyle = '#e8eaee'; g.lineWidth = 6;
      g.beginPath(); g.arc(34, 80, 20, 0, TAU); g.stroke();
      g.beginPath(); g.arc(94, 80, 20, 0, TAU); g.stroke();
      g.beginPath(); g.moveTo(34, 80); g.lineTo(56, 46); g.lineTo(84, 46); g.lineTo(94, 80); g.moveTo(56, 46); g.lineTo(64, 80); g.lineTo(84, 46); g.stroke();
    }, false);
    planeAt(car, 0.8, 0.8, new THREE.MeshBasicMaterial({ map: tex, transparent: true }), s * 0.95, FY + 0.004, zc, 0, -Math.PI / 2);
    solid(s > 0 ? 1.12 : -W, s > 0 ? W : -1.12, zc - 0.55, zc + 0.55);
  };

  for (const s of [-1, 1]) {
    sections.forEach(([a, b], i) => {
      if ((s > 0 && i === 3) || (s < 0 && i === 0)) return bikeArea(s, a, b);
      const BAY = 1.75;
      const n = Math.floor((b - a) / BAY);
      for (let k = 0; k < n; k++) {
        const z = a + k * BAY;
        seatUnit(s, z, z + 0.58, 1);
        seatUnit(s, z + BAY - 0.58, z + BAY, -1);
      }
      if (b - a - n * BAY >= 1.05) seatUnit(s, a + n * BAY, a + n * BAY + 0.58, 1);
    });
  }

  // Wheelchair areas at the center doors, with the floor graphic
  const wcTex = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#1f5fae'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffffff'; g.fillStyle = '#ffffff'; g.lineWidth = 8; g.lineCap = 'round';
    g.beginPath(); g.arc(58, 24, 9, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(56, 38); g.lineTo(56, 70); g.lineTo(86, 70); g.lineTo(98, 100); g.stroke();
    g.beginPath(); g.moveTo(56, 50); g.lineTo(80, 50); g.stroke();
    g.beginPath(); g.arc(56, 82, 26, -1.1, 3.9); g.stroke();
  }, false);
  const wcMat = new THREE.MeshBasicMaterial({ map: wcTex });
  planeAt(car, 1.0, 1.0, wcMat, 0.85, FY + 0.003, -1.35, 0, -Math.PI / 2);
  planeAt(car, 1.0, 1.0, wcMat, -0.85, FY + 0.003, 1.35, Math.PI, -Math.PI / 2);

  /* ---------- Poles and grab rails ---------- */
  // Tripod poles at the end doors: one pole from the floor that splits into three to the ceiling.
  for (const z of [dz[0], dz[2]]) {
    const knee = new THREE.Vector3(0, FY + 1.3, z);
    rod(car, new THREE.Vector3(0, FY, z), knee, 0.02, M.steel);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU + Math.PI / 2;
      rod(car, knee, new THREE.Vector3(Math.cos(a) * 0.32, FY + CAR.ceiling, z + Math.sin(a) * 0.32), 0.018, M.steel);
    }
    solid(-0.08, 0.08, z - 0.08, z + 0.08);
  }
  // Floor-to-ceiling poles at the seat ends beside the center-door area (none inside it).
  const yellowBand = (x, z) => rod(car, new THREE.Vector3(x, FY + 1.02, z), new THREE.Vector3(x, FY + 1.22, z), 0.026, M.band);
  for (const s of [-1, 1]) for (const z of [-2.1, 2.1]) {
    rod(car, new THREE.Vector3(s * 0.62, FY, z), new THREE.Vector3(s * 0.62, FY + CAR.ceiling, z), 0.02, M.steel);
    yellowBand(s * 0.62, z);
    solid(s * 0.62 - 0.05, s * 0.62 + 0.05, z - 0.05, z + 0.05);
  }
  for (const z of [dz[0], dz[2]]) yellowBand(0, z);
  // Overhead grab rails along the aisle, with black hanging straps
  const strapGeo = new THREE.BoxGeometry(0.03, 0.26, 0.012);
  const loopGeo = new THREE.TorusGeometry(0.055, 0.012, 6, 16);
  for (const s of [-1, 1]) {
    rod(car, new THREE.Vector3(s * 0.6, FY + 1.92, -HL + 0.4), new THREE.Vector3(s * 0.6, FY + 1.92, HL - 0.4), 0.018, M.steel);
    for (let z = -HL + 0.6; z < HL; z += 2.4) rod(car, new THREE.Vector3(s * 0.6, FY + 1.92, z), new THREE.Vector3(s * 0.6, FY + CAR.ceiling, z), 0.012, M.steel);
    for (let z = -HL + 1.2; z < HL - 0.8; z += 0.75) {
      if (nearDoor(z) < 0.8) continue;
      const strap = new THREE.Mesh(strapGeo, M.strap);
      strap.position.set(s * 0.6, FY + 1.92 - 0.13, z);
      car.add(strap);
      const loop = new THREE.Mesh(loopGeo, M.strap);
      loop.position.set(s * 0.6, FY + 1.92 - 0.3, z);
      loop.rotation.y = Math.PI / 2;
      car.add(loop);
    }
  }

  /* ---------- Scenery outside: land, viaduct, tunnels, stations ---------- */
  // The car floor stays at FY. The land moves up and down instead: on a viaduct it is far below,
  // on ground-level track just under the rails, and in a tunnel it is hidden behind the tunnel walls.
  // Which of the three applies where comes from OpenStreetMap's tags along the real track (see the
  // backend's LineProfileBuilder); without that data the whole leg uses the stations' own levels.
  const LIFT = { elevated: 8.5, grade: 1.3, tunnel: 1.3 }; // track above the land around it (m)
  const RAMP = 260;        // m to climb from the ground onto a viaduct (about a 3% grade)
  const STATION_HALF = 106; // half a 10-car platform
  const WRAP = 440;

  const scenery = new THREE.Group(); // land, road, trees, buildings: y follows the lift
  world.add(scenery);
  const groundMat = texMat(T.grass, 35, 35, { roughness: 1 });
  planeAt(scenery, 700, 700, groundMat, 0, 0, 0, 0, -Math.PI / 2);
  const roadMat = texMat(T.road, 1, 35);
  planeAt(scenery, 10, 700, roadMat, 21, 0.02, 0, 0, -Math.PI / 2);
  const ballastMat = texMat(T.ballast, 1, 520 / 2.4);
  const concrete = mat(0x8c8b87);
  box(world, -2.3, 2.3, FY - 1.45, FY - 1.0, -260, 260, mat(0x7a7a7d)); // track bed
  planeAt(world, 2.8, 520, ballastMat, 0, FY - 0.995, 0, 0, -Math.PI / 2);
  for (const rx of [-0.72, 0.72]) box(world, rx - 0.04, rx + 0.04, FY - 1.0, FY - 0.86, -260, 260, mat(0x9a9ca2, { metalness: 0.6 }));

  const movers = []; // items that loop past the windows: { obj, u, kind }
  const addMover = (obj, u, kind = 'land', parent = scenery) => { parent.add(obj); movers.push({ obj, u, kind }); return obj; };
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.3, 3, 8), crownGeo = new THREE.SphereGeometry(2.6, 10, 8);
  const trunkMat = mat(0x5a4636), crownMats = [mat(0x4b6b32), mat(0x58763a), mat(0x3f5e2c)];
  for (let i = 0; i < 90; i++) {
    let x = (rand() < 0.5 ? -1 : 1) * (14 + rand() * 76);
    if (x > 14 && x < 29) x += 16;
    const sc = 0.8 + rand() * 0.6;
    const g = new THREE.Group();
    const t = new THREE.Mesh(trunkGeo, trunkMat); t.position.y = 1.5; t.scale.setScalar(sc);
    const c = new THREE.Mesh(crownGeo, crownMats[i % 3]); c.position.y = 4.4 * sc; c.scale.set(sc, sc * 1.2, sc);
    g.add(t, c); g.position.x = x;
    addMover(g, rand() * WRAP);
  }
  const bColors = [0xd9cfbd, 0xc9b9a0, 0xe6e2d8, 0xb7a58e, 0xcfd3d6, 0xa98f7a].map((c) => mat(c));
  const roofMat = mat(0x5b5550);
  for (let i = 0; i < 42; i++) {
    const right = rand() < 0.5;
    const x = right ? 34 + rand() * 50 : -(18 + rand() * 66);
    const w = 8 + rand() * 14, d = 8 + rand() * 16, h = 4 + rand() * (rand() < 0.2 ? 14 : 6);
    const g = new THREE.Group();
    box(g, -w / 2, w / 2, 0, h, -d / 2, d / 2, bColors[i % bColors.length]);
    box(g, -w / 2 - 0.2, w / 2 + 0.2, h, h + 0.3, -d / 2 - 0.2, d / 2 + 0.2, roofMat);
    for (let k = 1; k < h / 3; k++) box(g, -w / 2 - 0.02, w / 2 + 0.02, k * 3 - 0.2, k * 3 + 0.6, -d / 2 + 1, d / 2 - 1, mat(0x3e4a55, { roughness: 0.2 }));
    g.position.x = x;
    addMover(g, rand() * WRAP);
  }
  const poleMat = mat(0x8f9399, { metalness: 0.4 });
  for (let u = 0; u < WRAP; u += 27.5) {
    const g = new THREE.Group();
    rod(g, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 8, 0), 0.08, poleMat);
    box(g, -1.4, 0, 7.9, 8.05, -0.15, 0.15, poleMat);
    g.position.x = 15;
    addMover(g, u);
  }
  // viaduct piers: hang down from the track bed to the land, as tall as the lift
  const pierGeo = new THREE.BoxGeometry(2.2, 1, 1.2).translate(0, -0.5, 0);
  for (let u = 0; u < WRAP; u += 24) {
    const m = new THREE.Mesh(pierGeo, concrete);
    m.position.y = FY - 1.45;
    addMover(m, u, 'pier', world);
  }
  // parapets on both sides of the viaduct, and a fence on the right one, in 20 m pieces so they
  // can be left out at stations and on ground-level track
  for (let u = 0; u < WRAP; u += 20) {
    const g = new THREE.Group();
    for (const sx of [-1, 1]) box(g, sx * 2.3 - 0.08, sx * 2.3 + 0.08, FY - 1.45, FY - 0.55, -10, 10, concrete);
    for (let k = -8; k <= 8; k += 4) box(g, 2.26, 2.34, FY - 0.55, FY + 0.35, k - 0.04, k + 0.04, mat(0x6b6f74));
    addMover(g, u, 'parapet', world);
  }

  /* Tunnels: concrete walls close to the car with a lamp every 12 m, a portal where the track goes
     in, and earth over the top so the tunnel isn't a box floating over the fields. */
  const tunnelTex = canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#2c2e31'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(${rand() > 0.5 ? '255,255,255' : '0,0,0'},${rand() * 0.08})`; g.fillRect(rand() * w, rand() * h, 6, 3); }
    // the wall runs from the track bed (bottom) to the roof (top); the car windows look at the
    // middle third, so the lamps and cables sit there and stream past
    g.fillStyle = '#1d1f22'; g.fillRect(0, 70, w, 6); g.fillRect(0, 80, w, 4); // cables
    g.fillStyle = 'rgba(255,240,200,.14)'; g.fillRect(0, 36, 50, 26);
    g.fillStyle = '#fff3d6'; g.fillRect(10, 45, 28, 7); // lamp
  });
  const tunnelPieces = []; // { g, a, b } in meters along the current leg
  const clearTunnels = () => { for (const t of tunnelPieces) world.remove(t.g); tunnelPieces.length = 0; };
  const addTunnel = (a, b, portalA, portalB) => {
    const len = b - a;
    if (len < 5) return;
    const g = new THREE.Group();
    const t = tunnelTex.clone(); t.needsUpdate = true; t.repeat.set(len / 12, 1);
    const wallMat = new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide });
    const H0 = FY - 1.45, H1 = FY + 3.3;
    for (const sx of [-1, 1]) planeAt(g, len, H1 - H0, wallMat, sx * 2.75, (H0 + H1) / 2, 0, Math.PI / 2);
    const ceil = tunnelTex.clone(); ceil.needsUpdate = true; ceil.repeat.set(len / 12, 0.4);
    planeAt(g, len, 5.5, new THREE.MeshBasicMaterial({ color: 0x8a8c90, map: ceil, side: THREE.DoubleSide }), 0, H1, 0, Math.PI / 2, Math.PI / 2);
    // earth over the tunnel, seen only from outside near the portals
    box(g, -30, 30, H1 + 0.05, H1 + 4, -len / 2, len / 2, mat(0x6d7f52, { roughness: 1 }));
    const portal = (z) => {
      const m = mat(0x9b9890);
      box(g, -16, -2.75, FY - 1.45, H1 + 4.2, z - 0.6, z + 0.6, m);
      box(g, 2.75, 16, FY - 1.45, H1 + 4.2, z - 0.6, z + 0.6, m);
      box(g, -2.75, 2.75, H1, H1 + 4.2, z - 0.6, z + 0.6, m);
    };
    if (portalA) portal(len / 2);   // smaller u is larger z (the train moves toward -z)
    if (portalB) portal(-len / 2);
    world.add(g);
    tunnelPieces.push({ g, a, b });
  };

  /* Stations seen from the train. BART runs on the right, so an island platform (between the two
     tracks) is on the train's left and side platforms are on its right, with the other track and
     its platform across on the left. Underground stations get walls and a ceiling, the others a
     canopy. */
  const makeSign = (name) => canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = '#141d26'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#0099d8'; g.fillRect(0, h - 10, w, 10);
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    let px = 62;
    do { g.font = `600 ${px}px "Helvetica Neue", Arial, sans-serif`; px -= 2; } while (px > 20 && g.measureText(name).width > w - 30);
    g.fillText(name, w / 2, h / 2 + 3);
  }, false);
  const tileTex = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#d8d2c2'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 2;
    for (let i = 0; i <= w; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
  });
  const platformMat = mat(0x9c9a94), stripMat = M.yellow, canopyMat = mat(0xcfd2d4), columnMat = mat(0x8a8f95), benchMat = mat(0x6d6f73);
  const makeStation = ({ name, doors = 'left', layout = 'island', level = 'elevated' }) => {
    const g = new THREE.Group();
    const PL = STATION_HALF;
    const sx = doors === 'right' ? 1 : -1; // the side our platform is on
    const island = layout !== 'side';
    const X = (a) => sx * a;               // a measured from our track toward our platform
    const span = (a, b) => [Math.min(X(a), X(b)), Math.max(X(a), X(b))];
    const signMats = [];
    const sign = (x, face, z) => {
      box(g, x - 0.05, x + 0.05, FY, FY + 2.0, z - 0.05, z + 0.05, mat(0x777777));
      const m = new THREE.MeshBasicMaterial();
      planeAt(g, 1.6, 0.4, m, x + face * 0.06, FY + 2.15, z, face > 0 ? Math.PI / 2 : -Math.PI / 2);
      signMats.push(m);
    };
    // a platform from a to b, with a yellow safety strip along each edge that faces a track
    const platform = (a, b, ...trackEdges) => {
      const [x0, x1] = span(a, b);
      box(g, x0, x1, FY - 1.2, FY - 0.03, -PL, PL, platformMat);
      for (const e of trackEdges) {
        const inward = e === a ? Math.sign(b - a) : Math.sign(a - b);
        const [e0, e1] = span(e, e + inward * 0.6);
        box(g, e0, e1, FY - 0.03, FY - 0.02, -PL, PL, stripMat);
      }
    };
    const otherTrack = (c) => {
      const x = X(c);
      box(g, x - 2.3, x + 2.3, FY - 1.45, FY - 1.0, -PL, PL, mat(0x7a7a7d));
      for (const rx of [-0.72, 0.72]) box(g, x + rx - 0.04, x + rx + 0.04, FY - 1.0, FY - 0.86, -PL, PL, mat(0x9a9ca2, { metalness: 0.6 }));
    };
    let lo, hi; // the station's width, across our track and everything beside it
    if (island) {
      platform(1.72, 9.5, 1.72, 9.5);
      otherTrack(11.22);
      for (let z = -PL + 10; z < PL; z += 20) sign(X(2.95), -sx, z);
      for (let z = -PL + 12; z < PL; z += 18) { const [b0, b1] = span(4.4, 5.0); box(g, b0, b1, FY, FY + 0.45, z - 1, z + 1, benchMat); }
      [lo, hi] = span(-2.6, 13.6);
    } else {
      platform(1.72, 6.6, 1.72);
      otherTrack(-4.4);
      platform(-6.12, -11.0, -6.12); // the far side platform, across both tracks
      for (let z = -PL + 10; z < PL; z += 20) { sign(X(2.95), -sx, z); sign(X(-7.3), sx, z); }
      for (let z = -PL + 12; z < PL; z += 18) { const [b0, b1] = span(5.2, 5.8); box(g, b0, b1, FY, FY + 0.45, z - 1, z + 1, benchMat); }
      [lo, hi] = span(-11.6, 7.2);
    }
    if (level === 'tunnel') {
      // a box under the street: tiled walls, a ceiling with long light strips, and end walls with
      // an opening for our tunnel
      const wall = new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.6, emissive: 0xd8d2c2, emissiveIntensity: 0.35 });
      wall.map = tileTex.clone(); wall.map.needsUpdate = true; wall.map.repeat.set(2 * PL / 2, 3);
      for (const x of [lo, hi]) planeAt(g, 2 * PL, 6, wall, x, FY + 1.5, 0, Math.PI / 2);
      box(g, lo, hi, FY + 4.5, FY + 4.7, -PL, PL, mat(0x5e6166, { emissive: 0x2a2c30, emissiveIntensity: 0.6 }));
      const strip = new THREE.MeshBasicMaterial({ color: 0xfff8e8 });
      for (const x of island ? [X(5.6)] : [X(4.2), X(-8.5)]) planeAt(g, 0.5, 2 * PL - 8, strip, x, FY + 4.48, 0, 0, Math.PI / 2);
      for (const z of [-PL, PL]) {
        box(g, lo, -2.75, FY - 1.45, FY + 4.6, z - 0.3, z + 0.3, mat(0x55585c));
        box(g, 2.75, hi, FY - 1.45, FY + 4.6, z - 0.3, z + 0.3, mat(0x55585c));
        box(g, -2.75, 2.75, FY + 3.3, FY + 4.6, z - 0.3, z + 0.3, mat(0x55585c));
      }
      // big station names on the wall across from the doors, as in BART's subway stations
      const far = sx < 0 ? hi : lo;
      for (let z = -PL + 25; z < PL; z += 50) {
        const m = new THREE.MeshBasicMaterial();
        planeAt(g, 4.8, 1.2, m, far - sx * 0.02, FY + 2.4, z, sx < 0 ? -Math.PI / 2 : Math.PI / 2);
        signMats.push(m);
      }
    } else {
      // canopies over the platforms on posts
      const roof = (a, b) => {
        const [x0, x1] = span(a, b);
        box(g, x0 - 0.3, x1 + 0.3, FY + 4.4, FY + 4.65, -PL * 0.8, PL * 0.8, canopyMat);
        const mid = (x0 + x1) / 2;
        for (let z = -PL * 0.8 + 6; z < PL * 0.8; z += 12) box(g, mid - 0.2, mid + 0.2, FY, FY + 4.4, z - 0.2, z + 0.2, columnMat);
      };
      if (island) roof(1.72, 9.5);
      else { roof(1.72, 6.6); roof(-6.12, -11.0); }
    }
    g.visible = false;
    world.add(g);
    const t = makeSign(name);
    for (const m of signMats) { m.map = t; m.needsUpdate = true; }
    return { g, doors, level, dispose: () => world.remove(g) };
  };

  // How the land lies under the track at u meters into the current leg (0 = the station you left).
  let legPlan = { segs: [{ a: 0, b: RIDE.distance, kind: 'elevated' }], dist: RIDE.distance };
  const planLeg = (segments, dist, fromLevel, toLevel) => {
    let segs = (segments && segments.length ? segments : [{ from: 0, to: 1, kind: fromLevel === toLevel ? fromLevel : 'grade' }])
      .map((s) => ({ a: s.from * dist, b: s.to * dist, kind: LIFT[s.kind] !== undefined ? s.kind : 'grade', name: s.name || null }));
    // at the platforms the station's own level wins (OSM's tags are least reliable right at a station)
    const ends = [[0, STATION_HALF + 20, fromLevel], [dist - STATION_HALF - 20, dist, toLevel]];
    for (const [a, b, kind] of ends) {
      if (!kind) continue;
      const out = [];
      for (const s of segs) {
        if (s.b <= a || s.a >= b) { out.push(s); continue; }
        if (s.a < a) out.push({ ...s, b: a });
        if (s.b > b) out.push({ ...s, a: b });
      }
      out.push({ a: Math.max(0, a), b: Math.min(dist, b), kind, name: null });
      segs = out.sort((p, q) => p.a - q.a);
    }
    // merge neighbours of the same kind
    const merged = [];
    for (const s of segs) {
      const last = merged[merged.length - 1];
      if (last && last.kind === s.kind) last.b = s.b; else if (s.b - s.a > 0.5) merged.push({ ...s });
    }
    legPlan = { segs: merged, dist };
    clearTunnels();
    merged.forEach((s, i) => {
      if (s.kind !== 'tunnel') return;
      // underground stations have their own box; the tunnel tube runs between them
      const a = i === 0 && fromLevel === 'tunnel' ? Math.max(s.a, STATION_HALF) : s.a;
      const b = i === merged.length - 1 && toLevel === 'tunnel' ? Math.min(s.b, dist - STATION_HALF) : s.b;
      addTunnel(a, b, i > 0 || fromLevel !== 'tunnel', i < merged.length - 1 || toLevel !== 'tunnel');
    });
  };
  const smooth = (t) => t * t * (3 - 2 * t);
  const liftAt = (u) => {
    const { segs } = legPlan;
    if (!segs.length) return LIFT.grade;
    let i = segs.findIndex((x) => u < x.b);
    if (i < 0) i = segs.length - 1;
    const s = segs[i];
    let L = LIFT[s.kind];
    // ramps between a viaduct and the ground; a tunnel portal is always at ground level, so the
    // ramp happens on the open side
    const ramp = (A, B, at, room) => {
      if (LIFT[A.kind] === LIFT[B.kind]) return null;
      const r = Math.min(RAMP, room);
      const [r0, r1] = A.kind === 'tunnel' ? [at, at + r] : B.kind === 'tunnel' ? [at - r, at] : [at - r / 2, at + r / 2];
      if (u < r0 || u > r1) return null;
      return LIFT[A.kind] + (LIFT[B.kind] - LIFT[A.kind]) * smooth((u - r0) / (r1 - r0));
    };
    if (i > 0) { const v = ramp(segs[i - 1], s, s.a, Math.min(s.b - s.a, segs[i - 1].b - segs[i - 1].a)); if (v !== null) L = v; }
    if (i < segs.length - 1) { const v = ramp(s, segs[i + 1], s.b, Math.min(s.b - s.a, segs[i + 1].b - segs[i + 1].a)); if (v !== null) L = v; }
    return L;
  };
  const kindAt = (u) => (legPlan.segs.find((s) => u < s.b) || legPlan.segs[legPlan.segs.length - 1] || { kind: 'grade' }).kind;
  const stations = { from: null, to: null }; // the station groups at each end of the current leg
  // Inside a tunnel or an underground station: nothing outside can be seen.
  const enclosed = (u) => {
    if (tunnelPieces.some((t) => u > t.a + 12 && u < t.b - 12)) return true;
    const { dist } = legPlan;
    return (stations.from && stations.from.level === 'tunnel' && u < STATION_HALF - 8) || (stations.to && stations.to.level === 'tunnel' && u > dist - STATION_HALF + 8);
  };

  const clearStations = () => {
    for (const k of ['from', 'to']) { if (stations[k]) stations[k].dispose(); stations[k] = null; }
  };

  /* ---------- Train sound: a low rumble that follows the speed (optional) ---------- */
  let audio = null;
  const startAudio = () => {
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
      const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
      const gain = ac.createGain(); gain.gain.value = 0;
      src.connect(lp).connect(gain).connect(ac.destination);
      src.start();
      audio = { ac, gain, lp };
    } catch { audio = null; }
  };

  /* ---------- Ride state ---------- */
  let st = null;

  // The doors that open (or last opened) where the train is now: the station it is leaving until it
  // goes, then the next one.
  const doorSide = () => (st.phase === 'boarding' || st.phase === 'closing' ? st.originDoors : st.destDoors);

  const drawScreens = () => {
    if (!st) return;
    const color = st.color, light = isLight(color);
    const g = sideCanvas.getContext('2d');
    g.fillStyle = '#0d1824'; g.fillRect(0, 0, 256, 352);
    g.fillStyle = color; g.fillRect(0, 0, 256, 46);
    g.fillStyle = light ? '#111' : '#fff'; g.font = 'bold 21px system-ui, sans-serif'; g.textBaseline = 'middle';
    g.fillText(`To ${st.dest}`.slice(0, 20), 12, 24);
    const arriving = st.phase === 'arriving' || st.phase === 'arrived';
    g.fillStyle = '#9fb3c4'; g.font = '17px system-ui, sans-serif';
    g.fillText(st.phase === 'arrived' ? 'This stop' : arriving ? 'Now arriving' : 'Next stop', 12, 78);
    g.fillStyle = '#ffffff'; g.font = 'bold 30px system-ui, sans-serif';
    g.fillText(st.next, 12, 110, 232);
    // route line: the station you boarded at, at the bottom, next stop above, more stations beyond
    const x = 40;
    g.strokeStyle = color; g.lineWidth = 8; g.beginPath(); g.moveTo(x, 316); g.lineTo(x, 160); g.stroke();
    g.setLineDash([6, 8]); g.beginPath(); g.moveTo(x, 160); g.lineTo(x, 140); g.stroke(); g.setLineDash([]);
    const prog = clamp(st.s / st.dist, 0, 1);
    g.fillStyle = '#5c6a76'; g.beginPath(); g.arc(x, 300, 8, 0, TAU); g.fill();
    g.fillStyle = '#9fb3c4'; g.font = '17px system-ui, sans-serif'; g.fillText(st.from.slice(0, 18), x + 22, 300);
    g.fillStyle = '#0d1824'; g.strokeStyle = '#fff'; g.lineWidth = 4; g.beginPath(); g.arc(x, 190, 12, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.font = 'bold 19px system-ui, sans-serif'; g.fillText(st.next, x + 22, 190, 256 - x - 30);
    const after = st.stops[st.leg + 1];
    g.fillStyle = '#9fb3c4'; g.font = '15px system-ui, sans-serif';
    g.fillText(after ? `then ${after}` : 'Last stop', x + 22, 146, 256 - x - 30);
    g.fillStyle = '#ffd43b'; g.beginPath(); g.arc(x, 300 - prog * 110, 6, 0, TAU); g.fill(); // the train
    g.fillStyle = '#9fb3c4'; g.font = '15px system-ui, sans-serif';
    g.fillText(st.phase === 'closing' ? 'Doors closing' : `Doors open on the ${doorSide()}`, 12, 338);
    sideTex.needsUpdate = true;

    const o = overCanvas.getContext('2d');
    o.fillStyle = '#050505'; o.fillRect(0, 0, 768, 96);
    o.fillStyle = '#ffb02e'; o.font = 'bold 44px monospace'; o.textBaseline = 'middle';
    const last = st.leg >= st.stops.length - 1;
    const msg = `${arriving ? 'Now arriving' : 'Next stop'}: ${st.next}${last ? ' (last stop)' : ''}   ·   Train to ${st.dest}   ·   Doors open on the ${st.destDoors}   ·   `;
    const wMsg = o.measureText(msg).width;
    const off = (st.t * 90) % wMsg;
    for (let xx = -off; xx < 768; xx += wMsg) o.fillText(msg, xx, 50);
    overTex.needsUpdate = true;
  };

  const setDoors = (open) => {
    const side = st && doorSide() === 'right' ? 1 : -1;
    for (const s of [-1, 1]) {
      const o = s === side ? open : 0;
      for (const { leaf, z, side: half } of leaves[String(s)]) leaf.position.z = z + half * (dh / 2 + (dh - 0.04) * o);
    }
    for (const { s, m } of doorLights) m.color.set(s === side && open > 0.01 ? (st && st.phase === 'closing' ? 0xff3b2f : 0x3cf06a) : 0x551511);
  };

  const placeWorld = () => {
    const s = st.s, dist = legPlan.dist;
    const L = liftAt(s), inside = enclosed(s);
    scenery.position.y = FY - L;
    scenery.visible = !inside;
    for (const m of movers) {
      const z = mod(s - m.u, WRAP) - WRAP / 2;
      m.obj.position.z = z;
      if (m.kind === 'land') continue;
      const u = s - z; // where along the leg this item is
      const atStation = Math.abs(u) < STATION_HALF + 4 || Math.abs(u - dist) < STATION_HALF + 4;
      const k = kindAt(u);
      if (m.kind === 'pier') {
        m.obj.visible = !inside && L > 2.5 && k !== 'tunnel';
        m.obj.scale.y = Math.max(0.01, L - 1.45);
      } else {
        m.obj.visible = !inside && !atStation && k === 'elevated' && liftAt(u) > 3;
      }
    }
    const zo = s, zd = s - dist;
    if (stations.from) { stations.from.g.position.z = zo; stations.from.g.visible = Math.abs(zo) < STATION_HALF + 300; }
    if (stations.to) { stations.to.g.position.z = zd; stations.to.g.visible = Math.abs(zd) < STATION_HALF + 300; }
    for (const t of tunnelPieces) t.g.position.z = s - (t.a + t.b) / 2;
    groundMat.map.offset.y = mod(s / 20, 1);
    roadMat.map.offset.y = mod(s / 20, 1);
    ballastMat.map.offset.y = mod(s / 2.4, 1);
  };

  // Where the train is on its route, and which station (if any) you could step off at right now.
  const describe = () => {
    const last = st.leg >= st.stops.length - 1;
    let here = null;
    if (st.phase === 'arrived' && st.open >= 0.9) here = { name: st.next, index: st.leg, doors: st.destDoors };
    else if (st.phase === 'boarding' && st.leg > 0) here = { name: st.from, index: st.leg - 1, doors: st.originDoors };
    return {
      phase: st.phase, speed: st.v, s: st.s, dest: st.dest, next: st.next, from: st.from,
      leg: st.leg, stops: st.stops, last, here,
      // the side the doors open on at the next stop, and what the track is doing here
      doors: st.destDoors, track: kindAt(st.s),
      // seconds until the train stops at `next` (null once it has stopped)
      eta: st.phase === 'arrived' ? null : Math.max(0, st.closeAt + RIDE.closeDur + 1 + legSeconds(st.dist) - st.t), remaining: st.stops.length - st.leg - (st.phase === 'arrived' ? 1 : 0),
    };
  };

  return {
    x: originX,
    colliders,
    seats,
    bounds: { x: W - 0.3, z: HL - 0.35 },
    // stops: names of every station the train calls at after `from`, in order (the last is the end of the ride).
    // legs: meters of real track before each of those stops (missing ones use RIDE.distance).
    // looks: for each stop, { doors, layout, level, segments } (see stationLook); origin: the same for `from`.
    start({ dest, color, next, stops, legs = [], from = 'Bay Fair', looks = [], origin = null }) {
      const list = stops && stops.length ? [...stops] : [next || nextStopFrom(dest)];
      const legM = (i) => (legs[i] > 50 ? legs[i] : RIDE.distance);
      const look = (i) => stationLook(looks[i]);
      const o = stationLook(origin);
      clearStations();
      st = { t: 0, s: 0, v: 0, phase: 'boarding', dest: dest || 'Train', stops: list, legM, look, dist: legM(0), leg: 0, next: list[0], from, origin: from, color: cssColor(color), fired: new Set(), arrivedT: null, closeAt: RIDE.closeAt, originDoors: o.doors, destDoors: look(0).doors };
      stations.from = makeStation({ name: from, ...o });
      stations.to = makeStation({ name: st.next, ...look(0) });
      planLeg(look(0).segments, st.dist, o.level, look(0).level);
      root.visible = true;
      if (!audio) startAudio();
      if (audio && audio.ac.state === 'suspended') audio.ac.resume();
      setDoors(1);
      placeWorld();
      drawScreens();
    },
    stop() {
      st = null;
      clearStations();
      clearTunnels();
      root.visible = false;
      if (audio) audio.gain.gain.value = 0;
    },
    // Advance the ride. Returns the state plus any one-time events that happened this frame.
    update(dt) {
      if (!st) return null;
      st.t += dt;
      const events = [];
      const fire = (name) => { if (!st.fired.has(name)) { st.fired.add(name); events.push(name); } };
      // Doors have been open at an intermediate stop for the dwell time: this stop becomes the start of
      // the next leg (same spot, doors still open), so the train carries on unless you got off.
      if (st.arrivedT !== null && st.leg < st.stops.length - 1 && st.t - st.arrivedT >= 2.5 + RIDE.dwell - RIDE.closeAt) {
        st.from = st.next;
        st.leg += 1;
        st.next = st.stops[st.leg];
        st.dist = st.legM(st.leg);
        st.t = dt; st.s = 0; st.v = 0; st.arrivedT = null; st.fired = new Set();
        // the station we're at becomes the start of the next leg; build the one after it
        const here = stations.to;
        if (stations.from) stations.from.dispose();
        stations.from = here;
        const nl = st.look(st.leg);
        stations.to = makeStation({ name: st.next, ...nl });
        st.originDoors = st.destDoors;
        st.destDoors = nl.doors;
        planLeg(nl.segments, st.dist, here ? here.level : 'elevated', nl.level);
        events.push('continuing');
      }
      const closeAt = st.closeAt;
      const departAt = closeAt + RIDE.closeDur + 1;
      const p = profile(st.t - departAt, st.dist);
      st.s = p.s; st.v = p.v;
      let open;
      if (st.t < closeAt) { open = 1; st.phase = 'boarding'; }
      else if (st.t < closeAt + RIDE.closeDur) { open = 1 - (st.t - closeAt) / RIDE.closeDur; st.phase = 'closing'; fire('closing'); }
      else if (!p.done) {
        open = 0;
        st.phase = st.s > st.dist - Math.min(RIDE.announce, st.dist * 0.4) ? 'arriving' : 'moving';
        if (st.t >= departAt) fire('departed');
        if (st.phase === 'arriving') fire('arriving');
      } else {
        if (st.arrivedT === null) st.arrivedT = st.t;
        open = clamp((st.t - st.arrivedT - 1) / 1.5, 0, 1);
        st.phase = 'arrived';
        fire('stopped');
        if (open >= 1) fire('opened');
      }
      setDoors(open);
      placeWorld();
      st.screenTick = (st.screenTick || 0) + dt;
      if (st.screenTick > 0.05) { st.screenTick = 0; drawScreens(); }
      if (audio) {
        const k = st.v / RIDE.vmax;
        audio.gain.gain.value = 0.02 + 0.16 * k;
        audio.lp.frequency.value = 160 + 420 * k;
      }
      const k = st.v / RIDE.vmax;
      const sway = { x: Math.sin(st.t * 1.7) * 0.012 * k, y: Math.sin(st.t * 9.3) * 0.004 * k + Math.sin(st.t * 2.1) * 0.003 * k, roll: Math.sin(st.t * 1.3) * 0.006 * k };
      st.open = open;
      return { ...describe(), events, sway };
    },
    skip(sec) { if (st) st.t += sec; }, // test hook
    get state() { return st ? describe() : null; },
  };
}
