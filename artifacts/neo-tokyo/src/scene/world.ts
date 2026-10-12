import * as THREE from 'three';

export const BLOCK = 60;
export const EXT = 14;
export const BOUND = 830;
export const EYE = 1.7;
const ENTRY: [number, number, number] = [0, EYE, 12];

export const LANDMARKS = {
  tower: { x: -330, z: -650, r: 75, name: 'Tokyo Tower', jp: '東京タワー', short: 'TOWER' },
  skytree: { x: -630, z: 690, r: 70, name: 'Tokyo Skytree', jp: 'スカイツリー', short: 'SKYTREE' },
  cocoon: { x: 270, z: -450, r: 70, name: 'Cocoon Tower', jp: 'コクーンタワー', short: 'COCOON' },
} as const;

export const TINTS = ['#ff2d75', '#00e5ff', '#ffb21e', '#a45bff', '#ff4a2a', '#3dffb5', '#ff6ad5', '#2f7bff'];

export function rng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const roadHalf = (k: number) => (k === 0 ? 14 : 7);

export interface Building {
  cx: number; cz: number; hw: number; hd: number; h: number;
  tint: THREE.Color; seed: number;
  faces: [boolean, boolean, boolean, boolean]; // +x, -x, +z, -z exterior (street facing)
  screen: boolean; cyl: boolean; i: number; j: number;
}
export interface Piece { cx: number; cz: number; hw: number; hd: number; y0: number; y1: number; tint: THREE.Color; seed: number }
export interface Block { x0: number; x1: number; z0: number; z1: number; plaza: boolean }
export interface AABB { minX: number; maxX: number; minZ: number; maxZ: number; h: number }
export interface Sign { x: number; y: number; z: number; rotY: number; w: number; h: number; cell: number; vertical: boolean }

export interface City {
  buildings: Building[];
  pieces: Piece[];
  far: Piece[];
  blocks: Block[];
  boxes: AABB[];
  signs: Sign[];
}

const FACE_N: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function nearLandmark(x: number, z: number, pad: number) {
  for (const l of Object.values(LANDMARKS)) {
    if (Math.hypot(x - l.x, z - l.z) < l.r + pad) return true;
  }
  return false;
}

// Keep the recognizable upper silhouettes visible from the arrival crossing.
// Random high-rises otherwise completely hide Tokyo's landmarks at eye level.
function landmarkSightlineCeiling(x: number, z: number, hw: number, hd: number) {
  let ceiling = Infinity;
  const targets = [
    { ...LANDMARKS.tower, reveal: 115 },
    { ...LANDMARKS.cocoon, reveal: 100 },
    { ...LANDMARKS.skytree, reveal: 250 },
  ];
  for (const target of targets) {
    const vx = target.x - ENTRY[0], vz = target.z - ENTRY[2];
    const length = Math.hypot(vx, vz);
    const px = x - ENTRY[0], pz = z - ENTRY[2];
    const fraction = (px * vx + pz * vz) / (length * length);
    if (fraction <= 0 || fraction >= 0.97) continue;
    const lateral = Math.abs(px * vz - pz * vx) / length;
    if (lateral > Math.hypot(hw, hd) + 5 + target.r * fraction) continue;
    ceiling = Math.min(ceiling, Math.max(9, EYE + (target.reveal - EYE) * fraction - 4));
  }
  return ceiling;
}

