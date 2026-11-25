// Outside of a BART "Fleet of the Future" train, modeled on photos of the cars in service:
//   - brushed stainless sides, fluted below the windows
//   - big rounded windows that show the lit interior (blue seats, lime priority seats)
//   - three doors per side per car, stainless with tall windows and a black center seal
//   - a white cab end with a large dark windshield, an amber LED destination sign at the top
//     of the windshield, and a light-blue swoosh on the side behind the cab
// Shapes and sizes are estimates (car about 21 m long, 3.2 m wide). No logos.
//
// Group-local coordinates: x across the train, y up from the car floor (which sits at floorY),
// z along the train. The train is centered on z = 0.

import * as THREE from 'three';

const TAU = Math.PI * 2;

function canvasTex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
const cssHex = (hex) => (typeof hex === 'number' ? `#${hex.toString(16).padStart(6, '0')}` : (/^#?[0-9a-f]{6}$/i.test(hex || '') ? (hex[0] === '#' ? hex : `#${hex}`) : '#8a8f98'));

// Shared textures (built once, reused by every train on the page).
let shared = null;
function sharedParts(carLength, doorZ) {
  const key = `${carLength}:${doorZ.join(',')}`;
  if (shared && shared.key === key) return shared;
  const HL = carLength / 2;
  let seed = 5;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // Window band: y from 0.88 to 2.0 m above the floor, the whole car length.
  const BAND_W = 2048, BAND_H = 112;
  const pxPerM = BAND_W / carLength;
  const zpx = (z) => (z + HL) * pxPerM;
  const DOOR_HALF = 0.68, PILLAR = 0.32;
  const spans = [];
  let a = -HL + 0.9;
  for (const d of doorZ) { spans.push([a, d - DOOR_HALF - PILLAR]); a = d + DOOR_HALF + PILLAR; }
  spans.push([a, HL - 0.9]);
  const paintInterior = (g, x, y, w, h, nearDoor) => {
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, '#fbfcfa'); gr.addColorStop(0.35, '#e4eaeb'); gr.addColorStop(1, '#aeb9bd');
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    // the far windows, seen across the car
    g.fillStyle = 'rgba(150,175,190,.55)'; g.fillRect(x, y + h * 0.18, w, h * 0.3);
    // seat backs
    const seatW = 0.48 * pxPerM;
    for (let sx = x + 4; sx < x + w - seatW * 0.5; sx += seatW + 6) {
      g.fillStyle = nearDoor ? '#b9cf2c' : '#2a6fc0';
      roundRect(g, sx, y + h * 0.6, seatW, h * 0.42, 8); g.fill();
      if (rand() < 0.22) { // a rider
        g.fillStyle = ['#2b2b30', '#5b3a2a', '#3a4a6a', '#7a2a2a', '#d0c0a0'][Math.floor(rand() * 5)];
        roundRect(g, sx + seatW * 0.15, y + h * 0.48, seatW * 0.7, h * 0.5, 10); g.fill();
        g.fillStyle = ['#e0b090', '#8a5a3a', '#c89070', '#5a3a2a'][Math.floor(rand() * 4)];
        g.beginPath(); g.arc(sx + seatW / 2, y + h * 0.38, h * 0.1, 0, TAU); g.fill();
      }
    }
    // ceiling light strip
    g.fillStyle = 'rgba(255,255,248,.95)'; g.fillRect(x, y + 2, w, 5);
  };
  const band = canvasTex(BAND_W, BAND_H, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    spans.forEach(([s0, s1]) => {
      const n = Math.max(1, Math.round((s1 - s0) / 1.9));
      const step = (s1 - s0) / n;
      for (let i = 0; i < n; i++) {
        const x0 = zpx(s0 + i * step + 0.08), x1 = zpx(s0 + (i + 1) * step - 0.08);
        const zc = s0 + (i + 0.5) * step;
        const nearDoor = doorZ.some((d) => Math.abs(d - zc) < 2.2);
        g.save();
        roundRect(g, x0, 6, x1 - x0, h - 12, 16);
        g.clip();
        paintInterior(g, x0, 6, x1 - x0, h - 12, nearDoor);
        const sh = g.createLinearGradient(x0, 0, x1, h);
        sh.addColorStop(0, 'rgba(255,255,255,.22)'); sh.addColorStop(0.4, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(255,255,255,.08)');
        g.fillStyle = sh; g.fillRect(x0, 0, x1 - x0, h);
        g.restore();
        g.strokeStyle = '#30363d'; g.lineWidth = 6;
        roundRect(g, x0, 6, x1 - x0, h - 12, 16); g.stroke();
      }
    });
  });

  // Doors: 1.36 m wide, 1.98 m tall
  const door = canvasTex(256, 384, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, '#aeb4ba'); gr.addColorStop(0.5, '#d9dde1'); gr.addColorStop(1, '#b4babf');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 3) { g.fillStyle = `rgba(255,255,255,${0.03 + Math.random() * 0.04})`; g.fillRect(0, y, w, 1); }
    g.strokeStyle = '#4a5057'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
    g.fillStyle = '#16181b'; g.fillRect(w / 2 - 4, 0, 8, h);
    const wy0 = h * (1 - 1.8 / 1.98), wy1 = h * (1 - 0.98 / 1.98);
    for (const x of [18, w / 2 + 14]) {
      g.save(); roundRect(g, x, wy0, w / 2 - 32, wy1 - wy0, 14); g.clip();
      paintInterior(g, x, wy0, w / 2 - 32, wy1 - wy0, true);
      g.restore();
      g.strokeStyle = '#2a2f35'; g.lineWidth = 5; roundRect(g, x, wy0, w / 2 - 32, wy1 - wy0, 14); g.stroke();
    }
    // small bike / accessibility decals near the bottom
    g.fillStyle = '#2f8f3a'; g.fillRect(28, h * 0.72, 26, 26);
    g.fillStyle = '#1f5fae'; g.fillRect(w - 54, h * 0.72, 26, 26);
  });
  const doorGlow = canvasTex(256, 384, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const wy0 = h * (1 - 1.8 / 1.98), wy1 = h * (1 - 0.98 / 1.98);
    g.fillStyle = '#9a9a96';
    for (const x of [18, w / 2 + 14]) { roundRect(g, x, wy0, w / 2 - 32, wy1 - wy0, 14); g.fill(); }
  });

  // Fluted stainless below the windows
  const flute = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#c4c9ce'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) {
      g.fillStyle = '#e9ecef'; g.fillRect(0, y, w, 3);
      g.fillStyle = '#9aa1a8'; g.fillRect(0, y + 11, w, 3);
    }
  }, true);

  // Blue swoosh behind the cab
  const swoosh = canvasTex(256, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#2ba6e0';
    g.beginPath();
    g.moveTo(w * 0.92, h); g.lineTo(w * 0.56, h);
    g.bezierCurveTo(w * 0.45, h * 0.6, w * 0.3, h * 0.3, w * 0.05, 0);
    g.lineTo(w * 0.42, 0);
    g.bezierCurveTo(w * 0.62, h * 0.3, w * 0.8, h * 0.6, w * 0.92, h);
    g.fill();
    g.fillStyle = '#1b86c4';
    g.beginPath();
    g.moveTo(w * 0.92, h); g.lineTo(w * 0.84, h);
    g.bezierCurveTo(w * 0.72, h * 0.6, w * 0.55, h * 0.3, w * 0.36, 0);
    g.lineTo(w * 0.42, 0);
    g.bezierCurveTo(w * 0.62, h * 0.3, w * 0.8, h * 0.6, w * 0.92, h);
    g.fill();
  });

  const windshield = canvasTex(256, 160, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#0d1116'); gr.addColorStop(0.6, '#1c252e'); gr.addColorStop(1, '#2a343e');
    g.fillStyle = gr; roundRect(g, 0, 0, w, h, 26); g.fill();
    const sh = g.createLinearGradient(0, 0, w, h);
    sh.addColorStop(0.15, 'rgba(255,255,255,0)'); sh.addColorStop(0.3, 'rgba(255,255,255,.18)'); sh.addColorStop(0.45, 'rgba(255,255,255,0)');
    g.fillStyle = sh; roundRect(g, 0, 0, w, h, 26); g.fill();
    g.strokeStyle = '#30373e'; g.lineWidth = 4; g.beginPath(); g.moveTo(w * 0.5, h - 8); g.lineTo(w * 0.28, h * 0.25); g.stroke();
  });

  const M = {
    body: new THREE.MeshStandardMaterial({ color: 0xd5d9dd, metalness: 0.55, roughness: 0.36 }),
    roof: new THREE.MeshStandardMaterial({ color: 0xb9bec3, metalness: 0.4, roughness: 0.5 }),
    flute: (() => { const t = flute.clone(); t.needsUpdate = true; t.repeat.set(carLength / 2, 1.24 / 0.25); return new THREE.MeshStandardMaterial({ map: t, metalness: 0.55, roughness: 0.34 }); })(),
    band: new THREE.MeshStandardMaterial({ map: band, transparent: true, alphaTest: 0.35, emissive: 0xffffff, emissiveMap: band, emissiveIntensity: 0.5, roughness: 0.12 }),
    door: new THREE.MeshStandardMaterial({ map: door, emissive: 0xffffff, emissiveMap: doorGlow, emissiveIntensity: 0.5, metalness: 0.45, roughness: 0.35 }),
    swoosh: new THREE.MeshStandardMaterial({ map: swoosh, transparent: true, alphaTest: 0.3, roughness: 0.35 }),
    nose: new THREE.MeshStandardMaterial({ color: 0xf2f4f5, metalness: 0.1, roughness: 0.28 }),
    black: new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.4 }),
    under: new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.8 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.9 }),
    glass: new THREE.MeshStandardMaterial({ map: windshield, roughness: 0.08, metalness: 0.3 }),
    head: new THREE.MeshBasicMaterial({ color: 0xfff6e0, toneMapped: false }),
    tail: new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false }),
    wheel: new THREE.MeshStandardMaterial({ color: 0x55585c, metalness: 0.7, roughness: 0.4 }),
  };

  // Car cross-section: slightly bulged sides, rounded roof edges. y = 0 is the floor.
  const sec = new THREE.Shape();
  sec.moveTo(-1.5, -0.4);
  sec.lineTo(1.5, -0.4);
  sec.lineTo(1.6, -0.25);
  sec.lineTo(1.62, 2.2);
  sec.quadraticCurveTo(1.6, 2.92, 1.12, 3.06);
  sec.lineTo(-1.12, 3.06);
  sec.quadraticCurveTo(-1.6, 2.92, -1.62, 2.2);
  sec.lineTo(-1.6, -0.25);
  sec.closePath();
  const bodyGeo = new THREE.ExtrudeGeometry(sec, { depth: carLength, bevelEnabled: false, curveSegments: 10 });
  bodyGeo.translate(0, 0, -HL);

  // Cab nose, side profile (z forward, y up), extruded across the train.
  const prof = new THREE.Shape();
  prof.moveTo(0, -0.4);
  prof.lineTo(0.9, -0.4);
  prof.quadraticCurveTo(1.12, -0.32, 1.13, 0.3);
  prof.lineTo(1.08, 0.95);
  prof.lineTo(0.64, 2.42);
  prof.quadraticCurveTo(0.44, 2.98, 0, 3.06);
  prof.closePath();
  const noseGeo = new THREE.ExtrudeGeometry(prof, { depth: 2.98, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 4, curveSegments: 12 });
  noseGeo.rotateY(-Math.PI / 2);
  noseGeo.translate(1.49, 0, 0);

  shared = { key, M, bodyGeo, noseGeo };
  return shared;
}

