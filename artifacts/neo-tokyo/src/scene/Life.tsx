import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BLOCK, LANDMARKS, rng } from './world';

const dummy = new THREE.Object3D();
const CYCLE = 50;
const WALK_START = 20;
const RANGE = 420;

interface Car { axis: 0 | 1; k: number; lane: number; dir: number; s: number; v: number; vmax: number; main: boolean }

export function Traffic() {
  const data = useMemo(() => {
    const r = rng(314);
    const cars: Car[] = [];
    const lanes: number[][] = [];
    for (let k = -5; k <= 5; k++) {
      for (const axis of [0, 1] as const) {
        const main = k === 0;
        const laneOffs = main ? [4, 9.5] : [2.4];
        for (const dir of [1, -1]) {
          for (const lo of laneOffs) {
            const laneIdx: number[] = [];
            const n = main ? 11 : 4 + Math.floor(r() * 3);
            const spacing = (RANGE * 2) / n;
            for (let c = 0; c < n; c++) {
              const offSign = axis === 0 ? -dir : dir;
              cars.push({ axis, k, lane: offSign * lo, dir, s: -RANGE + c * spacing + r() * spacing * 0.5, v: 8, vmax: 9 + r() * 7, main });
              laneIdx.push(cars.length - 1);
            }
            laneIdx.sort((a, b) => cars[a].s * dir - cars[b].s * dir);
            lanes.push(laneIdx);
          }
        }
      }
    }
    const ahead = new Int32Array(cars.length);
    lanes.forEach((l) => l.forEach((idx, i) => (ahead[idx] = l[(i + 1) % l.length])));
    const body = new THREE.BoxGeometry(1.85, 1.25, 4.4);
    body.translate(0, 0.85, 0);
    const cabin = new THREE.BoxGeometry(1.6, 0.6, 2.2);
    cabin.translate(0, 1.75, -0.2);
    const bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0.85, envMapIntensity: 1.2 });
    const bodies = new THREE.InstancedMesh(body, bodyMat, cars.length);
    const cabins = new THREE.InstancedMesh(cabin, new THREE.MeshStandardMaterial({ color: '#0b0a14', roughness: 0.1, metalness: 0.9 }), cars.length);
    const palette = ['#1a1a24', '#2b2d3a', '#d9d6cf', '#f2c230', '#22313f', '#5a0f1c', '#14402f', '#101018'];
    cars.forEach((_, i) => bodies.setColorAt(i, new THREE.Color(palette[Math.floor(r() * palette.length)])));
    const lightGeo = new THREE.BoxGeometry(1.5, 0.16, 0.08);
    const heads = new THREE.InstancedMesh(lightGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.0, 2.6), toneMapped: false }), cars.length);
    const tails = new THREE.InstancedMesh(lightGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(3.5, 0.15, 0.2), toneMapped: false }), cars.length);
    [bodies, cabins, heads, tails].forEach((m) => (m.frustumCulled = false));
    const group = new THREE.Group();
    group.add(bodies, cabins, heads, tails);
    return { cars, ahead, bodies, cabins, heads, tails, group, disposables: [body, cabin, lightGeo, bodyMat, cabins.material as THREE.Material, heads.material as THREE.Material, tails.material as THREE.Material] };
  }, []);

  useEffect(() => () => data.disposables.forEach((d) => d.dispose()), [data]);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const phase = state.clock.elapsedTime % CYCLE;
    const walk = phase >= WALK_START - 2;
    const { cars, ahead } = data;
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      let limit = Infinity;
      if (c.main && walk) {
        const stop = -22;
        const rel = c.s * c.dir;
        if (rel < stop + 0.5 && rel > stop - 60) limit = stop - rel;
      }
      const a = cars[ahead[i]];
      let gap = (a.s - c.s) * c.dir;
      if (gap <= 0) gap += RANGE * 2;
      gap -= 7;
      const room = Math.min(limit, gap);
      const desired = Math.min(c.vmax, Math.max(0, room * 0.9));
      c.v += (desired - c.v) * Math.min(1, dt * 2.5);
      c.s += c.v * c.dir * dt;
      if (c.s > RANGE) c.s -= RANGE * 2;
      if (c.s < -RANGE) c.s += RANGE * 2;
      const base = c.k * BLOCK;
      const x = c.axis === 0 ? c.s : base + c.lane;
      const z = c.axis === 0 ? base + c.lane : c.s;
      const th = c.axis === 0 ? (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : c.dir > 0 ? 0 : Math.PI;
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, th, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      data.bodies.setMatrixAt(i, dummy.matrix);
      data.cabins.setMatrixAt(i, dummy.matrix);
      const fx = Math.sin(th), fz = Math.cos(th);
      dummy.position.set(x + fx * 2.22, 0.95, z + fz * 2.22);
      dummy.updateMatrix();
      data.heads.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x - fx * 2.22, 1.05, z - fz * 2.22);
      const braking = c.v < c.vmax * 0.6 ? 1.4 : 1;
      dummy.scale.set(braking, braking, 1);
      dummy.updateMatrix();
      data.tails.setMatrixAt(i, dummy.matrix);
    }
    data.bodies.instanceMatrix.needsUpdate = true;
    data.cabins.instanceMatrix.needsUpdate = true;
    data.heads.instanceMatrix.needsUpdate = true;
    data.tails.instanceMatrix.needsUpdate = true;
  });

  return <primitive object={data.group} />;
}

