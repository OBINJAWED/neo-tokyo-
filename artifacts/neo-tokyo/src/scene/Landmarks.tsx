import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { LANDMARKS } from './world';
import { createWindowTexture } from './materials';

const UP = new THREE.Vector3(0, 1, 0);
interface Beam { m: THREE.Matrix4; c: THREE.Color }

function beam(list: Beam[], a: THREE.Vector3, b: THREE.Vector3, t: number, c: THREE.Color) {
  const d = b.clone().sub(a);
  const len = d.length();
  if (len < 0.01) return;
  const q = new THREE.Quaternion().setFromUnitVectors(UP, d.normalize());
  const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(t, len, t));
  list.push({ m, c });
}

function toMesh(list: Beam[], geo: THREE.BufferGeometry, mat: THREE.Material) {
  const mesh = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((b, i) => {
    mesh.setMatrixAt(i, b.m);
    mesh.setColorAt(i, b.c);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

function tokyoTower(geo: THREE.BufferGeometry, mat: THREE.Material, d: { dispose: () => void }[]) {
  const g = new THREE.Group();
  const list: Beam[] = [];
  const orange = new THREE.Color(2.6, 0.62, 0.16);
  const white = new THREE.Color(2.0, 1.75, 1.45);
  const w = (y: number) => 3.6 + 36.4 * Math.pow(Math.max(0, 1 - y / 292), 2.0);
  const N = 30;
  const levels: number[] = [];
  for (let i = 0; i <= N; i++) levels.push(250 * (1 - Math.pow(1 - i / N, 1.35)));
  const col = (y: number) => (Math.floor(y / 30) % 2 === 1 && y > 20 ? white : orange);
  const corners = (y: number) => {
    const s = w(y);
    return [new THREE.Vector3(s, y, s), new THREE.Vector3(-s, y, s), new THREE.Vector3(-s, y, -s), new THREE.Vector3(s, y, -s)];
  };
  for (let i = 0; i < N; i++) {
    const y0 = levels[i], y1 = levels[i + 1];
    const c0 = corners(y0), c1 = corners(y1);
    const c = col((y0 + y1) / 2);
    const legT = THREE.MathUtils.lerp(2.2, 0.8, i / N);
    for (let k = 0; k < 4; k++) {
      beam(list, c0[k], c1[k], legT, c);
      const n = (k + 1) % 4;
      beam(list, c1[k], c1[n], 0.55, c);
      beam(list, c0[k], c1[n], 0.38, c);
      beam(list, c0[n], c1[k], 0.38, c);
      // inner sub-lattice on lower levels for density
      if (i < 12) {
        const m0 = c0[k].clone().lerp(c0[n], 0.5), m1 = c1[k].clone().lerp(c1[n], 0.5);
        beam(list, m0, m1, 0.3, c);
      }
    }
  }
  // base arches: four great curved legs splaying out
  for (let k = 0; k < 4; k++) {
    const ang = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const dir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
    let prev: THREE.Vector3 | null = null;
    for (let s = 0; s <= 10; s++) {
      const t = s / 10;
      const p = dir.clone().multiplyScalar(w(0) * Math.SQRT2 * (0.45 + 0.55 * Math.cos(t * Math.PI / 2)));
      p.y = Math.sin(t * Math.PI / 2) * 46;
      if (prev) beam(list, prev, p, 0.9, orange);
      prev = p;
    }
  }
  // antenna
  const ant = [250, 270, 290, 305, 318, 333];
  for (let i = 0; i < ant.length - 1; i++) {
    const t0 = 3.6 - i * 0.6, t1 = 3.6 - (i + 1) * 0.6;
    const c = i % 2 === 0 ? white : orange;
    const cs0 = [new THREE.Vector3(t0, ant[i], t0), new THREE.Vector3(-t0, ant[i], -t0), new THREE.Vector3(-t0, ant[i], t0), new THREE.Vector3(t0, ant[i], -t0)];
    const cs1 = [new THREE.Vector3(t1, ant[i + 1], t1), new THREE.Vector3(-t1, ant[i + 1], -t1), new THREE.Vector3(-t1, ant[i + 1], t1), new THREE.Vector3(t1, ant[i + 1], -t1)];
    for (let k = 0; k < 4; k++) beam(list, cs0[k], cs1[k], 0.5, c);
  }
  beam(list, new THREE.Vector3(0, 300, 0), new THREE.Vector3(0, 340, 0), 0.7, white);
  g.add(toMesh(list, geo, mat));

  const deckTex = createWindowTexture('#2a1408', ['#ffd9a0', '#fff1d8', '#ff9a50'], 256, 64, 32, 4, 3);
  deckTex.repeat.set(3, 1);
  const deckMat = new THREE.MeshStandardMaterial({ color: '#1a1220', roughness: 0.3, metalness: 0.7, emissive: '#ffffff', emissiveMap: deckTex, emissiveIntensity: 2.2 });
  const deckGeo = new THREE.CylinderGeometry(15, 16.5, 11, 8, 1);
  const deck = new THREE.Mesh(deckGeo, deckMat);
  deck.position.y = 150;
  deck.rotation.y = Math.PI / 8;
  g.add(deck);
  const deck2Geo = new THREE.CylinderGeometry(6.5, 7, 6, 8, 1);
  const deck2 = new THREE.Mesh(deck2Geo, deckMat);
  deck2.position.y = 252;
  deck2.rotation.y = Math.PI / 8;
  g.add(deck2);
  const footTex = createWindowTexture('#120a14', ['#ffc58a', '#fff3e2'], 256, 64, 40, 6, 9);
  footTex.repeat.set(2, 1);
  const footMat = new THREE.MeshStandardMaterial({ color: '#17121e', roughness: 0.35, metalness: 0.6, emissive: '#ffffff', emissiveMap: footTex, emissiveIntensity: 1.3 });
  const footGeo = new THREE.BoxGeometry(56, 16, 40);
  const foot = new THREE.Mesh(footGeo, footMat);
  foot.position.set(0, 8, 0);
  g.add(foot);
  d.push(deckTex, deckMat, deckGeo, deck2Geo, footTex, footMat, footGeo);
  return g;
}

function skytree(geo: THREE.BufferGeometry, mat: THREE.Material, d: { dispose: () => void }[]) {
  const g = new THREE.Group();
  const list: Beam[] = [];
  const iki = new THREE.Color(0.9, 1.7, 2.6);
  const miyabi = new THREE.Color(1.8, 0.55, 2.6);
  const rad = (y: number) => 10.5 + 23 * Math.pow(Math.max(0, 1 - y / 500), 1.7);
  const COLS = 18, ROWS = 40, TOP = 495;
  const pt = (k: number, i: number) => {
    const y = (i / ROWS) * TOP;
    const a = (k / COLS) * Math.PI * 2;
    // triangle-to-circle morph near base
    let r = rad(y);
    const tri = Math.max(0, 1 - y / 120);
    const triR = r / Math.max(0.5, Math.cos(((a % (Math.PI * 2 / 3)) - Math.PI / 3)));
    r = THREE.MathUtils.lerp(r, Math.min(triR, r * 1.6), tri * 0.6);
    return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
  };
  for (let i = 0; i < ROWS; i++) {
    for (let k = 0; k < COLS; k++) {
      const y = (i / ROWS) * TOP;
      const c = (y > 330 && y < 365) || (y > 435 && y < 455) ? miyabi : iki;
      const a = pt(k, i), b = pt(k, i + 1), an = pt(k + 1, i + 1), ap = pt(k - 1, i + 1);
      beam(list, a, b, 0.6, c);
      beam(list, a, an, 0.35, c);
      beam(list, a, ap, 0.35, c);
      if (i % 4 === 0) beam(list, a, pt(k + 1, i), 0.4, c);
    }
  }
  // mast
  for (let i = 0; i < 8; i++) {
    const y0 = 495 + i * 17.5, y1 = y0 + 17.5;
    const r0 = 6 - i * 0.6, r1 = 6 - (i + 1) * 0.6;
    for (let k = 0; k < 6; k++) {
      const a0 = (k / 6) * Math.PI * 2, a1 = ((k + 1) / 6) * Math.PI * 2;
      beam(list, new THREE.Vector3(Math.cos(a0) * r0, y0, Math.sin(a0) * r0), new THREE.Vector3(Math.cos(a0) * r1, y1, Math.sin(a0) * r1), 0.5, iki);
      beam(list, new THREE.Vector3(Math.cos(a0) * r0, y0, Math.sin(a0) * r0), new THREE.Vector3(Math.cos(a1) * r1, y1, Math.sin(a1) * r1), 0.3, iki);
    }
  }
  beam(list, new THREE.Vector3(0, 630, 0), new THREE.Vector3(0, 640, 0), 0.8, iki);
  g.add(toMesh(list, geo, mat));

  const coreMat = new THREE.MeshStandardMaterial({ color: '#0e1022', roughness: 0.4, metalness: 0.6 });
  const coreGeo = new THREE.CylinderGeometry(8, 12, 495, 16, 1, true);
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.position.y = 247;
  g.add(core);
  const winTex = createWindowTexture('#0b1630', ['#cfe9ff', '#9fd0ff', '#ffffff'], 512, 64, 64, 5, 11);
  winTex.repeat.set(2, 1);
  const deckMat = new THREE.MeshStandardMaterial({ color: '#0d0f1e', roughness: 0.2, metalness: 0.8, emissive: '#ffffff', emissiveMap: winTex, emissiveIntensity: 2.4 });
  const deckGeo = new THREE.CylinderGeometry(21, 19, 14, 40, 1);
  const deck = new THREE.Mesh(deckGeo, deckMat);
  deck.position.y = 348;
  g.add(deck);
  const deckGeo2 = new THREE.CylinderGeometry(15.5, 16, 7, 40, 1);
  const deck2 = new THREE.Mesh(deckGeo2, deckMat);
  deck2.position.y = 447;
  g.add(deck2);
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.7, 3.2), toneMapped: false });
  const ringGeo = new THREE.TorusGeometry(21.5, 0.4, 6, 64);
  [341, 356].forEach((y) => {
    const r = new THREE.Mesh(ringGeo, ringMat);
    r.rotation.x = Math.PI / 2;
    r.position.y = y;
    g.add(r);
  });
  d.push(coreMat, coreGeo, winTex, deckMat, deckGeo, deckGeo2, ringMat, ringGeo);
  return g;
}

