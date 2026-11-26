// Bay Fair station walkthrough (prototype, built from 10 photos).
// Everything is a procedural "greybox": simple shapes plus canvas textures, no 3D files.
// All sizes live in the constants below. They are ESTIMATES from photos, not surveyed
// measurements. Change them after you measure on site.
//
// Layout (meters). +z is toward the street/bus loop, -z is toward the far end of the platform.
//   Concourse (brick, y = 0):   z from +40 to -1.7, ticket machines and station agent booth
//   Fare gates:                 line at z = -1, 8 passages
//   Paid hall (y = 0):          z from -1.7 to -19, escalator (x -3 to -2) and stairs (x 1.5 to 3.5)
//   Platform (island, y = 7):   z from -17 to -90, x from -4 to 4, tracks at x = +-6
//
// Not affiliated with or endorsed by BART. No BART logos are used.

import * as THREE from 'three';
import { atDoor, createTrainRide, nextStopFrom } from './train-ride.js';
import { createFareGates } from './fare-gates.js';
import { buildFleetTrain } from './fleet.js';

/* ---------- Dimensions and settings (estimates, edit freely) ---------- */
export const DIM = {
  eye: 1.6,            // eye height
  radius: 0.3,         // player body radius for collisions
  walk: 2.6,           // m/s
  run: 4.2,            // m/s with Shift
  platformY: 7.0,      // platform height above the concourse
  platformHalfW: 4.0,  // island platform half width
  trackX: 6.0,         // track centerline distance from platform center
  platformZ0: -17,     // where the platform starts (top of escalator/stairs)
  platformZ1: -90,     // far end
  rampZ0: -3,          // bottom of escalator/stairs
  escalatorSpeed: 0.9, // m/s the moving stairs carry you
  trainLength: 36,
  trainStopZ: -54,     // center of the stopped train
  gateZ: -1,
  topUp: 20,           // what the ticket machine adds to your card; fares come from BART when you tap out
};

const C = {
  lime: 0xa6c93a,
  brick: 0xa8634c,
  concrete: 0x8c8b87,
  hallFloor: 0x7d8077,
  ceiling: 0x9a8a84,
  roofUnder: 0xd2c7ab,
  steel: 0xb9bdc3,
  navy: 0x1f3347,
  yellow: 0xe8b830,
  carpet: 0x5d7078,
  column: 0x8a8068,
  sky: 0xcdd5db,
};

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const easeOut = (u) => 1 - (1 - u) ** 3;
const easeIn = (u) => u ** 3;

/* ---------- Canvas textures ---------- */
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function makeTextures() {
  const rand = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const T = {};
  // Running-bond brick, one tile = 1.28 m x 1.28 m
  T.brick = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#6b4a3e'; g.fillRect(0, 0, w, h);
    const bw = 64, bh = 16;
    for (let r = 0; r < h / bh; r++) {
      for (let c = -1; c < w / bw + 1; c++) {
        const x = c * bw + (r % 2 ? bw / 2 : 0);
        const v = 150 + rand() * 30;
        g.fillStyle = `rgb(${v + 18},${v - 62},${v - 82})`;
        g.fillRect(x + 1, r * bh + 1, bw - 2, bh - 2);
      }
    }
  });
  T.tiles = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#8a8c86'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#6e706a'; g.lineWidth = 3; g.strokeRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(0,0,0,${rand() * 0.05})`; g.fillRect(rand() * w, rand() * h, 3, 3); }
  });
  T.carpet = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#5f727b'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 4) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, y, w, 1); }
  });
  T.louver = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#a6c93a'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) { g.fillStyle = '#6f8a22'; g.fillRect(0, y, w, 3); g.fillStyle = '#c0dc58'; g.fillRect(0, y + 3, w, 1); }
  });
  T.roof = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#d2c7ab'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 8) { g.fillStyle = 'rgba(80,70,50,.35)'; g.fillRect(x, 0, 2, h); }
  });
  T.grate = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#4b4c4f'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 4) { g.fillStyle = '#6a6b6f'; g.fillRect(0, y, w, 1); }
  });
  T.steps = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#58595c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8b830'; g.fillRect(0, 0, w, 10);
  });
  T.stucco = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#9a8a84'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${rand() > 0.5 ? '255,255,255' : '0,0,0'},${rand() * 0.06})`; g.fillRect(rand() * w, rand() * h, 2, 2); }
  });
  T.asphalt = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#4b4d50'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(255,255,255,${rand() * 0.07})`; g.fillRect(rand() * w, rand() * h, 2, 2); }
  });
  return T;
}