interface Ped { x: number; z: number; tx: number; tz: number; sx: number; sz: number; corner: number; delay: number; speed: number; moving: boolean; phaseSeed: number; walker: boolean; axis: number; side: number; dir: number }

const CORNERS: [number, number][] = [[1, 1], [-1, 1], [-1, -1], [1, -1]];

export function Pedestrians({ count }: { count: number }) {
  const data = useMemo(() => {
    const r = rng(777);
    const peds: Ped[] = [];
    const cornerPos = (c: number) => {
      const [sx, sz] = CORNERS[c];
      return [sx * (15 + r() * 4.5), sz * (15 + r() * 4.5)] as [number, number];
    };
    const crossers = Math.floor(count * 0.62);
    for (let i = 0; i < count; i++) {
      if (i < crossers) {
        const c = Math.floor(r() * 4);
        const [x, z] = cornerPos(c);
        peds.push({ x, z, tx: x, tz: z, sx: x, sz: z, corner: c, delay: r() * 5, speed: 1.4, moving: false, phaseSeed: r() * 10, walker: false, axis: 0, side: 1, dir: 1 });
      } else {
        const axis = Math.floor(r() * 2), side = r() < 0.5 ? -1 : 1;
        const s = (r() < 0.5 ? -1 : 1) * (22 + r() * 260);
        const off = side * (15 + r() * 4.5);
        const x = axis === 0 ? s : off, z = axis === 0 ? off : s;
        peds.push({ x, z, tx: x, tz: z, sx: x, sz: z, corner: 0, delay: 0, speed: 1.1 + r() * 0.7, moving: true, phaseSeed: r() * 10, walker: true, axis, side, dir: r() < 0.5 ? -1 : 1 });
      }
    }
    const bodyGeo = new THREE.CapsuleGeometry(0.21, 1.15, 3, 6);
    bodyGeo.translate(0, 0.8, 0);
    const bodyMat = new THREE.MeshStandardMaterial({ color: '#16131f', roughness: 0.55, metalness: 0.2 });
    const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, count);
    const umbGeo = new THREE.ConeGeometry(0.58, 0.28, 10, 1, true);
    umbGeo.translate(0, 2.05, 0);
    const umbMat = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    const umbs = new THREE.InstancedMesh(umbGeo, umbMat, count);
    const uCols = ['#ff2d75', '#00e5ff', '#ffb21e', '#b46bff', '#e6eef8', '#e6eef8', '#e6eef8', '#ff4a2a'];
    for (let i = 0; i < count; i++) {
      const c = new THREE.Color(uCols[Math.floor(r() * uCols.length)]).multiplyScalar(0.55 + r() * 0.5);
      umbs.setColorAt(i, c);
    }
    bodies.frustumCulled = false;
    umbs.frustumCulled = false;
    const group = new THREE.Group();
    group.add(bodies, umbs);
    return { peds, bodies, umbs, group, cornerPos, r, disposables: [bodyGeo, bodyMat, umbGeo, umbMat] };
  }, [count]);

  useEffect(() => () => data.disposables.forEach((d) => d.dispose()), [data]);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = state.clock.elapsedTime;
    const phase = t % CYCLE;
    const walkT = phase - WALK_START;
    const { peds } = data;
    for (let i = 0; i < peds.length; i++) {
      const p = peds[i];
      let heading = 0;
      if (p.walker) {
        const s = (p.axis === 0 ? p.x : p.z) + p.dir * p.speed * dt;
        if (Math.abs(s) > 290 || Math.abs(s) < 21) p.dir *= -1;
        if (p.axis === 0) p.x = s; else p.z = s;
        heading = p.axis === 0 ? (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : p.dir > 0 ? 0 : Math.PI;
      } else {
        if (!p.moving && walkT > p.delay && walkT < p.delay + 1) {
          let nc = (p.corner + 1 + Math.floor(data.r() * 3)) % 4;
          if (nc === p.corner) nc = (nc + 1) % 4;
          const [tx, tz] = data.cornerPos(nc);
          p.sx = p.x; p.sz = p.z; p.tx = tx; p.tz = tz; p.corner = nc;
          const dist = Math.hypot(tx - p.x, tz - p.z);
          p.speed = dist / Math.max(8, CYCLE - WALK_START - 4 - p.delay - data.r() * 6);
          p.moving = true;
        }
        if (p.moving) {
          const dx = p.tx - p.x, dz = p.tz - p.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 0.2) p.moving = false;
          else {
            const step = Math.min(dist, p.speed * dt);
            p.x += (dx / dist) * step;
            p.z += (dz / dist) * step;
            heading = Math.atan2(dx, dz);
          }
        }
      }
      const moving = p.walker || p.moving;
      const bob = moving ? Math.abs(Math.sin(t * 7 + p.phaseSeed)) * 0.06 : 0;
      // Pedestrians leave personal space around the viewer. Without this the
      // camera can sit inside a canopy, hiding the entire skyline.
      let renderX = p.x, renderZ = p.z;
      if (state.camera.position.y < 3.2) {
        const dx = renderX - state.camera.position.x;
        const dz = renderZ - state.camera.position.z;
        const distance = Math.hypot(dx, dz);
        if (distance < 1.8) {
          const angle = distance > 0.01 ? Math.atan2(dz, dx) : p.phaseSeed;
          renderX = state.camera.position.x + Math.cos(angle) * 1.8;
          renderZ = state.camera.position.z + Math.sin(angle) * 1.8;
        }
      }
      dummy.position.set(renderX, bob, renderZ);
      dummy.rotation.set(0, heading, moving ? Math.sin(t * 7 + p.phaseSeed) * 0.04 : 0);
      dummy.scale.set(1, 0.92 + (p.phaseSeed % 1) * 0.16, 1);
      dummy.updateMatrix();
      data.bodies.setMatrixAt(i, dummy.matrix);
      data.umbs.setMatrixAt(i, dummy.matrix);
    }
    data.bodies.instanceMatrix.needsUpdate = true;
    data.umbs.instanceMatrix.needsUpdate = true;
  });

  return <primitive object={data.group} />;
}