function cocoon(geo: THREE.BufferGeometry, mat: THREE.Material, d: { dispose: () => void }[]) {
  const g = new THREE.Group();
  const H = 204, EZ = 0.76;
  const r = (y: number) => 27 * Math.pow(Math.sin(Math.PI * (0.07 + 0.9 * (y / H))), 0.72);
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 40; i++) {
    const y = (i / 40) * H;
    pts.push(new THREE.Vector2(r(y) * 0.95, y));
  }
  const bodyGeo = new THREE.LatheGeometry(pts, 48);
  const tex = createWindowTexture('#08122a', ['#9fd4ff', '#e6f4ff', '#6fb1ff'], 512, 512, 64, 56, 21);
  tex.repeat.set(2, 1);
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#0c1224', roughness: 0.15, metalness: 0.85, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 1.25 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.scale.z = EZ;
  g.add(body);

  const list: Beam[] = [];
  const white = new THREE.Color(1.7, 1.8, 2.1);
  const K = 14, L = 34;
  const p = (theta: number, y: number) => {
    const rr = r(y) + 0.4;
    return new THREE.Vector3(Math.cos(theta) * rr, y, Math.sin(theta) * rr * EZ);
  };
  for (const dir of [1, -1]) {
    for (let k = 0; k < K; k++) {
      const base = (k / K) * Math.PI * 2;
      for (let i = 0; i < L; i++) {
        const y0 = (i / L) * H, y1 = ((i + 1) / L) * H;
        const th = (y: number) => base + dir * Math.sin((y / H) * Math.PI) * 1.25;
        beam(list, p(th(y0), y0), p(th(y1), y1), 0.9, white);
      }
    }
  }
  g.add(toMesh(list, geo, mat));
  const crownMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 2.2, 3.0), toneMapped: false });
  const crownGeo = new THREE.TorusGeometry(r(H - 6) + 0.6, 0.35, 6, 40);
  const crown = new THREE.Mesh(crownGeo, crownMat);
  crown.rotation.x = Math.PI / 2;
  crown.position.y = H - 6;
  crown.scale.y = EZ;
  g.add(crown);
  d.push(bodyGeo, tex, bodyMat, crownMat, crownGeo);
  return g;
}

