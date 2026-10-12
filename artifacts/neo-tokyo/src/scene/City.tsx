import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BLOCK, EXT, getCity, roadHalf, rng, type Piece, type Sign } from './world';
import { createBuildingMaterial, createScreenTexture, createSignAtlas, createSignMaterial, createWindowTexture } from './materials';

const dummy = new THREE.Object3D();

function buildPieces(pieces: Piece[], mat: THREE.Material) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const n = pieces.length;
  const aBox = new Float32Array(n * 4);
  const aTint = new Float32Array(n * 3);
  const aMeta = new Float32Array(n * 2);
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  pieces.forEach((p, i) => {
    dummy.position.set(p.cx, (p.y0 + p.y1) / 2, p.cz);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(p.hw * 2, p.y1 - p.y0, p.hd * 2);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    aBox.set([p.cx, p.cz, p.hw, p.hd], i * 4);
    aTint.set([p.tint.r, p.tint.g, p.tint.b], i * 3);
    aMeta.set([p.seed, p.y1], i * 2);
  });
  geo.setAttribute('aBox', new THREE.InstancedBufferAttribute(aBox, 4));
  geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(aTint, 3));
  geo.setAttribute('aMeta', new THREE.InstancedBufferAttribute(aMeta, 2));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

function buildSigns(signs: Sign[], mat: THREE.Material) {
  const geo = new THREE.PlaneGeometry(1, 1);
  const cells = new Float32Array(signs.length);
  const mesh = new THREE.InstancedMesh(geo, mat, signs.length);
  signs.forEach((s, i) => {
    dummy.position.set(s.x, s.y, s.z);
    dummy.rotation.set(0, s.rotY, 0);
    dummy.scale.set(s.w, s.h, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    cells[i] = s.cell;
  });
  geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 1));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

function simpleInstanced(geo: THREE.BufferGeometry, mat: THREE.Material, mats: THREE.Matrix4[], colors?: THREE.Color[]) {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, mats.length));
  mats.forEach((m, i) => mesh.setMatrixAt(i, m));
  if (colors) colors.forEach((c, i) => mesh.setColorAt(i, c));
  mesh.count = mats.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

function mtx(x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0) {
  dummy.position.set(x, y, z);
  dummy.rotation.set(0, ry, 0);
  dummy.scale.set(sx, sy, sz);
  dummy.updateMatrix();
  return dummy.matrix.clone();
}