export function Flyers() {
  const data = useMemo(() => {
    const r = rng(4242);
    const fl = Array.from({ length: 18 }, () => ({
      cx: (r() - 0.5) * 900, cz: (r() - 0.5) * 900, rad: 120 + r() * 380, y: 70 + r() * 170, sp: (0.02 + r() * 0.04) * (r() < 0.5 ? -1 : 1), ph: r() * Math.PI * 2,
    }));
    const lanes = [
      ...Array.from({ length: 14 }, (_, i) => ({ cx: 0, cz: 0, rad: 260, y: 120 + (i % 3) * 6, sp: 0.035, ph: (i / 14) * Math.PI * 2 })),
    ];
    const all = [...fl, ...lanes];
    const bodyGeo = new THREE.BoxGeometry(2.6, 0.9, 6.5);
    const bodyMat = new THREE.MeshStandardMaterial({ color: '#1c1a28', roughness: 0.3, metalness: 0.9 });
    const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, all.length);
    const lGeo = new THREE.BoxGeometry(3.0, 0.18, 0.5);
    const front = new THREE.InstancedMesh(lGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.8, 3.4), toneMapped: false }), all.length);
    const back = new THREE.InstancedMesh(lGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(3.6, 0.3, 0.9), toneMapped: false }), all.length);
    [bodies, front, back].forEach((m) => (m.frustumCulled = false));
    const group = new THREE.Group();
    group.add(bodies, front, back);
    return { all, bodies, front, back, group, disposables: [bodyGeo, bodyMat, lGeo, front.material as THREE.Material, back.material as THREE.Material] };
  }, []);
  useEffect(() => () => data.disposables.forEach((d) => d.dispose()), [data]);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    data.all.forEach((f, i) => {
      const a = f.ph + t * f.sp;
      const x = f.cx + Math.cos(a) * f.rad, z = f.cz + Math.sin(a) * f.rad;
      const tx = -Math.sin(a) * Math.sign(f.sp), tz = Math.cos(a) * Math.sign(f.sp);
      const th = Math.atan2(tx, tz);
      const y = f.y + Math.sin(t * 0.5 + f.ph) * 4;
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, th, -0.12 * Math.sign(f.sp));
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      data.bodies.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x + tx * 3.3, y, z + tz * 3.3);
      dummy.updateMatrix();
      data.front.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x - tx * 3.3, y, z - tz * 3.3);
      dummy.updateMatrix();
      data.back.setMatrixAt(i, dummy.matrix);
    });
    data.bodies.instanceMatrix.needsUpdate = true;
    data.front.instanceMatrix.needsUpdate = true;
    data.back.instanceMatrix.needsUpdate = true;
  });
  return <primitive object={data.group} />;
}

