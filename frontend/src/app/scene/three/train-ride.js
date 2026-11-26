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
// the train moves toward -z. The platform is on the left at both stations.

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

// Is a rider at (x, z) standing at one of the left-side doors (the platform side)?
export function atLeftDoor(x, z) {
  return x < -(CAR.wall - 0.75) && CAR.doorZ.some((d) => Math.abs(z - d) < CAR.doorHalf + 0.35);
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

  /* ---------- Scenery outside: viaduct, ground, road, trees, buildings, stations ---------- */
  const WRAP = 440;
  const groundMat = texMat(T.grass, 35, 35, { roughness: 1 });
  const ground = planeAt(world, 700, 700, groundMat, 0, 0.02, 0, 0, -Math.PI / 2);
  const roadMat = texMat(T.road, 1, 35);
  planeAt(world, 10, 700, roadMat, 21, 0.04, 0, 0, -Math.PI / 2);
  const ballastMat = texMat(T.ballast, 1, 520 / 2.4);
  box(world, -2.3, 2.3, FY - 1.45, FY - 1.0, -260, 260, mat(0x7a7a7d)); // viaduct deck
  planeAt(world, 2.8, 520, ballastMat, 0, FY - 0.995, 0, 0, -Math.PI / 2);
  for (const rx of [-0.72, 0.72]) box(world, rx - 0.04, rx + 0.04, FY - 1.0, FY - 0.86, -260, 260, mat(0x9a9ca2, { metalness: 0.6 }));
  for (const sx of [-1, 1]) box(world, sx * 2.3 - 0.08, sx * 2.3 + 0.08, FY - 1.45, FY - 0.55, -260, 260, mat(0x8c8b87)); // parapets

  const movers = []; // items that loop past the windows
  const addMover = (obj, u) => { world.add(obj); movers.push({ obj, u }); };
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.3, 3, 8), crownGeo = new THREE.SphereGeometry(2.6, 10, 8);
  const trunkMat = mat(0x5a4636), crownMats = [mat(0x4b6b32), mat(0x58763a), mat(0x3f5e2c)];
  for (let i = 0; i < 90; i++) {
    let x = (rand() < 0.5 ? -1 : 1) * (9 + rand() * 80);
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
    const x = right ? 34 + rand() * 50 : -(14 + rand() * 70);
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
  for (let u = 0; u < WRAP; u += 24) {
    const g = new THREE.Group();
    box(g, -1.1, 1.1, 0, FY - 1.45, -0.6, 0.6, mat(0x8c8b87)); // viaduct pier
    addMover(g, u);
  }
  for (let u = 0; u < WRAP; u += 4) {
    const g = new THREE.Group();
    box(g, -0.04, 0.04, FY - 0.55, FY + 0.35, -0.04, 0.04, mat(0x6b6f74)); // fence post on the right parapet
    g.position.x = 2.3;
    addMover(g, u);
  }

  const makeSign = (name) => canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = '#141d26'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#0099d8'; g.fillRect(0, h - 10, w, 10);
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    let px = 62;
    do { g.font = `600 ${px}px "Helvetica Neue", Arial, sans-serif`; px -= 2; } while (px > 20 && g.measureText(name).width > w - 30);
    g.fillText(name, w / 2, h / 2 + 3);
  }, false);
  const makePlatform = (lime) => {
    const g = new THREE.Group();
    const PL = 50;
    box(g, -9.5, -1.72, FY - 1.2, FY - 0.03, -PL, PL, mat(0x8c8b87));
    box(g, -2.5, -1.72, FY - 0.03, FY - 0.025, -PL, PL, M.yellow);
    box(g, -10, -1.4, FY + 4.4, FY + 4.7, -PL, PL, mat(0xd2c7ab));
    box(g, -1.5, -1.4, FY + 3.5, FY + 4.7, -PL, PL, lime ? mat(0xa6c93a) : mat(0x9aa0a6));
    for (let z = -PL + 6; z < PL; z += 12) box(g, -6.1, -5.6, FY, FY + 4.4, z - 0.25, z + 0.25, mat(0x8a8068));
    for (let z = -PL + 12; z < PL; z += 18) box(g, -4.6, -4.0, FY, FY + 0.45, z - 1, z + 1, mat(0x6d6f73)); // benches
    const signs = [];
    for (let z = -PL + 10; z < PL; z += 20) {
      box(g, -3.05, -2.95, FY, FY + 2.0, z - 0.05, z + 0.05, mat(0x777777));
      const m = new THREE.MeshBasicMaterial();
      planeAt(g, 1.6, 0.4, m, -2.94, FY + 2.15, z, Math.PI / 2);
      signs.push(m);
    }
    g.visible = false;
    world.add(g);
    return { g, setName(name) { const t = makeSign(name); for (const m of signs) { m.map = t; m.needsUpdate = true; } } };
  };
  const origin = makePlatform(true);
  origin.setName('Bay Fair');
  const destPlat = makePlatform(false);

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
    g.fillText(st.phase === 'closing' ? 'Doors closing' : 'Doors open on the left', 12, 338);
    sideTex.needsUpdate = true;

    const o = overCanvas.getContext('2d');
    o.fillStyle = '#050505'; o.fillRect(0, 0, 768, 96);
    o.fillStyle = '#ffb02e'; o.font = 'bold 44px monospace'; o.textBaseline = 'middle';
    const last = st.leg >= st.stops.length - 1;
    const msg = `${arriving ? 'Now arriving' : 'Next stop'}: ${st.next}${last ? ' (last stop)' : ''}   ·   Train to ${st.dest}   ·   Doors open on the left   ·   `;
    const wMsg = o.measureText(msg).width;
    const off = (st.t * 90) % wMsg;
    for (let xx = -off; xx < 768; xx += wMsg) o.fillText(msg, xx, 50);
    overTex.needsUpdate = true;
  };

  const setDoors = (open) => {
    for (const s of ['-1', '1']) {
      const o = s === '-1' ? open : 0;
      for (const { leaf, z, side } of leaves[s]) leaf.position.z = z + side * (dh / 2 + (dh - 0.04) * o);
    }
    for (const { s, m } of doorLights) m.color.set(s < 0 && open > 0.01 ? (st && st.phase === 'closing' ? 0xff3b2f : 0x3cf06a) : 0x551511);
  };

  const placeWorld = () => {
    const s = st.s;
    for (const { obj, u } of movers) obj.position.z = mod(s - u, WRAP) - WRAP / 2;
    const zo = s, zd = s - st.dist;
    origin.g.position.z = zo; origin.g.visible = Math.abs(zo) < 300;
    destPlat.g.position.z = zd; destPlat.g.visible = Math.abs(zd) < 300;
    groundMat.map.offset.y = mod(s / 20, 1);
    roadMat.map.offset.y = mod(s / 20, 1);
    ballastMat.map.offset.y = mod(s / 2.4, 1);
  };

  // Where the train is on its route, and which station (if any) you could step off at right now.
  const describe = () => {
    const last = st.leg >= st.stops.length - 1;
    let here = null;
    if (st.phase === 'arrived' && st.open >= 0.9) here = { name: st.next, index: st.leg };
    else if (st.phase === 'boarding' && st.leg > 0) here = { name: st.from, index: st.leg - 1 };
    return {
      phase: st.phase, speed: st.v, s: st.s, dest: st.dest, next: st.next, from: st.from,
      leg: st.leg, stops: st.stops, last, here,
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
    start({ dest, color, next, stops, legs = [], from = 'Bay Fair' }) {
      const list = stops && stops.length ? [...stops] : [next || nextStopFrom(dest)];
      const legM = (i) => (legs[i] > 50 ? legs[i] : RIDE.distance);
      st = { t: 0, s: 0, v: 0, phase: 'boarding', dest: dest || 'Train', stops: list, legM, dist: legM(0), leg: 0, next: list[0], from, origin: from, color: cssColor(color), fired: new Set(), arrivedT: null, closeAt: RIDE.closeAt };
      destPlat.setName(st.next);
      origin.setName(from);
      root.visible = true;
      if (!audio) startAudio();
      if (audio && audio.ac.state === 'suspended') audio.ac.resume();
      setDoors(1);
      placeWorld();
      drawScreens();
    },
    stop() {
      st = null;
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
        origin.setName(st.from);
        destPlat.setName(st.next);
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