function generate(): City {
  const r = rng(20470611);
  const buildings: Building[] = [];
  const pieces: Piece[] = [];
  const far: Piece[] = [];
  const blocks: Block[] = [];
  const signs: Sign[] = [];
  const tints = TINTS.map((t) => new THREE.Color(t));

  for (let i = -EXT; i < EXT; i++) {
    for (let j = -EXT; j < EXT; j++) {
      const x0 = i * BLOCK + roadHalf(i);
      const x1 = (i + 1) * BLOCK - roadHalf(i + 1);
      const z0 = j * BLOCK + roadHalf(j);
      const z1 = (j + 1) * BLOCK - roadHalf(j + 1);
      const bcx = (x0 + x1) / 2;
      const bcz = (z0 + z1) / 2;
      if (nearLandmark(bcx, bcz, 30)) {
        blocks.push({ x0, x1, z0, z1, plaza: true });
        continue;
      }
      blocks.push({ x0, x1, z0, z1, plaza: false });
      const mx0 = i === 0 ? 6 : 3;
      const mx1 = i + 1 === 0 ? 6 : 3;
      const mz0 = j === 0 ? 6 : 3;
      const mz1 = j + 1 === 0 ? 6 : 3;
      const ix0 = x0 + mx0, ix1 = x1 - mx1, iz0 = z0 + mz0, iz1 = z1 - mz1;
      const corner = (i === 0 || i === -1) && (j === 0 || j === -1);
      const nx = corner ? 2 : 1 + Math.floor(r() * 3);
      const nz = corner ? 2 : 1 + Math.floor(r() * 3);
      const splitsX = [ix0];
      for (let a = 1; a < nx; a++) splitsX.push(ix0 + ((ix1 - ix0) * (a + (r() - 0.5) * 0.4)) / nx);
      splitsX.push(ix1);
      const splitsZ = [iz0];
      for (let b = 1; b < nz; b++) splitsZ.push(iz0 + ((iz1 - iz0) * (b + (r() - 0.5) * 0.4)) / nz);
      splitsZ.push(iz1);
      for (let a = 0; a < nx; a++) {
        for (let b = 0; b < nz; b++) {
          const gap = 0.7;
          const lx0 = splitsX[a] + (a > 0 ? gap : 0);
          const lx1 = splitsX[a + 1] - (a < nx - 1 ? gap : 0);
          const lz0 = splitsZ[b] + (b > 0 ? gap : 0);
          const lz1 = splitsZ[b + 1] - (b < nz - 1 ? gap : 0);
          const cornerLot = corner && a === (i === 0 ? 0 : nx - 1) && b === (j === 0 ? 0 : nz - 1);
          if (!corner && r() < 0.05) continue;
          const cx = (lx0 + lx1) / 2, cz = (lz0 + lz1) / 2;
          const hw = (lx1 - lx0) / 2, hd = (lz1 - lz0) / 2;
          if (hw < 2 || hd < 2) continue;
          const d = Math.hypot(cx, cz);
          let h: number;
          if (d < 110) h = 16 + r() * 34;
          else if (d < 300) h = 22 + r() * 60 + (r() < 0.12 ? 60 : 0);
          else h = 26 + r() * 85 + (r() < 0.1 ? r() * 140 : 0);
          const dc = Math.hypot(cx - LANDMARKS.cocoon.x, cz - LANDMARKS.cocoon.z);
          if (dc < 230) h += 30 + r() * 90 * (1 - dc / 230);
          const cyl = cornerLot && i === -1 && j === 0;
          if (cornerLot) h = cyl ? 40 : 44 + r() * 14;
          const sightlineCeiling = landmarkSightlineCeiling(cx, cz, hw, hd);
          if (!cyl) h = Math.min(h, sightlineCeiling);
          const b0: Building = {
            cx, cz, hw, hd, h,
            tint: tints[Math.floor(r() * tints.length)],
            seed: r(),
            faces: [a === nx - 1, a === 0, b === nz - 1, b === 0],
            screen: cornerLot && !cyl,
            cyl, i, j,
          };
          buildings.push(b0);
          if (cyl) continue;
          pieces.push({ cx, cz, hw, hd, y0: 0, y1: h, tint: b0.tint, seed: b0.seed });
          if (h > 55 && r() < 0.55 && !Number.isFinite(sightlineCeiling)) {
            const s = 0.55 + r() * 0.2;
            pieces.push({ cx, cz, hw: hw * s, hd: hd * s, y0: h, y1: h + h * (0.12 + r() * 0.22), tint: b0.tint, seed: r() });
            if (r() < 0.5) pieces.push({ cx, cz, hw: hw * s * 0.5, hd: hd * s * 0.5, y0: h * 1.2, y1: h * 1.2 + 10 + r() * 20, tint: b0.tint, seed: r() });
          }
          // Signs
          if (d < 420 && !b0.screen) {
            for (let f = 0; f < 4; f++) {
              if (!b0.faces[f]) continue;
              const [nX, nZ] = FACE_N[f];
              const half = nX !== 0 ? hd : hw;
              const fx = cx + nX * (nX !== 0 ? hw : 0);
              const fz = cz + nZ * (nZ !== 0 ? hd : 0);
              const tx = nX !== 0 ? 0 : 1, tz = nX !== 0 ? 1 : 0;
              const density = d < 160 ? 2 : 1;
              for (let k = 0; k < density; k++) {
                if (r() < 0.55 && h > 16) {
                  const sh = 6 + r() * 6;
                  const sw = 1.6 + r() * 0.5;
                  const t = (r() * 2 - 1) * Math.max(0, half - 2);
                  const y = 5 + sh / 2 + r() * Math.max(0, Math.min(h - 4, 34) - sh - 5);
                  signs.push({
                    x: fx + tx * t + nX * (sw / 2 + 0.35), y, z: fz + tz * t + nZ * (sw / 2 + 0.35),
                    rotY: nX !== 0 ? 0 : Math.PI / 2, w: sw, h: sh, cell: Math.floor(r() * 16) + r() * 0.9, vertical: true,
                  });
                }
                if (r() < 0.6 && half > 5) {
                  const w = Math.min(half * 2 - 2, 7 + r() * 9);
                  const hh = w / 4;
                  const t = (r() * 2 - 1) * Math.max(0, half - w / 2 - 0.5);
                  const y = 4.5 + hh / 2 + r() * Math.max(0, Math.min(h - 3, 42) - hh - 5);
                  signs.push({
                    x: fx + tx * t + nX * 0.15, y, z: fz + tz * t + nZ * 0.15,
                    rotY: Math.atan2(nX, nZ), w, h: hh, cell: Math.floor(r() * 16) + r() * 0.9, vertical: false,
                  });
                }
              }
            }
            if (h > 30 && r() < 0.18) {
              const w = Math.min(hw * 2, 16);
              signs.push({ x: cx, y: h + w / 8 + 1, z: cz + hd * 0.3, rotY: cz > 0 ? Math.PI : 0, w, h: w / 4, cell: Math.floor(r() * 16) + r() * 0.9, vertical: false });
            }
          }
        }
      }
    }
  }

  // Distant metropolis ring beyond the walkable grid
  let guard = 0;
  while (far.length < 1700 && guard++ < 20000) {
    const x = (r() * 2 - 1) * 2000;
    const z = (r() * 2 - 1) * 2000;
    if (Math.max(Math.abs(x), Math.abs(z)) < 880 || Math.hypot(x, z) > 2100) continue;
    const hw = 8 + r() * 20, hd = 8 + r() * 20;
    const h = 30 + r() * 120 + (r() < 0.12 ? r() * 180 : 0);
    far.push({ cx: x, cz: z, hw, hd, y0: 0, y1: h, tint: tints[Math.floor(r() * tints.length)], seed: r() });
  }

  const boxes: AABB[] = buildings.map((b) => ({ minX: b.cx - b.hw, maxX: b.cx + b.hw, minZ: b.cz - b.hd, maxZ: b.cz + b.hd, h: b.h }));
  boxes.push({ minX: LANDMARKS.tower.x - 44, maxX: LANDMARKS.tower.x + 44, minZ: LANDMARKS.tower.z - 44, maxZ: LANDMARKS.tower.z + 44, h: 9999 });
  boxes.push({ minX: LANDMARKS.skytree.x - 36, maxX: LANDMARKS.skytree.x + 36, minZ: LANDMARKS.skytree.z - 36, maxZ: LANDMARKS.skytree.z + 36, h: 9999 });
  boxes.push({ minX: LANDMARKS.cocoon.x - 28, maxX: LANDMARKS.cocoon.x + 28, minZ: LANDMARKS.cocoon.z - 22, maxZ: LANDMARKS.cocoon.z + 22, h: 9999 });

  return { buildings, pieces, far, blocks, boxes, signs };
}