export function City({ showFar }: { showFar: boolean }) {
  const city = getCity();

  const built = useMemo(() => {
    const disposables: { dispose: () => void }[] = [];
    const group = new THREE.Group();
    const bmat = createBuildingMaterial();
    disposables.push(bmat);
    const main = buildPieces(city.pieces, bmat);
    group.add(main);
    const far = buildPieces(city.far, bmat);
    far.name = 'far';

    // Sidewalks / plazas
    const sideMat = new THREE.MeshStandardMaterial({ color: '#1d1a2c', roughness: 0.35, metalness: 0.3 });
    disposables.push(sideMat);
    const box = new THREE.BoxGeometry(1, 1, 1);
    disposables.push(box);
    group.add(simpleInstanced(box, sideMat, city.blocks.map((b) => mtx((b.x0 + b.x1) / 2, 0.12, (b.z0 + b.z1) / 2, b.x1 - b.x0, 0.24, b.z1 - b.z0))));

    // Signs
    const vAtlas = createSignAtlas(true);
    const hAtlas = createSignAtlas(false);
    const vMat = createSignMaterial(vAtlas.tex, vAtlas.cols, vAtlas.rows, 1.9);
    const hMat = createSignMaterial(hAtlas.tex, hAtlas.cols, hAtlas.rows, 1.6);
    disposables.push(vAtlas.tex, hAtlas.tex, vMat, hMat);
    group.add(buildSigns(city.signs.filter((s) => s.vertical), vMat));
    group.add(buildSigns(city.signs.filter((s) => !s.vertical), hMat));

    const r = rng(99);
    // Rooftop units + aviation beacons
    const roofM: THREE.Matrix4[] = [];
    const beaconM: THREE.Matrix4[] = [];
    city.pieces.forEach((p) => {
      if (p.y1 - p.y0 < 8) return;
      const n = 1 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const w = 1.5 + r() * 4, d = 1.5 + r() * 4, h = 1 + r() * 3;
        roofM.push(mtx(p.cx + (r() - 0.5) * (p.hw * 2 - w), p.y1 + h / 2, p.cz + (r() - 0.5) * (p.hd * 2 - d), w, h, d));
      }
      if (p.y1 > 80) {
        beaconM.push(mtx(p.cx + p.hw * 0.9, p.y1 + 0.6, p.cz + p.hd * 0.9, 0.8, 0.8, 0.8));
        beaconM.push(mtx(p.cx - p.hw * 0.9, p.y1 + 0.6, p.cz - p.hd * 0.9, 0.8, 0.8, 0.8));
      }
    });
    const roofMat = new THREE.MeshStandardMaterial({ color: '#232036', roughness: 0.6, metalness: 0.4 });
    const beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.2, 0.15), toneMapped: false });
    beaconMat.name = 'beacon';
    disposables.push(roofMat, beaconMat);
    group.add(simpleInstanced(box, roofMat, roofM));
    group.add(simpleInstanced(box, beaconMat, beaconM));

    // Street furniture near the core: lamps, vending machines, utility poles + cables
    const lampPole: THREE.Matrix4[] = [];
    const lampHead: THREE.Matrix4[] = [];
    const vend: THREE.Matrix4[] = [];
    const vendC: THREE.Color[] = [];
    const poles: THREE.Matrix4[] = [];
    const cable: number[] = [];
    const vendColors = ['#e8f4ff', '#ff3d5a', '#3d8bff', '#fff1d0'].map((c) => new THREE.Color(c).multiplyScalar(1.6));
    for (let k = -5; k <= 5; k++) {
      const half = roadHalf(k);
      for (const side of [-1, 1]) {
        const off = side * (half + 1.2);
        for (let s = -330; s <= 330; s += 26) {
          if (Math.abs(s) < 22) continue;
          if (Math.abs(((s % BLOCK) + BLOCK) % BLOCK) < 9 || Math.abs((((s % BLOCK) + BLOCK) % BLOCK) - BLOCK) < 9) continue;
          const roads: [number, number, number][] = [
            [k * BLOCK + off, s, 0],
            [s, k * BLOCK + off, Math.PI / 2],
          ];
          for (const [x, z, ry] of roads) {
            if (k === 0) {
              lampPole.push(mtx(x, 4, z, 0.18, 8, 0.18));
              lampHead.push(mtx(x - Math.sign(off) * (ry ? 0 : 1), 8, z - Math.sign(off) * (ry ? 1 : 0), ry ? 0.35 : 2.2, 0.16, ry ? 2.2 : 0.35));
            } else if (Math.hypot(x, z) < 380) {
              poles.push(mtx(x, 5.5, z, 0.28, 11, 0.28));
            }
            if (r() < 0.22 && Math.hypot(x, z) < 300) {
              const vx = x + (ry ? 0 : Math.sign(off) * 0.9);
              const vz = z + (ry ? Math.sign(off) * 0.9 : 0);
              vend.push(mtx(vx, 1.0, vz + (ry ? 0 : 3), ry ? 0.9 : 0.8, 1.8, ry ? 0.8 : 0.9));
              vendC.push(vendColors[Math.floor(r() * vendColors.length)]);
            }
          }
        }
        // cables along minor roads
        if (k !== 0) {
          for (const axis of [0, 1]) {
            let prev: [number, number] | null = null;
            for (let s = -330; s <= 330; s += 26) {
              const p: [number, number] = axis === 0 ? [k * BLOCK + off, s] : [s, k * BLOCK + off];
              const skip = Math.abs(s) < 22 || Math.abs(((s % BLOCK) + BLOCK) % BLOCK) < 9 || Math.abs((((s % BLOCK) + BLOCK) % BLOCK) - BLOCK) < 9 || Math.hypot(p[0], p[1]) >= 380;
              if (skip) { prev = null; continue; }
              if (prev) {
                for (let w = 0; w < 3; w++) {
                  const yTop = 10.6 - w * 0.6;
                  const SEG = 6;
                  for (let q = 0; q < SEG; q++) {
                    const t0 = q / SEG, t1 = (q + 1) / SEG;
                    const sag = (t: number) => yTop - Math.sin(Math.PI * t) * 1.1;
                    cable.push(prev[0] + (p[0] - prev[0]) * t0, sag(t0), prev[1] + (p[1] - prev[1]) * t0);
                    cable.push(prev[0] + (p[0] - prev[0]) * t1, sag(t1), prev[1] + (p[1] - prev[1]) * t1);
                  }
                }
              }
              prev = p;
            }
          }
        }
      }
    }
    const poleMat = new THREE.MeshStandardMaterial({ color: '#2b2838', roughness: 0.5, metalness: 0.6 });
    const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.7, 1.1), toneMapped: false });
    const vendMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
    disposables.push(poleMat, headMat, vendMat);
    group.add(simpleInstanced(box, poleMat, lampPole));
    group.add(simpleInstanced(box, headMat, lampHead));
    group.add(simpleInstanced(box, poleMat, poles));
    group.add(simpleInstanced(box, vendMat, vend, vendC));
    const cableGeo = new THREE.BufferGeometry();
    cableGeo.setAttribute('position', new THREE.Float32BufferAttribute(cable, 3));
    const cableMat = new THREE.LineBasicMaterial({ color: '#0a0812', transparent: true, opacity: 0.85 });
    const cables = new THREE.LineSegments(cableGeo, cableMat);
    cables.frustumCulled = false;
    group.add(cables);
    disposables.push(cableGeo, cableMat);

    // Road markings: scramble crosswalks + lane dashes
    const stripes: THREE.Matrix4[] = [];
    for (let s = -12.5; s <= 12.5; s += 1.4) {
      stripes.push(mtx(s, 0.03, -16.5, 0.7, 0.02, 4.2));
      stripes.push(mtx(s, 0.03, 16.5, 0.7, 0.02, 4.2));
      stripes.push(mtx(-16.5, 0.03, s, 4.2, 0.02, 0.7));
      stripes.push(mtx(16.5, 0.03, s, 4.2, 0.02, 0.7));
    }
    for (const dir of [1, -1]) {
      for (let s = -17; s <= 17; s += 1.4) {
        const ry = dir > 0 ? -Math.PI / 4 : Math.PI / 4;
        stripes.push(mtx(s * Math.SQRT1_2, 0.031, s * Math.SQRT1_2 * dir, 0.7, 0.02, 3.6, ry));
      }
    }
    const dashes: THREE.Matrix4[] = [];
    for (let k = -EXT; k <= EXT; k++) {
      for (let s = -820; s < 820; s += 9) {
        const m = ((s % BLOCK) + BLOCK) % BLOCK;
        if (m < 16 || m > BLOCK - 16) continue;
        if (Math.abs(s) < 30) continue;
        if (k === 0) {
          for (const o of [-6.8, 6.8]) {
            dashes.push(mtx(k * BLOCK + o, 0.025, s, 0.18, 0.02, 4));
            dashes.push(mtx(s, 0.025, k * BLOCK + o, 4, 0.02, 0.18));
          }
        } else if (Math.abs(s) < 600) {
          dashes.push(mtx(k * BLOCK, 0.025, s, 0.16, 0.02, 3));
          dashes.push(mtx(s, 0.025, k * BLOCK, 3, 0.02, 0.16));
        }
      }
    }
    const paintMat = new THREE.MeshStandardMaterial({ color: '#b9b6c9', roughness: 0.3, metalness: 0.1, emissive: '#2a2733' });
    disposables.push(paintMat);
    group.add(simpleInstanced(box, paintMat, stripes));
    group.add(simpleInstanced(box, paintMat, dashes));

    // Corner video walls facing the scramble
    const screen = createScreenTexture();
    const screenMat = new THREE.MeshBasicMaterial({ map: screen.tex, toneMapped: false });
    screenMat.color.setScalar(1.5);
    const frameMat = new THREE.MeshStandardMaterial({ color: '#0e0c18', roughness: 0.4, metalness: 0.7 });
    const plane = new THREE.PlaneGeometry(1, 1);
    disposables.push(screen.tex, screenMat, frameMat, plane);
    city.buildings.filter((b) => b.screen).forEach((b) => {
      const faces: [number, number][] = [[b.i === 0 ? -1 : 1, 0], [0, b.j === 0 ? -1 : 1]];
      faces.forEach(([nx, nz], fi) => {
        const half = nx !== 0 ? b.hd : b.hw;
        const w = Math.min(half * 2 - 1.5, 20, (b.h - 3) * 16 / 9);
        const h = w * 9 / 16;
        const y = Math.min(b.h - h / 2 - 0.5, b.h * 0.5 + fi * 3);
        const x = b.cx + nx * (b.hw + 0.35);
        const z = b.cz + nz * (b.hd + 0.35);
        const ry = Math.atan2(nx, nz);
        const m = new THREE.Mesh(plane, screenMat);
        m.position.set(x, y, z);
        m.rotation.y = ry;
        m.scale.set(w, h, 1);
        group.add(m);
        const fr = new THREE.Mesh(box, frameMat);
        fr.position.set(x - nx * 0.2, y, z - nz * 0.2);
        fr.rotation.y = ry;
        fr.scale.set(w + 0.8, h + 0.8, 0.4);
        group.add(fr);
      });
    });

    // Shibuya 109-style cylinder tower
    const cylB = city.buildings.find((b) => b.cyl);
    if (cylB) {
      const tex = createWindowTexture('#1b1830', ['#ffe9d6', '#ffb36b', '#ff6aa0'], 512, 256, 48, 14, 5);
      tex.repeat.set(1, 1);
      const rad = Math.min(cylB.hw, cylB.hd);
      const cylMat = new THREE.MeshStandardMaterial({ color: '#3a3650', metalness: 0.8, roughness: 0.25, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.9 });
      const cylGeo = new THREE.CylinderGeometry(rad * 0.9, rad, cylB.h, 40, 1);
      const cyl = new THREE.Mesh(cylGeo, cylMat);
      cyl.position.set(cylB.cx, cylB.h / 2, cylB.cz);
      group.add(cyl);
      // vertical sign blade
      const c = document.createElement('canvas');
      c.width = 128; c.height = 512;
      const g = c.getContext('2d')!;
      g.fillStyle = '#12091a'; g.fillRect(0, 0, 128, 512);
      g.strokeStyle = '#fff4ec'; g.lineWidth = 6; g.shadowColor = '#ff2d75'; g.shadowBlur = 20;
      g.strokeRect(8, 8, 112, 496);
      g.fillStyle = '#fff4ec'; g.font = '900 96px "Chakra Petch", sans-serif'; g.textAlign = 'center';
      ['1', '0', '9'].forEach((ch, k) => g.fillText(ch, 64, 150 + k * 120));
      const bt = new THREE.CanvasTexture(c);
      bt.colorSpace = THREE.SRGBColorSpace;
      const bm = new THREE.MeshBasicMaterial({ map: bt, toneMapped: false, side: THREE.DoubleSide });
      bm.color.setScalar(1.8);
      const blade = new THREE.Mesh(plane, bm);
      const ang = Math.atan2(-cylB.cz, -cylB.cx);
      blade.position.set(cylB.cx + Math.cos(ang) * (rad + 0.3), cylB.h * 0.62, cylB.cz + Math.sin(ang) * (rad + 0.3));
      blade.rotation.y = -ang + Math.PI / 2;
      blade.scale.set(5, 20, 1);
      group.add(blade);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rad * 0.92, 0.25, 6, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.6, 1.6), toneMapped: false }));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(cylB.cx, cylB.h - 0.6, cylB.cz);
      group.add(ring);
      disposables.push(tex, cylMat, cylGeo, bt, bm);
    }

    return { group, far, disposables, screen, beaconMat, redraw: () => { vAtlas.redraw(); hAtlas.redraw(); } };
  }, [city]);

  useEffect(() => {
    let alive = true;
    document.fonts?.ready.then(() => alive && built.redraw()).catch(() => undefined);
    Promise.all([
      document.fonts?.load('900 64px "Noto Sans JP"'),
      document.fonts?.load('900 64px "Chakra Petch"'),
    ]).then(() => alive && built.redraw()).catch(() => undefined);
    return () => {
      alive = false;
      built.disposables.forEach((d) => d.dispose());
    };
  }, [built]);

  const lastDraw = useMemo(() => ({ t: -1 }), []);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (t - lastDraw.t > 1 / 15) {
      lastDraw.t = t;
      built.screen.draw(t);
    }
    const blink = (t % 1.6) < 0.25 ? 1 : 0.08;
    built.beaconMat.color.setRGB(4 * blink, 0.2 * blink, 0.15 * blink);
  });

  return (
    <>
      <primitive object={built.group} />
      {showFar && <primitive object={built.far} />}
    </>
  );
}