function labelTexture(w, h, draw) {
  const t = canvasTex(w, h, draw);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/* ---------- The scene ---------- */
export function createBayFairScene(host, opts = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: !!opts.preserveDrawingBuffer });
  } catch {
    const msg = document.createElement('p');
    msg.className = 'scene-fallback';
    msg.textContent = '3D is not available in this browser (WebGL could not start).';
    host.append(msg);
    return { setLive() {}, reset() {}, teleport() {}, getState: () => ({}), dispose() {} };
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  host.append(renderer.domElement);
  const canvas = renderer.domElement;
  canvas.style.touchAction = 'none';
  host.tabIndex = 0;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(C.sky);
  scene.fog = new THREE.Fog(C.sky, 40, 230);

  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 500);
  camera.rotation.order = 'YXZ';

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a84, 1.55));
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.0);
  sun.position.set(-30, 60, 40);
  scene.add(sun);

  const T = makeTextures();
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
  const texMat = (tex, rx, ry, o = {}) => {
    const t = tex.clone();
    t.needsUpdate = true;
    t.repeat.set(rx, ry);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, ...o });
  };
  const emissive = (color, intensity = 1) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity });

  // Box by min/max corners (meters).
  const slab = (x0, x1, y0, y1, z0, z1, m) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), m);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    scene.add(mesh);
    return mesh;
  };
  const cyl = (r, h, x, y, z, m, seg = 20) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);
    mesh.position.set(x, y + h / 2, z);
    scene.add(mesh);
    return mesh;
  };

  // Collision boxes. level: 'low' (concourse side), 'high' (platform side), 'both'.
  const colliders = [];
  const solid = (x0, x1, z0, z1, level = 'low', when = null) => colliders.push({ x0, x1, z0, z1, level, when });

  const D = DIM;
  const PY = D.platformY;
  const edge = D.platformHalfW;

  /* ----- Ground ----- */
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), mat(0x7d8a6a));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.08;
  scene.add(ground);

  const plane = (x0, x1, z0, z1, y, m) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    scene.add(mesh);
    return mesh;
  };

  // Street / bus loop and the brick concourse
  plane(-60, 60, 22, 70, -0.02, texMat(T.asphalt, 30, 12));
  plane(-24, 24, 9, 22, 0, texMat(T.brick, 37.5, 10.2));
  plane(-24, 24, -1.7, 4, 0, mat(0x7a4338, { roughness: 0.7 })); // dark red-brown tile under the canopy, in front of the gates
  plane(-24, 24, 4, 9, 0, texMat(T.tiles, 37.5, 4)); // concrete band between the tile and the brick
  plane(-3.2, 3.2, 6.1, 6.9, 0.012, mat(C.yellow)); // yellow tactile strip
  slab(-24, 24, -0.4, 0, 22, 22.3, mat(0xb5b5b0)); // curb
  plane(-24, 24, 22.3, 24, 0.01, mat(0xc9c9c4)); // curb strip
  // Station-colored band between concourse and hall (concrete)
  plane(-9, 9, -19, -1.7, 0.01, texMat(T.tiles, 14, 14));
  // Painted bus-bay lines
  for (let x = -40; x <= 40; x += 12) plane(x - 0.06, x + 0.06, 28, 40, -0.015, mat(0xe9e9e9));

  /* ----- Concourse canopy (pink-grey stucco ceiling, fluorescent panels, lime columns) ----- */
  const canopyZ0 = -1.7, canopyZ1 = 14;
  slab(-20, 20, 3.9, 4.3, canopyZ0, canopyZ1, texMat(T.stucco, 8, 4));
  slab(-20, 20, 3.5, 3.9, canopyZ1 - 0.2, canopyZ1, mat(C.steel)); // front fascia
  const lamp = emissive(0xfff0b8, 0.9);
  for (let x = -16; x <= 16; x += 8) for (let z = 1; z <= 11; z += 5) slab(x - 0.45, x + 0.45, 3.82, 3.9, z - 1.2, z + 1.2, lamp);
  const limeMat = mat(C.lime, { roughness: 0.6 });
  for (const x of [-16, -8, 8, 16]) {
    cyl(0.3, 3.9, x, 0, 12.4, limeMat, 18);
    solid(x - 0.3, x + 0.3, 12.1, 12.7, 'low');
  }
  // Lime beam above the gate line, like the one over the fare gates in the photo
  slab(-9, 9, 3.0, 3.9, -1.9, -1.3, limeMat);

  // "Bay Fair" station sign above the entrance (text only, no logos)
  const signTex = labelTexture(512, 128, (g, w, h) => {
    g.fillStyle = '#f4f4f2'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#9a9a96'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = '#26282b'; g.font = '600 64px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('Bay Fair', w / 2, h / 2 + 3);
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshBasicMaterial({ map: signTex }));
  sign.scale.set(1.4, 1.4, 1);
  sign.position.set(0, 5.35, -1.27);
  scene.add(sign);
  slab(-14, 14, 4.3, 6.5, -1.95, -1.3, mat(C.lime, { roughness: 0.6 })); // lime fascia above the entrance
  slab(-14, 14, 4.2, 4.3, -1.95, -1.3, mat(0x6e5a52)); // dark soffit strip under it
  const entTex = labelTexture(512, 96, (g, w, h) => {
    g.fillStyle = '#1b1d20'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f4f4f2'; g.font = '600 44px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('Station Entrance', w / 2, h / 2 + 2);
  });
  const entSign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.49), new THREE.MeshBasicMaterial({ map: entTex }));
  entSign.position.set(0, 3.45, -1.25);
  scene.add(entSign);

  /* ----- Paid hall walls (lime panels), back wall, piers under the viaduct ----- */
  const wallH = 3.6;
  slab(-9.4, -9, wallH * 0, wallH, -19, -1.7, texMat(T.louver, 8, 2));
  slab(9, 9.4, 0, wallH, -19, -1.7, texMat(T.louver, 8, 2));
  slab(-9.4, 9.4, 0, PY, -19.4, -19, mat(C.concrete));
  // Ground-floor only: the platform runs on past z = -19 at y = 7, so these must not block it.
  solid(-9.6, -9, -19.6, -1.7, 'low');
  solid(9, 9.6, -19.6, -1.7, 'low');
  solid(-9.6, 9.6, -19.8, -19, 'low');

  /* ----- Station agent booth (stainless + glass, lime top) ----- */
  slab(-8.8, -5.2, 0, 1.1, -1.7, 2.6, mat(C.steel, { metalness: 0.5, roughness: 0.4 }));
  slab(-8.8, -5.2, 1.1, 2.6, -1.7, 2.6, mat(0x9fc2cc, { transparent: true, opacity: 0.35, roughness: 0.1 }));
  slab(-8.9, -5.1, 2.6, 3.0, -1.8, 2.7, limeMat);
  solid(-8.9, -5.1, -1.8, 2.7, 'low');
  // small schedule screen in the booth window
  const scrTex = labelTexture(256, 96, (g, w, h) => {
    g.fillStyle = '#10222c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#8fd0e6'; g.font = '16px monospace';
    g.fillText('Next trains', 8, 22);
    g.fillStyle = '#e8eaee'; g.fillText('Richmond', 8, 46); g.fillText('Daly City', 8, 66); g.fillText('Dublin/Pleasanton', 8, 86);
  });
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.42), new THREE.MeshBasicMaterial({ map: scrTex }));
  scr.position.set(-6.9, 1.9, 2.55);
  scene.add(scr);

  /* ----- Ticket vending machines ----- */
  const tvmBody = mat(0x6d7580, { metalness: 0.4, roughness: 0.5 });
  const tvmScreen = labelTexture(128, 96, (g, w, h) => {
    g.fillStyle = '#12304a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8b830'; g.fillRect(0, 0, w, 14);
    g.fillStyle = '#dbe8f2'; g.font = '14px sans-serif'; g.fillText('Add value', 12, 44); g.fillText('Clipper', 12, 64);
  });
  for (const x of [5.3, 6.5, 7.7]) {
    slab(x - 0.4, x + 0.4, 0, 1.7, -0.5, 0.5, tvmBody);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.45), new THREE.MeshBasicMaterial({ map: tvmScreen }));
    s.position.set(x, 1.25, 0.52);
    scene.add(s);
    slab(x - 0.3, x + 0.3, 0.9, 1.0, 0.45, 0.7, mat(C.navy));
  }
  solid(4.8, 8.2, -0.6, 0.6, 'low');

  /* ----- Fare gates: 9 pedestals, 8 passages, overhead arrows ----- */
  const steel = mat(C.steel, { metalness: 0.6, roughness: 0.35 });
  const gateCap = mat(C.navy);
  const arrowOk = labelTexture(64, 64, (g) => {
    g.fillStyle = '#0a1a0a'; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#3ff56a'; g.lineWidth = 8; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(32, 10); g.lineTo(32, 52); g.moveTo(14, 34); g.lineTo(32, 54); g.lineTo(50, 34); g.stroke();
  });
  const arrowNo = labelTexture(64, 64, (g) => {
    g.fillStyle = '#1a0a0a'; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#ff4a3a'; g.lineWidth = 8; g.lineCap = 'round';
    g.beginPath(); g.moveTo(14, 14); g.lineTo(50, 50); g.moveTo(50, 14); g.lineTo(14, 50); g.stroke();
  });
  const GATE_N = 8, GAP = 0.75, PED = 0.35, PITCH = GAP + PED;
  const gateX0 = -(GATE_N * PITCH + PED) / 2 + PED / 2; // first pedestal center
  const gateLights = [];
  const flaps = [];
  for (let i = 0; i <= GATE_N; i++) {
    const x = gateX0 + i * PITCH;
    slab(x - PED / 2, x + PED / 2, 0, 1.05, -1.7, -0.3, steel);
    slab(x - PED / 2, x + PED / 2, 1.05, 1.2, -1.75, -0.2, gateCap);
    slab(x - 0.17, x + 0.17, 0.2, 0.95, -0.32, -0.28, mat(C.navy));
    solid(x - PED / 2, x + PED / 2, -1.7, -0.3, 'low');
    if (i < GATE_N) {
      const cx = x + PITCH / 2;
      const m = new THREE.MeshBasicMaterial({ map: arrowNo });
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), m);
      panel.position.set(cx, 2.55, -0.18);
      scene.add(panel);
      gateLights.push(m);
      // clear flap across the passage, closed until a successful tap
      const flap = slab(cx - GAP / 2, cx + GAP / 2, 0.15, 1.0, -1.04, -0.96, mat(0xbfe3ee, { transparent: true, opacity: 0.35 }));
      flaps.push(flap);
      solid(cx - GAP / 2, cx + GAP / 2, -1.06, -0.94, 'low', () => !game.gatesOpen);
    }
  }
  // overhead header and side fences
  slab(gateX0 - 0.2, -gateX0 + 0.2, 2.35, 2.85, -1.75, -0.2, steel);
  const fenceMat = mat(C.steel, { metalness: 0.5 });
  const gateEdge = -gateX0 + PED / 2;
  slab(gateEdge, 9, 0, 1.1, -1.7, -1.5, fenceMat);
  slab(-9, -gateEdge, 0, 1.1, -1.7, -1.5, fenceMat);
  solid(gateEdge, 9.6, -1.75, -1.4, 'low');
  solid(-9.6, -gateEdge, -1.75, -1.4, 'low');
  // Keep the booth glass from being a gap: booth already solid.

  /* ----- Escalator and stairs up to the platform ----- */
  const rise = PY, run = Math.abs(D.platformZ0 - D.rampZ0);
  const rampLen = Math.hypot(rise, run);
  const rampAng = Math.atan2(rise, run);
  const ramp = (x0, x1, m) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.3, rampLen), m);
    mesh.position.set((x0 + x1) / 2, rise / 2 - 0.15, (D.rampZ0 + D.platformZ0) / 2);
    mesh.rotation.x = rampAng; // positive x-rotation raises the -z end
    scene.add(mesh);
    return mesh;
  };
  const escMat = texMat(T.grate, 2, 60);
  const stairMat = texMat(T.steps, 2, 44);
  const ESC = { x0: -3.6, x1: -2.4 }, STAIR = { x0: 1.4, x1: 3.6 };
  ramp(ESC.x0, ESC.x1, escMat);
  ramp(STAIR.x0, STAIR.x1, stairMat);
  // balustrades (stainless rail strips along the ramps) and colliders
  const railMat = mat(C.steel, { metalness: 0.6, roughness: 0.3 });
  for (const x of [ESC.x0 - 0.1, ESC.x1 + 0.1, STAIR.x0 - 0.1, STAIR.x1 + 0.1]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, rampLen), railMat);
    r.position.set(x, rise / 2 + 0.95, (D.rampZ0 + D.platformZ0) / 2);
    r.rotation.x = rampAng;
    scene.add(r);
    solid(x - 0.1, x + 0.1, D.platformZ0 - 0.1, D.rampZ0 + 0.2, 'both');
  }
  // Escalator moving-handrails (dark)
  // Concrete under-ramp mass so you cannot see through it
  slab(-3.7, 3.7, 0, 0.2, D.platformZ0, D.rampZ0, mat(C.concrete)); // base only; keeps it simple
  // Platform edge opening: rail across the top between and around the ramps
  const topRail = (x0, x1) => { slab(x0, x1, PY, PY + 1.0, D.platformZ0 - 0.1, D.platformZ0 + 0.1, mat(0xf2f2f0)); solid(x0, x1, D.platformZ0 - 0.15, D.platformZ0 + 0.15, 'high'); };
  topRail(-edge, ESC.x0 - 0.1);
  topRail(ESC.x1 + 0.1, STAIR.x0 - 0.1);
  topRail(STAIR.x1 + 0.1, edge);
  // Signs for the two ways up
  const waySign = (text, x) => {
    const t = labelTexture(256, 64, (g, w, h) => {
      g.fillStyle = '#1f3a2a'; g.fillRect(0, 0, w, h); g.fillStyle = '#f4f4f2'; g.font = '600 30px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 2);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshBasicMaterial({ map: t }));
    m.position.set(x, 2.6, D.rampZ0 + 0.3);
    scene.add(m);
  };
  waySign('Platform ▲ Escalator', -3.0);
  waySign('Platform ▲ Stairs', 2.5);

  /* ----- Elevated structure: viaduct, platform slab, edge strips, canopy ----- */
  const deckMat = mat(0x77777a);
  const zA = 62, zB = -170; // track runs a long way both directions
  for (const s of [-1, 1]) {
    const cx = s * D.trackX;
    slab(cx - 2.0, cx + 2.0, PY - 1.2, PY - 0.8, zB, zA, deckMat); // track deck under the ballast
    slab(cx - 1.4, cx + 1.4, PY - 0.8, PY - 0.7, zB, zA, mat(0x55575b)); // ballast
    for (const dx of [-0.84, 0.84]) slab(cx + dx - 0.04, cx + dx + 0.04, PY - 0.7, PY - 0.55, zB, zA, mat(0x9a9ca2, { metalness: 0.6 }));
    slab(cx - 0.07, cx + 0.07, PY - 0.7, PY - 0.5, zB, zA, mat(0x333)); // third rail stand-in
  }
  // piers every 12 m; two inside the paid hall are solid for the player
  for (let z = 42; z >= -14; z -= 12) {
    for (const s of [-1, 1]) {
      slab(s * D.trackX - 0.4, s * D.trackX + 0.4, 0, PY - 1.2, z - 0.4, z + 0.4, mat(C.concrete));
      solid(s * D.trackX - 0.45, s * D.trackX + 0.45, z - 0.45, z + 0.45, 'low');
    }
  }
  slab(-edge, edge, PY - 1.0, PY, D.platformZ1, D.platformZ0, mat(C.concrete));
  plane(-edge, edge, D.platformZ1, D.platformZ0, PY + 0.005, texMat(T.tiles, 6, 58));
  for (const s of [-1, 1]) {
    plane(s > 0 ? edge - 0.8 : -edge, s > 0 ? edge : -edge + 0.8, D.platformZ1, D.platformZ0, PY + 0.012, mat(C.yellow));
  }
  // platform solids: edge limit and far end
  solid(edge - 0.15, edge + 2, D.platformZ1 - 1, D.platformZ0 - 0.2, 'high');
  solid(-edge - 2, -edge + 0.15, D.platformZ1 - 1, D.platformZ0 - 0.2, 'high');
  solid(-edge - 2, edge + 2, D.platformZ1 - 2, D.platformZ1, 'high');
  // low edge rails on the platform side of the escalator opening are done above.

  // Canopy: cream corrugated underside, rafters, lime louvered fascia on both sides
  const roofY = PY + 4.4;
  slab(-9, 9, roofY, roofY + 0.3, D.platformZ1, D.platformZ0, texMat(T.roof, 1, 30));
  for (let z = D.platformZ0 - 2; z > D.platformZ1; z -= 6) slab(-9, 9, roofY - 0.35, roofY, z - 0.15, z + 0.15, mat(C.column));
  for (const s of [-1, 1]) {
    slab(s * 9 - 0.06, s * 9 + 0.06, roofY - 1.2, roofY + 0.5, D.platformZ1, D.platformZ0, texMat(T.louver, 1, 36));
  }
  const lampP = emissive(0xfff0b8, 0.8);
  for (let z = -22; z > D.platformZ1; z -= 10) slab(-0.3, 0.3, roofY - 0.45, roofY - 0.38, z - 1.5, z + 1.5, lampP);
  // columns
  const colMat = mat(C.column);
  for (let z = -24; z >= -84; z -= 12) {
    for (const x of [-2.0, 2.0]) {
      slab(x - 0.28, x + 0.28, PY, roofY, z - 0.28, z + 0.28, colMat);
      solid(x - 0.3, x + 0.3, z - 0.3, z + 0.3, 'high');
    }
  }
  // Lime cylinder enclosure with an exit sign (the round structure on the platform)
  const cylZ = -30, cylR = 2.3;
  cyl(cylR, 2.3, 0, PY, cylZ, limeMat, 40);
  cyl(cylR - 0.15, 0.04, 0, PY + 2.3, cylZ, mat(0x88a82c), 40);
  slab(-0.8, 0.8, PY + 2.7, PY + 3.1, cylZ + 0.2, cylZ + 0.5, mat(0x1d6b3a));
  // circular footprint as 8 small boxes
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * TAU, x = Math.cos(ang) * (cylR - 0.3), z = cylZ + Math.sin(ang) * (cylR - 0.3);
    solid(x - 0.75, x + 0.75, z - 0.75, z + 0.75, 'high');
  }
  solid(-1.2, 1.2, cylZ - 1.2, cylZ + 1.2, 'high');

  // Bay Fair name signs on posts beyond the tracks
  for (const z of [-24, -50, -76]) for (const s of [-1, 1]) {
    cyl(0.04, 2.2, s * (edge + 4.9), PY, z, mat(0x777), 8);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.34), new THREE.MeshBasicMaterial({ map: signTex }));
    m.position.set(s * (edge + 4.9), PY + 1.9, z + 0.06);
    scene.add(m);
    const m2 = m.clone();
    m2.position.z = z - 0.06;
    m2.rotation.y = Math.PI;
    scene.add(m2);
  }

  /* ----- Live departures drive the boards and the trains -----
     setLive(rows) takes the rows from parseDepartures() for Bay Fair. Each platform's next train
     is placed on its track so that it is standing at the platform until its estimated departure
     time, then pulls out. Platform 1 = east track, platform 2 = west track (an estimate: edit SIDE
     after you check on site). Without live data a looping demo train runs on the east track. */
  const SIDE = { '1': 1, '2': -1 };
  const APPROACH = 20, DWELL = 35, DEPART = 8; // seconds
  const FAR = 150; // how far away the train starts and ends (m)
  let skew = 0; // test hook: shifts the scene clock (ms)
  const nowMs = () => Date.now() + skew;
  const live = { rows: null, at: 0, note: 'Waiting for live data…', demo: true };

  const L = D.trainLength;
  // Two Fleet of the Future cars (see fleet.js) fill the modeled platform.
  const BF_CARS = { cars: 2, carLength: 17.6, gap: 0.4, floorY: PY, doorZ: [-6.5, 0, 6.5] };
  const DOOR_Z = [-1, 1].flatMap((c) => BF_CARS.doorZ.map((d) => c * (BF_CARS.carLength + BF_CARS.gap) / 2 + d));
  const makeTrain = () => {
    const train = buildFleetTrain(BF_CARS);
    train.setHeading(-1); // trains pull in toward -z
    train.group.visible = false;
    scene.add(train.group);
    return { g: train.group, train };
  };

  const boardFrame = mat(0x2a2a2e);
  const tracks = {};
  for (const plat of ['1', '2']) {
    const side = SIDE[plat];
    const { g, train } = makeTrain();
    g.position.x = side * D.trackX;
    const canvas2 = document.createElement('canvas');
    canvas2.width = 512; canvas2.height = 160;
    const tex = new THREE.CanvasTexture(canvas2);
    tex.colorSpace = THREE.SRGBColorSpace;
    tracks[plat] = { plat, side, g, train, lineKey: '', tracked: null, phase: 'none', canvas: canvas2, tex, bm: new THREE.MeshBasicMaterial({ map: tex }) };
  }

  const fmtRemain = (sec) => (sec < 45 ? 'Leaving' : `${Math.ceil(sec / 60)} min`);
  const boardRowsFor = (plat) => {
    if (live.demo) return [{ dest: 'Demo train', time: 'No live data', cars: '' }];
    const elapsed = (nowMs() - live.at) / 1000;
    return live.rows
      .filter((r) => String(r.platform) === plat)
      .slice(0, 3)
      .map((r) => ({ dest: r.destination, time: fmtRemain(Math.max(0, r.minutes * 60 - elapsed)), cars: r.cars ? `${r.cars}c` : '' }));
  };
  const drawBoard = (t) => {
    const g = t.canvas.getContext('2d');
    g.fillStyle = '#140808'; g.fillRect(0, 0, 512, 160);
    g.fillStyle = '#ff4a3a'; g.textBaseline = 'top';
    g.font = 'bold 26px monospace';
    const rows = boardRowsFor(t.plat);
    if (!rows.length) g.fillText('No trains listed', 14, 14);
    rows.forEach((r, i) => {
      g.textAlign = 'left'; g.fillText(r.dest.slice(0, 16), 14, 10 + i * 34);
      g.textAlign = 'right'; g.fillText(`${r.cars ? r.cars + ' ' : ''}${r.time}`, 498, 10 + i * 34);
    });
    g.textAlign = 'right'; g.font = '16px monospace'; g.fillText(`Platform ${t.plat}`, 498, 136);
    t.tex.needsUpdate = true;
  };

  for (const [x, z] of [[-2.8, -42], [2.8, -42], [-2.8, -68], [2.8, -68]]) {
    const t = tracks[x > 0 ? '1' : '2']; // boards on the east side show platform 1, west side platform 2
    slab(x - 1.3, x + 1.3, PY + 3.05, PY + 3.85, z - 0.06, z + 0.06, boardFrame);
    slab(x - 0.03, x + 0.03, PY + 3.85, roofY, z - 0.03, z + 0.03, boardFrame);
    for (const dz of [0.08, -0.08]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.75), t.bm);
      p.position.set(x, PY + 3.45, z + dz);
      if (dz < 0) p.rotation.y = Math.PI;
      scene.add(p);
    }
  }

  // Match each platform's tracked train to the newest data.
  const syncTrack = (t, cand, at) => {
    const cur = t.tracked;
    const sec = cur ? (at - cur.etaAt) / 1000 : null;
    if (cur && sec >= -DWELL && sec < DEPART) return; // already standing at the platform or pulling out: leave it
    if (!cand) { if (!cur || sec >= DEPART) t.tracked = null; return; }
    // A reported 0 minutes means leaving now: show it standing there about to go.
    const etaAt = at + (cand.minutes === 0 ? 30 : cand.minutes * 60) * 1000;
    if (cur && sec < -DWELL && cur.dest === cand.destination) { cur.etaAt = etaAt; cur.hex = cand.hex; return; }
    t.tracked = { etaAt, hex: cand.hex, dest: cand.destination, cars: cand.cars, destAbbr: cand.destAbbr, direction: cand.direction };
  };
  const setLive = (rows, note) => {
    const at = nowMs();
    live.at = at;
    live.demo = !rows;
    live.rows = rows ? rows.filter((r) => !r.cancelled && r.minutes !== null) : null;
    live.note = note || (rows ? 'Live data' : 'Demo timing');
    for (const t of Object.values(tracks)) syncTrack(t, live.rows && live.rows.find((r) => String(r.platform) === t.plat), at);
    renderHud();
  };
  const updateTrains = () => {
    const at = nowMs();
    if (live.demo) {
      const t = tracks['1'];
      if (!t.tracked || (at - t.tracked.etaAt) / 1000 > DEPART) t.tracked = { etaAt: at + (APPROACH + DWELL + 5) * 1000, hex: null, dest: 'Demo train', cars: '' };
    }
    for (const t of Object.values(tracks)) {
      const cur = t.tracked;
      let phase = 'none', off = 0;
      if (cur) {
        const sec = (at - cur.etaAt) / 1000;
        if (sec < -(APPROACH + DWELL)) phase = 'none';
        else if (sec < -DWELL) { phase = 'approach'; off = FAR * (1 - easeOut((sec + APPROACH + DWELL) / APPROACH)); }
        else if (sec < 0) { phase = 'dwell'; }
        else if (sec < DEPART) { phase = 'depart'; off = -FAR * easeIn(sec / DEPART); }
        else { t.tracked = null; }
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

  /* ----- Street furniture: lamps, trees, cones, mailbox, stop sign, bus, hills ----- */
  const pole = mat(0x8f9399, { metalness: 0.4 });
  for (let x = -40; x <= 40; x += 16) {
    cyl(0.07, 8, x, 0, 30, pole, 8);
    slab(x - 0.5, x + 0.5, 8, 8.15, 29.7, 30.3, pole);
  }
  const treeAt = (x, z, s = 1) => {
    cyl(0.25 * s, 3 * s, x, 0, z, mat(0x5a4636), 8);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(2.6 * s, 12, 10), mat(0x4b6b32));
    crown.position.set(x, 4.6 * s, z);
    crown.scale.y = 1.2;
    scene.add(crown);
  };
  [[-30, 52], [-18, 60], [-6, 58], [8, 62], [20, 54], [34, 60], [46, 50], [-44, 40], [-52, 24], [52, 30], [-34, -8], [-30, -40], [-32, -70], [-34, -100], [32, -12], [30, -50], [30, -90], [36, -120], [-38, -130]].forEach(([x, z], i) => treeAt(x, z, 0.9 + (i % 4) * 0.15));
  const cone = (x, z) => {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.75, 12), mat(0xff5a1f));
    c.position.set(x, 0.38, z);
    scene.add(c);
    slab(x - 0.15, x + 0.15, 0.4, 0.5, z - 0.15, z + 0.15, mat(0xffffff));
    solid(x - 0.2, x + 0.2, z - 0.2, z + 0.2, 'low');
  };
  cone(-12, 14); cone(-4, 18); cone(10.5, 8);
  slab(-14, -13.4, 0, 1.15, 15.6, 16.2, mat(0x2b4a8f)); // blue mailbox
  solid(-14.1, -13.3, 15.5, 16.3, 'low');
  cyl(0.04, 2.2, -16, 0, 24, mat(0x888), 8);
  const stop = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 8), mat(0xcc2222));
  stop.rotation.x = Math.PI / 2;
  stop.rotation.z = Math.PI / 8;
  stop.position.set(-16, 2.1, 24);
  scene.add(stop);
  slab(-22, -19.5, 0.4, 3.3, 30, 41, mat(0xf0f1f2)); // parked bus
  slab(-22.02, -19.48, 1.5, 2.5, 30, 41, mat(0x2d3a44));
  for (const [x, y, z, s] of [[-70, -30, -320, 150], [90, -30, -340, 170], [0, -40, -420, 200]]) {
    const h = new THREE.Mesh(new THREE.SphereGeometry(s, 24, 12), mat(0x7a8a63));
    h.position.set(x, y, z);
    h.scale.y = 0.35;
    scene.add(h);
  }

  /* ----- Inside the train (train-ride.js): built far off to the side, shown once you board ----- */
  const ride = createTrainRide(scene, { floorY: PY, x: 400 });

  /* ----- Game state, interactions, HUD ----- */
  const game = {
    balance: Number(opts.balance) || 0, gatesOpen: false, openUntil: 0, flash: 0,
    steps: { funds: false, tapped: false, platform: false, boarded: false },
    onBoard: false,
    sitting: null,
    arrived: false,
    // where the trip on the card started (carried over when you arrive by train)
    tripFrom: (opts.trip && opts.trip.from) || null,
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
    <div class="bf-board" hidden><strong>You've arrived.</strong><span>That's the end of the demo ride.</span><div class="bf-board-btns"><button type="button" data-act="get-off" hidden>Get off here</button><button type="button" data-act="ride-again">Ride again</button><button type="button" data-act="reset">Back to the station entrance</button></div></div>
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

  const STEP_LABELS = [
    ['funds', 'Add money at a ticket machine'],
    ['tapped', 'Tap your card at a fare gate'],
    ['platform', 'Take the escalator or stairs up'],
    ['boarded', 'Board the train when the doors open'],
  ];
  const renderHud = () => {
    stepsEl.replaceChildren(...STEP_LABELS.map(([k, label]) => {
      const li = document.createElement('li');
      li.textContent = label;
      if (game.steps[k]) li.className = 'done';
      return li;
    }));
    walletEl.textContent = `Clipper card balance: $${game.balance.toFixed(2)}`;
    liveEl.textContent = live.note;
    stepsEl.hidden = game.onBoard;
    rideEl.hidden = !game.onBoard;
    const r = game.onBoard && ride.state;
    if (r) {
      const eta = r.eta == null ? '' : ` in ${Math.floor(r.eta / 60)}:${String(Math.floor(r.eta % 60)).padStart(2, '0')}`;
      const status = { boarding: 'Doors open', closing: 'Doors closing', moving: `Next stop: ${r.next}${eta}`, arriving: `Now arriving: ${r.next}`, arrived: `Arrived at ${r.next}` }[r.phase];
      rideEl.innerHTML = '';
      const a = document.createElement('strong'); a.textContent = `Train to ${r.dest}`;
      const b = document.createElement('span'); b.textContent = `${status} · ${Math.round(r.speed * 3.6)} km/h${r.remaining > 0 ? ` · ${r.remaining} more stop${r.remaining === 1 ? '' : 's'}` : ''}`;
      const c = document.createElement('span'); c.className = 'bf-ride-tip';
      c.textContent = r.here ? `Doors open at ${r.here.name}. Walk to a door on the ${r.here.doors} and press E to get off.`
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

  const gates = createFareGates({ opts, game, here: { abbr: 'BAYF', name: 'Bay Fair' }, toast, beep, onChange: () => renderHud() });

  const P = { x: 0, z: 20, y: 0, yaw: 0, pitch: -0.05 };
  const SPOTS = {
    entrance: { x: 0, z: 22, yaw: 0 },
    machines: { x: 6.5, z: 3, yaw: 0 },
    gates: { x: 0, z: 3.5, yaw: 0 },
    hall: { x: 0, z: -7, yaw: 0 },
    platform: { x: 0, z: -22, yaw: 0 },
    'platform-train': { x: 1.5, z: -45, yaw: -Math.PI / 2 },
  };

  const inBand = (b, x) => x > b.x0 && x < b.x1;
  const onRamp = (x, z) => z <= D.rampZ0 && z >= D.platformZ0 && (inBand(ESC, x) || inBand(STAIR, x));
  const groundAt = (x, z, curY) => {
    if (onRamp(x, z)) return ((D.rampZ0 - z) / run) * rise;
    if (z < D.platformZ0 && Math.abs(x) < edge && curY > rise / 2) return PY;
    return 0;
  };
  const inEscalator = (x, z) => onRamp(x, z) && inBand(ESC, x);

  const keys = new Set();
  const touch = { f: 0, b: 0, l: 0, r: 0 };

  const interactables = [
    {
      test: () => P.y < 1 && Math.hypot(P.x - 6.5, P.z - 0.6) < 2.6 && P.z > 0.4,
      label: () => `Press E: add $${D.topUp} to your Clipper card`,
      run() {
        game.balance += D.topUp;
        game.steps.funds = true;
        beep(660);
        toast(`Added $${D.topUp}. Balance is $${game.balance.toFixed(2)}. Now walk to the fare gates.`);
      },
    },
    {
      test: () => P.y < 1 && Math.abs(P.x) < 4.6 && P.z > -0.1 && P.z < 2.4,
      label: () => gates.inLabel(),
      run() { gates.tapIn(); },
    },
    {
      // the same gates from the paid side: tap out, pay BART's fare for the trip
      test: () => P.y < 1 && Math.abs(P.x) < 4.6 && P.z < D.gateZ - 0.4 && P.z > -3.4,
      label: () => gates.outLabel(),
      run() { gates.tapOut(); },
    },
    {
      test: () => P.y < 1 && Math.hypot(P.x + 7, P.z - 3.4) < 2.6,
      label: () => 'Press E: talk to the station agent',
      run() { toast('Station agent: "Fare gates are straight ahead. Add money at the machines first if you need to. Escalator and stairs are past the gates."', 6000); },
    },
    {
      test: () => game.steps.platform && !!boardable(),
      label: () => 'Press E: board the train',
      run() {
        const t = boardable();
        if (!t) return;
        game.steps.boarded = true;
        startRide({ dest: t.tracked.dest, color: t.tracked.hex, destAbbr: t.tracked.destAbbr, direction: t.tracked.direction });
      },
    },
  ];
  // Things you can do inside the train.
  const nearestSeat = () => {
    let best = null, bd = 0.9;
    for (const s of ride.seats) { const d = Math.hypot(P.x - s.x, P.z - s.z); if (d < bd) { bd = d; best = s; } }
    return best;
  };
  const rideActs = [
    {
      // Doors open at a station and you're standing in a doorway: step off here.
      test: () => !game.sitting && !!(ride.state && ride.state.here) && atDoor(P.x, P.z, ride.state.here.doors),
      label: () => `Press E: get off at ${ride.state.here.name}`,
      run() { getOff(ride.state.here.index); },
    },
    {
      test: () => !!game.sitting,
      label: () => 'Press E: stand up',
      run() { standUp(); },
    },
    {
      test: () => !game.sitting && !!nearestSeat(),
      label: () => (nearestSeat().priority ? 'Press E: sit down (priority seat)' : 'Press E: sit down'),
      run() {
        const s = nearestSeat();
        game.sitting = { x0: P.x, z0: P.z };
        P.x = s.x; P.z = s.z; P.yaw = s.yaw; P.pitch = -0.08;
        renderHud();
      },
    },
  ];
  const standUp = () => {
    if (!game.sitting) return;
    P.x = game.sitting.x0; P.z = game.sitting.z0;
    game.sitting = null;
    renderHud();
  };
  let rideInfo = null;
  const startRide = ({ dest, color, destAbbr, direction }) => {
    game.onBoard = true;
    game.arrived = false;
    game.sitting = null;
    // The network knows every stop this train makes; fall back to the next stop, then to the old guess.
    const req = { from: 'BAYF', destAbbr, hex: color, direction };
    const route = (opts.route && destAbbr && opts.route(req)) || [];
    const nx = route[0] || (opts.nextStop && destAbbr && opts.nextStop(req)) || null;
    const stops = route.length ? route : nx ? [nx] : [];
    const nextName = nx ? nx.name : nextStopFrom(dest);
    rideInfo = { dest, color, destAbbr, direction, next: nx, stops };
    boardEl.hidden = true;
    // Bay Fair is an elevated island platform: the doors open on the left
    const origin = { doors: 'left', layout: 'island', level: 'elevated' };
    ride.start({ dest, color, next: nextName, stops: stops.map((x) => x.name), legs: stops.map((x) => x.meters), looks: stops, origin, from: 'Bay Fair' });
    // step in through the center door on the left, facing into the car
    P.x = -0.95; P.z = 0; P.y = 0; P.yaw = -Math.PI / 2; P.pitch = -0.05;
    beep(520, 0.2);
    toast(`Welcome aboard the train to ${dest}. Next stop: ${nextName}.`, 4500);
    renderHud();
  };
  const stopRide = () => {
    ride.stop();
    game.onBoard = false;
    game.sitting = null;
    game.arrived = false;
  };
  const chime = (notes) => notes.forEach(([f, d], i) => setTimeout(() => beep(f, d), i * 260));
  // Step off at stop `index` of the route: load that station with you on its platform.
  const getOff = (index) => {
    const stop = rideInfo && rideInfo.stops[index];
    if (stop && stop.abbr && opts.onExit) { opts.onExit(stop.abbr, { balance: game.balance, tripFrom: game.tripFrom }); return; }
    // Not a station we can load (no network data): end the demo ride with the menu.
    boardEl.querySelector('strong').textContent = `You got off at ${ride.state ? ride.state.here?.name || ride.state.next : 'the station'}.`;
    boardEl.querySelector('span').textContent = 'That\'s the end of the demo ride. You can ride again or go back to Bay Fair.';
    hud.querySelector('[data-act="get-off"]').hidden = true;
    boardEl.hidden = false;
  };
  const onRideEvent = (e, r) => {
    if (e === 'closing') { chime([[784, 0.18], [659, 0.18], [523, 0.32]]); toast('Doors closing. Please stand clear.'); }
    if (e === 'departed') toast(`Next stop: ${r.next}${r.last ? ', the last stop' : ''}.`);
    if (e === 'arriving') { chime([[523, 0.2], [659, 0.3]]); toast(`Now arriving at ${r.next}${r.last ? ', the last stop on this train' : ''}. Doors will open on the ${r.doors}.`, 5000); }
    if (e === 'opened') {
      game.arrived = true;
      chime([[523, 0.18], [659, 0.18], [784, 0.3]]);
      if (!r.last) { toast(`This is ${r.next}. To get off, walk to a door on the ${r.doors} and press E.`, 6000); return; }
      toast(`This is ${r.next}, the last stop. Everyone please leave the train: walk to a door and press E.`, 7000);
      // End of the line: if you stay on, offer the menu after a while.
      setTimeout(() => {
        const now = ride.state;
        if (!game.onBoard || !now || !now.last || now.phase !== 'arrived') return;
        boardEl.querySelector('strong').textContent = `End of the line: ${r.next}.`;
        const canExit = !!(rideInfo && rideInfo.stops.length && opts.onExit);
        boardEl.querySelector('span').textContent = canExit
          ? `This train doesn't go any further. Get off to walk around ${r.next}, ride again, or go back to Bay Fair.`
          : 'That\'s the end of the demo ride. You can ride again or go back to Bay Fair.';
        const off = hud.querySelector('[data-act="get-off"]');
        off.hidden = !canExit;
        off.textContent = `Get off at ${r.next}`;
        boardEl.hidden = false;
      }, 10_000);
    }
  };
  // A train standing at a platform, on the side the player is standing on, with a door close by.
  const boardable = () => Object.values(tracks).find((t) => t.phase === 'dwell' && P.y > PY - 0.5 && P.x * t.side > 1.5 && DOOR_Z.some((dz) => Math.abs(P.z - (D.trainStopZ + dz)) < 1.9));
  let activeAct = null;
  const interact = () => { if (activeAct) { activeAct.run(); renderHud(); } };

  const reset = (spot = 'entrance') => {
    stopRide();
    Object.assign(game, { balance: 0, gatesOpen: false, openUntil: 0, flash: 0, onBoard: false, steps: { funds: false, tapped: false, platform: false, boarded: false }, tripFrom: null });
    boardEl.hidden = true;
    teleport(spot);
    renderHud();
  };
  const teleport = (name) => {
    if (game.onBoard) { stopRide(); boardEl.hidden = true; renderHud(); }
    const s = SPOTS[name] || SPOTS.entrance;
    P.x = s.x; P.z = s.z; P.yaw = s.yaw; P.pitch = -0.05;
    P.y = groundAt(P.x, P.z, name.startsWith('platform') ? 99 : 0);
  };

  /* ----- Input ----- */
  const KEYMAP = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };
  const onKeyDown = (e) => {
    if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat) interact(); return; }
    if (KEYMAP[e.code]) { e.preventDefault(); keys.add(KEYMAP[e.code]); }
    if (e.key === 'Shift') keys.add('run');
  };
  const onKeyUp = (e) => {
    if (KEYMAP[e.code]) keys.delete(KEYMAP[e.code]);
    if (e.key === 'Shift') keys.delete('run');
  };
  const onBlur = () => keys.clear();
  host.addEventListener('keydown', onKeyDown);
  host.addEventListener('keyup', onKeyUp);
  host.addEventListener('blur', onBlur);

  let dragging = false, lastX = 0, lastY = 0;
  canvas.addEventListener('pointerdown', (e) => {
    host.focus({ preventScroll: true });
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
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
    if (act.dataset.act === 'ride-again' && rideInfo) startRide(rideInfo);
    if (act.dataset.act === 'get-off' && rideInfo && rideInfo.stops.length) getOff(rideInfo.stops.length - 1);
  });

  /* ----- Movement and collisions ----- */
  const collide = (list = colliders, high = P.y > rise / 2) => {
    for (const c of list) {
      if (c.level === 'low' && high) continue;
      if (c.level === 'high' && !high) continue;
      if (c.when && !c.when()) continue;
      const cx = clamp(P.x, c.x0, c.x1), cz = clamp(P.z, c.z0, c.z1);
      let dx = P.x - cx, dz = P.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= D.radius * D.radius) continue;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2), push = D.radius - d;
        P.x += (dx / d) * push; P.z += (dz / d) * push;
      } else {
        // centre is inside the box: push out through the nearest face
        const opts = [[P.x - c.x0, -1, 0], [c.x1 - P.x, 1, 0], [P.z - c.z0, 0, -1], [c.z1 - P.z, 0, 1]].sort((a, b) => a[0] - b[0])[0];
        P.x += opts[1] * (opts[0] + D.radius); P.z += opts[2] * (opts[0] + D.radius);
      }
    }
    if (list !== colliders) return;
    P.x = clamp(P.x, -23, 23);
    P.z = clamp(P.z, -88.5, 40);
  };

  const step = (dt) => {
    const f = (keys.has('f') || touch.f ? 1 : 0) - (keys.has('b') || touch.b ? 1 : 0);
    const s = (keys.has('r') || touch.r ? 1 : 0) - (keys.has('l') || touch.l ? 1 : 0);
    if (game.onBoard) {
      // Inside the car: walk the aisle, no running, walls and seats block you.
      if (game.sitting) { if (f || s) standUp(); else return; }
      const len = Math.hypot(f, s) || 1;
      const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
      P.x += ((fx * f + rx * s) / len) * D.walk * 0.7 * dt;
      P.z += ((fz * f + rz * s) / len) * D.walk * 0.7 * dt;
      collide(ride.colliders, true);
      P.x = clamp(P.x, -ride.bounds.x, ride.bounds.x);
      P.z = clamp(P.z, -ride.bounds.z, ride.bounds.z);
      return;
    }
    const speed = keys.has('run') ? D.run : D.walk;
    const len = Math.hypot(f, s) || 1;
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
    P.x += ((fx * f + rx * s) / len) * speed * dt;
    P.z += ((fz * f + rz * s) / len) * speed * dt;
    if (inEscalator(P.x, P.z)) P.z -= D.escalatorSpeed * dt;
    // sub-step collision a little to avoid tunnelling at run speed
    collide();
    const target = groundAt(P.x, P.z, P.y);
    P.y += (target - P.y) * Math.min(1, dt * 12);
    if (!game.steps.platform && P.y > PY - 0.5 && P.z < D.platformZ0 - 0.5) { game.steps.platform = true; toast('You made it up to the platform. Wait for a train and board when the doors open.'); renderHud(); }
    // gates close again after 10 s once nobody is standing in them
    if (game.gatesOpen && performance.now() > game.openUntil && !(P.z > -2 && P.z < 0.2 && Math.abs(P.x) < 4.6 && P.y < 1 && Math.abs(P.z - D.gateZ) < 1.2)) {
      game.gatesOpen = false;
    }
    if (game.flash > 0) game.flash -= dt;
  };

  /* ----- Resize and render loop ----- */
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

  let last = 0, hudTick = 0, boardTick = 99;
  if (opts.spawn === 'platform') {
    // arrived by train from another station: already paid and on the platform
    Object.assign(game.steps, { funds: true, tapped: true, platform: true });
    teleport('platform-train');
    toast('Welcome to Bay Fair. Tap out at the gates to leave, or catch another train.', 5000);
  } else {
    teleport('entrance');
  }
  renderHud();

  renderer.setAnimationLoop((ms) => {
    const dt = Math.min(0.05, last ? (ms - last) / 1000 : 0.016);
    last = ms;
    step(dt);
    updateTrains();
    boardTick += dt;
    if (boardTick > 1) { boardTick = 0; for (const t of Object.values(tracks)) drawBoard(t); }

    // gate indicator lights
    const showOk = game.gatesOpen;
    const showNo = game.flash > 0 && Math.floor(game.flash * 6) % 2 === 0;
    for (const m of gateLights) m.map = showOk ? arrowOk : arrowNo, m.color.setScalar(showOk || showNo ? 1 : 0.35);
    for (const f of flaps) f.visible = !game.gatesOpen;

    // the ride: move the train, play its events
    const r = game.onBoard ? ride.update(dt) : null;
    if (r) for (const e of r.events) onRideEvent(e, r);

    // interaction prompt (check every frame, cheap)
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
    getState: () => ({ x: P.x, y: P.y, z: P.z, yaw: P.yaw, balance: game.balance, gatesOpen: game.gatesOpen, steps: { ...game.steps }, trains: { 1: tracks['1'].phase, 2: tracks['2'].phase }, live: live.demo ? 'demo' : 'live', ride: game.onBoard ? { ...ride.state, sitting: !!game.sitting } : null }),
    // Test hooks: let scripts press interact and skip the clock without a keyboard.
    _interact: interact,
    _skip(sec) { if (game.onBoard) ride.skip(sec); else skew += sec * 1000; },
    _move(x, z, y = null) { P.x = x; P.z = z; if (y !== null) P.y = y; },
    _look(yaw, pitch = -0.05) { P.yaw = yaw; P.pitch = pitch; },
    dispose() { renderer.setAnimationLoop(null); ro.disconnect(); host.removeEventListener('keydown', onKeyDown); host.removeEventListener('keyup', onKeyUp); host.removeEventListener('blur', onBlur); scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); renderer.dispose(); hud.remove(); canvas.remove(); },
  };
}