let cache: City | null = null;
export function getCity(): City {
  if (!cache) cache = generate();
  return cache;
}

const PR = 0.55;
export function blocked(x: number, z: number, y: number, boxes: AABB[]) {
  const feet = y - EYE;
  for (let k = 0; k < boxes.length; k++) {
    const b = boxes[k];
    if (feet < b.h - 0.3 && x > b.minX - PR && x < b.maxX + PR && z > b.minZ - PR && z < b.maxZ + PR) return true;
  }
  return false;
}
export function groundAt(x: number, z: number, y: number, boxes: AABB[]) {
  let g = 0;
  const feet = y - EYE;
  for (let k = 0; k < boxes.length; k++) {
    const b = boxes[k];
    if (b.h < 9000 && feet >= b.h - 0.3 && x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ && b.h > g) g = b.h;
  }
  return g;
}

function aim(from: [number, number, number], to: [number, number, number]) {
  const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}

export interface Viewpoint { id: string; name: string; jp: string; pos: [number, number, number]; yaw: number; pitch: number }

function vp(id: string, name: string, jp: string, pos: [number, number, number], look: [number, number, number]): Viewpoint {
  return { id, name, jp, pos, ...aim(pos, look) };
}

export const VIEWPOINTS: Viewpoint[] = [
  vp('scramble', 'Shibuya Scramble', '渋谷スクランブル', ENTRY, [0, 48, -200]),
  vp('tower', 'Tokyo Tower', '東京タワー', [-300, EYE, -500], [-330, 150, -650]),
  vp('skytree', 'Skytree', 'スカイツリー', [-480, EYE, 540], [-630, 300, 690]),
  vp('cocoon', 'Cocoon Tower', 'コクーンタワー', [240, EYE, -360], [270, 110, -450]),
  vp('skyline', 'Skyline', '夜景', [70, 240, 190], [-60, 60, -240]),
];

export interface InputState {
  keys: Set<string>;
  lookDX: number;
  lookDY: number;
  joyX: number;
  joyY: number;
}
export interface Telemetry { x: number; y: number; z: number; yaw: number }
export type Command = { type: 'viewpoint'; index: number };

export function createInput(): InputState {
  return { keys: new Set(), lookDX: 0, lookDY: 0, joyX: 0, joyY: 0 };
}