const BEAM_VERT = `
varying float vH; varying vec3 vN; varying vec3 vV;
void main(){
  vH = position.y / 700.0;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const BEAM_FRAG = `
uniform vec3 uColor; varying float vH; varying vec3 vN; varying vec3 vV;
void main(){
  float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
  float a = (1.0 - vH) * (1.0 - vH) * edge * 0.22;
  gl_FragColor = vec4(uColor * a, a);
}`;

export function Searchlights() {
  const data = useMemo(() => {
    const geo = new THREE.ConeGeometry(26, 700, 20, 1, true);
    geo.translate(0, -350, 0);
    geo.rotateX(Math.PI);
    const spots = [
      { x: 120, z: -180, c: '#7fe8ff' },
      { x: -200, z: -140, c: '#ff7ab0' },
      { x: LANDMARKS.tower.x + 70, z: LANDMARKS.tower.z + 60, c: '#ffd29a' },
      { x: LANDMARKS.cocoon.x - 70, z: LANDMARKS.cocoon.z + 60, c: '#a8b8ff' },
      { x: 260, z: 220, c: '#7fe8ff' },
      { x: -320, z: 300, c: '#ff9a7a' },
    ];
    const group = new THREE.Group();
    const mats: THREE.ShaderMaterial[] = [];
    const meshes = spots.map((s) => {
      const mat = new THREE.ShaderMaterial({
        vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { uColor: { value: new THREE.Color(s.c).multiplyScalar(1.2) } },
      });
      mats.push(mat);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(s.x, 0, s.z);
      m.frustumCulled = false;
      group.add(m);
      return m;
    });
    return { group, meshes, disposables: [geo, ...mats] };
  }, []);
  useEffect(() => () => data.disposables.forEach((d) => d.dispose()), [data]);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    data.meshes.forEach((m, i) => {
      m.rotation.set(0.35 + Math.sin(t * 0.21 + i * 1.7) * 0.22, 0, Math.cos(t * 0.17 + i * 2.3) * 0.38);
    });
  });
  return <primitive object={data.group} />;
}