export function buildFleetTrain({ cars = 3, carLength = 21.3, gap = 0.7, floorY = 0, doorZ = [-6.9, 0, 6.9] } = {}) {
  const { M, bodyGeo, noseGeo } = sharedParts(carLength, doorZ);
  const HL = carLength / 2;
  const span = cars * carLength + (cars - 1) * gap;
  const carZ = Array.from({ length: cars }, (_, i) => -span / 2 + HL + i * (carLength + gap));
  const group = new THREE.Group();
  const root = new THREE.Group();
  root.position.y = floorY;
  group.add(root);

  const add = (geo, m, x, y, z, parent = root) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); parent.add(mesh); return mesh; };
  const box = (x0, x1, y0, y1, z0, z1, m, parent = root) => add(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), m, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, parent);
  const sidePlane = (w, h, m, s, y, z, out = 0) => {
    const p = add(new THREE.PlaneGeometry(w, h), m, s * (1.628 + out), y, z);
    p.rotation.y = s * Math.PI / 2;
    return p;
  };
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.14, 18);

  carZ.forEach((cz, ci) => {
    add(bodyGeo, M.body, 0, 0, cz);
    for (const s of [-1, 1]) {
      sidePlane(carLength - 0.3, 1.18, M.flute, s, 0.29, cz, -0.002);
      sidePlane(carLength, 1.12, M.band, s, 1.44, cz, 0.004);
      for (const d of doorZ) sidePlane(1.36, 1.98, M.door, s, 0.99, cz + d, 0.008);
      box(s * 1.6 - 0.03, s * 1.6 + 0.03, 2.14, 2.2, cz - HL, cz + HL, M.black); // rain gutter line
    }
    // roof equipment
    for (const dz of [-HL * 0.55, HL * 0.55]) box(-0.95, 0.95, 3.0, 3.32, cz + dz - 1.8, cz + dz + 1.8, M.roof);
    // underframe and trucks
    box(-1.25, 1.25, -0.62, -0.4, cz - HL + 1, cz + HL - 1, M.under);
    for (const tz of [-HL + 3.1, HL - 3.1]) {
      box(-1.15, 1.15, -0.6, -0.36, cz + tz - 1.3, cz + tz + 1.3, M.under);
      for (const wz of [-0.95, 0.95]) for (const s of [-1, 1]) {
        const w = add(wheelGeo, M.wheel, s * 0.84, -0.21, cz + tz + wz);
        w.rotation.z = Math.PI / 2;
      }
    }
    // gangway bellows to the next car
    if (ci < cars - 1) box(-1.2, 1.2, -0.1, 2.5, cz + HL - 0.05, cz + HL + gap + 0.05, M.rubber);
  });

  // Cab ends (front and back)
  const destCanvas = document.createElement('canvas');
  destCanvas.width = 512; destCanvas.height = 80;
  const destTex = new THREE.CanvasTexture(destCanvas);
  destTex.colorSpace = THREE.SRGBColorSpace;
  const destMat = new THREE.MeshBasicMaterial({ map: destTex, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const lightMats = [];
  [1, -1].forEach((dir, k) => {
    const endZ = dir > 0 ? carZ[cars - 1] + HL : carZ[0] - HL;
    const cab = new THREE.Group();
    cab.position.z = endZ;
    if (dir < 0) cab.rotation.y = Math.PI;
    root.add(cab);
    add(noseGeo, M.nose, 0, 0, 0, cab);
    // dark band around the windshield, windshield, destination sign
    const tilt = -Math.atan2(1.08 - 0.64, 2.42 - 0.95);
    const surround = add(new THREE.PlaneGeometry(2.9, 1.78), M.black, 0, 1.68, 0.985, cab);
    surround.rotation.x = tilt;
    const ws = add(new THREE.PlaneGeometry(2.5, 1.42), M.glass, 0, 1.66, 0.997, cab);
    ws.rotation.x = tilt;
    const sign = add(new THREE.PlaneGeometry(1.5, 0.24), destMat, 0, 2.2, 0.85, cab);
    sign.rotation.x = tilt;
    // headlights (white at the front, red at the back)
    const lm = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    lightMats.push({ m: lm, front: k === 0 });
    for (const s of [-1, 1]) {
      const h = add(new THREE.CircleGeometry(0.11, 20), lm, s * 1.0, 0.58, 1.232, cab);
      h.rotation.x = -0.05;
    }
    box(-0.75, 0.75, -0.42, -0.1, 0.9, 1.3, M.black, cab); // coupler / anticlimber
    // blue swoosh on both sides behind the cab
    for (const s of [-1, 1]) {
      const sw = add(new THREE.PlaneGeometry(2.4, 3.3), M.swoosh, s * 1.64, 1.25, -1.4, cab);
      sw.rotation.y = s * Math.PI / 2;
      if (s < 0) sw.scale.x = -1;
    }
  });

  const setLine = (hex, dest = '') => {
    const g = destCanvas.getContext('2d');
    g.fillStyle = '#050505'; g.fillRect(0, 0, 512, 80);
    g.fillStyle = cssHex(hex); g.fillRect(12, 18, 44, 44);
    g.fillStyle = '#ffb02e'; g.textBaseline = 'middle';
    let px = 46;
    const text = dest || 'BART';
    do { g.font = `bold ${px}px "Helvetica Neue", Arial, sans-serif`; px -= 2; } while (px > 18 && g.measureText(text).width > 430);
    g.fillText(text, 70, 42);
    destTex.needsUpdate = true;
  };
  // Which end leads: +1 means the train is heading toward +z.
  const setHeading = (dir) => {
    for (const { m, front } of lightMats) m.color.set((dir > 0) === front ? 0xfff6e0 : 0xff2a1a);
  };
  setLine(null, '');
  setHeading(1);

  return {
    group,
    carZ,
    doorZ: carZ.flatMap((c) => doorZ.map((d) => c + d)),
    setLine,
    setHeading,
    dispose() { destTex.dispose(); },
  };
}