export function Landmarks() {
  const built = useMemo(() => {
    const disposables: { dispose: () => void }[] = [];
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
    disposables.push(geo, mat);
    const root = new THREE.Group();
    const tt = tokyoTower(geo, mat, disposables);
    tt.position.set(LANDMARKS.tower.x, 0, LANDMARKS.tower.z);
    const st = skytree(geo, mat, disposables);
    st.position.set(LANDMARKS.skytree.x, 0, LANDMARKS.skytree.z);
    const ct = cocoon(geo, mat, disposables);
    ct.position.set(LANDMARKS.cocoon.x, 0, LANDMARKS.cocoon.z);
    ct.rotation.y = 0.35;
    root.add(tt, st, ct);

    const beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.3, 0.2), toneMapped: false });
    const sph = new THREE.SphereGeometry(1.2, 8, 6);
    disposables.push(beaconMat, sph);
    const tops: [number, number, number][] = [
      [LANDMARKS.tower.x, 341, LANDMARKS.tower.z],
      [LANDMARKS.skytree.x, 641, LANDMARKS.skytree.z],
      [LANDMARKS.cocoon.x, 206, LANDMARKS.cocoon.z],
      [LANDMARKS.tower.x, 256, LANDMARKS.tower.z + 7],
      [LANDMARKS.skytree.x + 22, 357, LANDMARKS.skytree.z],
      [LANDMARKS.skytree.x - 22, 357, LANDMARKS.skytree.z],
    ];
    tops.forEach(([x, y, z]) => {
      const m = new THREE.Mesh(sph, beaconMat);
      m.position.set(x, y, z);
      root.add(m);
    });
    // Plaza uplights: soft glowing pads beneath landmarks
    const padMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 0.35, 0.5), transparent: true, opacity: 0.35, toneMapped: false, depthWrite: false });
    const padGeo = new THREE.CircleGeometry(1, 48);
    disposables.push(padMat, padGeo);
    Object.values(LANDMARKS).forEach((l) => {
      const p = new THREE.Mesh(padGeo, padMat);
      p.rotation.x = -Math.PI / 2;
      p.position.set(l.x, 0.3, l.z);
      p.scale.setScalar(l.r * 0.85);
      root.add(p);
    });
    return { root, disposables, beaconMat };
  }, []);

  useEffect(() => () => built.disposables.forEach((d) => d.dispose()), [built]);

  useFrame((s) => {
    const on = (s.clock.elapsedTime % 2.2) < 0.35 ? 1 : 0.1;
    built.beaconMat.color.setRGB(5 * on, 0.3 * on, 0.2 * on);
  });

  return <primitive object={built.root} />;
}
