import { useEffect, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { BOUND, EYE, LANDMARKS, VIEWPOINTS, blocked, getCity, groundAt, type Command, type InputState, type Telemetry } from './world';

interface Shot { name: string; f: (u: number, pos: THREE.Vector3, look: THREE.Vector3) => void }

const TT = LANDMARKS.tower, ST = LANDMARKS.skytree, CT = LANDMARKS.cocoon;
const SHOT_LEN = 13;
export const SHOTS: Shot[] = [
  { name: 'Shibuya Scramble  /  渋谷', f: (u, p, l) => { p.set(-24 + u * 46, 2.4 + u * 4, 30); l.set(0, 14, -40); } },
  { name: 'Tokyo Tower  /  東京タワー', f: (u, p, l) => { const a = 0.4 + u * 0.8; p.set(TT.x + Math.sin(a) * 200, 160 + u * 40, TT.z + Math.cos(a) * 200); l.set(TT.x, 170, TT.z); } },
  { name: 'Street level  /  雨の路地', f: (u, p, l) => { p.set(60 + 3.5, 1.6 + Math.sin(u * 40) * 0.03, 150 - u * 80); l.set(60 + 2, 6, -200); } },
  { name: 'Tokyo Skytree  /  スカイツリー', f: (u, p, l) => { const a = -2.4 + u * 0.55; p.set(ST.x + Math.sin(a) * 280, 200 + u * 300, ST.z + Math.cos(a) * 280); l.set(ST.x, 300 + u * 220, ST.z); } },
  { name: 'Nishi-Shinjuku  /  西新宿', f: (u, p, l) => { const a = 2.2 + u * 1.1; p.set(CT.x + Math.sin(a) * 62, 30 + u * 90, CT.z + Math.cos(a) * 62); l.set(CT.x, 120, CT.z); } },
  { name: 'Skyline  /  夜景', f: (u, p, l) => { const a = 0.9 + u * 0.9; p.set(Math.sin(a) * 430, 270, Math.cos(a) * 430); l.set(-80, 70, -60); } },
];

interface Props {
  input: MutableRefObject<InputState>;
  command: MutableRefObject<Command | null>;
  telemetry: MutableRefObject<Telemetry>;
  cinematic: boolean;
  onShot: (name: string | null) => void;
  onArrive: (index: number) => void;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function Rig({ input, command, telemetry, cinematic, onShot, onArrive }: Props) {
  const camera = useThree((s) => s.camera);
  const boxes = getCity().boxes;
  const v0 = VIEWPOINTS[0];
  const st = useRef({
    pos: new THREE.Vector3(...v0.pos),
    yaw: v0.yaw,
    pitch: v0.pitch,
    bob: 0,
    vel: new THREE.Vector2(),
    trans: null as null | { from: THREE.Vector3; to: THREE.Vector3; fy: number; ty: number; fp: number; tp: number; t: number; idx: number },
    cineT: 0,
    shot: -1,
  });
  const cbs = useRef({ onShot, onArrive });
  cbs.current = { onShot, onArrive };
  const tmp = useRef({ p: new THREE.Vector3(), l: new THREE.Vector3(), p2: new THREE.Vector3(), l2: new THREE.Vector3() });

  useEffect(() => {
    const s = st.current;
    if (cinematic) {
      s.cineT = 0;
      s.shot = -1;
    } else {
      cbs.current.onShot(null);
    }
  }, [cinematic]);

  useEffect(() => {
    camera.rotation.order = 'YXZ';
  }, [camera]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const s = st.current;
    const inp = input.current;

    if (cinematic) {
      inp.lookDX = inp.lookDY = 0;
      s.cineT += dt;
      const idx = Math.floor(s.cineT / SHOT_LEN) % SHOTS.length;
      const u = (s.cineT % SHOT_LEN) / SHOT_LEN;
      if (idx !== s.shot) {
        s.shot = idx;
        cbs.current.onShot(SHOTS[idx].name);
      }
      const { p, l } = tmp.current;
      SHOTS[idx].f(u, p, l);
      camera.position.copy(p);
      camera.lookAt(l);
      telemetry.current.x = p.x; telemetry.current.y = p.y; telemetry.current.z = p.z;
      telemetry.current.yaw = camera.rotation.y;
      return;
    }

    const cmd = command.current;
    if (cmd && cmd.type === 'viewpoint') {
      command.current = null;
      const vp = VIEWPOINTS[cmd.index];
      if (vp) {
        s.trans = { from: s.pos.clone(), to: new THREE.Vector3(...vp.pos), fy: s.yaw, ty: s.yaw + wrapAngle(vp.yaw - s.yaw), fp: s.pitch, tp: vp.pitch, t: 0, idx: cmd.index };
      }
    }

    if (s.trans) {
      const tr = s.trans;
      const dist = tr.from.distanceTo(tr.to);
      const dur = THREE.MathUtils.clamp(1.4 + dist / 500, 1.6, 3.4);
      tr.t += dt / dur;
      const k = easeInOut(Math.min(1, tr.t));
      s.pos.lerpVectors(tr.from, tr.to, k);
      s.pos.y += Math.sin(Math.PI * k) * Math.min(220, dist * 0.35);
      s.yaw = THREE.MathUtils.lerp(tr.fy, tr.ty, k);
      s.pitch = THREE.MathUtils.lerp(tr.fp, tr.tp, k) - Math.sin(Math.PI * k) * 0.25;
      inp.lookDX = inp.lookDY = 0;
      if (tr.t >= 1) {
        s.trans = null;
        cbs.current.onArrive(tr.idx);
      }
    } else {
      // look
      s.yaw -= inp.lookDX * 0.0032;
      s.pitch -= inp.lookDY * 0.0032;
      s.pitch = THREE.MathUtils.clamp(s.pitch, -1.45, 1.45);
      inp.lookDX = inp.lookDY = 0;
      const keys = inp.keys;
      let fwd = 0, side = 0, turn = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) fwd += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) fwd -= 1;
      if (keys.has('KeyA')) side -= 1;
      if (keys.has('KeyD')) side += 1;
      if (keys.has('ArrowLeft')) turn += 1;
      if (keys.has('ArrowRight')) turn -= 1;
      fwd += -inp.joyY;
      side += inp.joyX;
      s.yaw += turn * dt * 1.6;
      const len = Math.hypot(fwd, side);
      if (len > 1) { fwd /= len; side /= len; }
      const run = keys.has('ShiftLeft') || keys.has('ShiftRight');
      const elevated = s.pos.y > EYE + 25;
      const speed = (run ? 18 : 7) * (elevated ? 3 : 1);
      const sy = Math.sin(s.yaw), cy = Math.cos(s.yaw);
      const tx = (-sy * fwd + cy * side) * speed;
      const tz = (-cy * fwd - sy * side) * speed;
      s.vel.x += (tx - s.vel.x) * Math.min(1, dt * 8);
      s.vel.y += (tz - s.vel.y) * Math.min(1, dt * 8);
      const moving = Math.hypot(s.vel.x, s.vel.y) > 0.3;
      let nx = s.pos.x + s.vel.x * dt;
      let nz = s.pos.z + s.vel.y * dt;
      nx = THREE.MathUtils.clamp(nx, -BOUND, BOUND);
      nz = THREE.MathUtils.clamp(nz, -BOUND, BOUND);
      if (!blocked(nx, s.pos.z, s.pos.y, boxes)) s.pos.x = nx; else s.vel.x *= 0.2;
      if (!blocked(s.pos.x, nz, s.pos.y, boxes)) s.pos.z = nz; else s.vel.y *= 0.2;
      // vertical: drift back toward street (or rooftop) when moving from an aerial viewpoint; fall if unsupported
      const floor = groundAt(s.pos.x, s.pos.z, s.pos.y, boxes) + EYE;
      if (s.pos.y > floor + 0.01) {
        if (elevated && !moving) {
          /* hover while idle at aerial viewpoints */
        } else {
          s.pos.y = Math.max(floor, s.pos.y - Math.max(4, (s.pos.y - floor) * 1.6) * dt);
        }
      } else s.pos.y = floor;
      if (moving && s.pos.y - floor < 0.05) s.bob += dt * Math.hypot(s.vel.x, s.vel.y) * 1.25;
    }

    const bobY = Math.sin(s.bob * 2) * 0.045;
    camera.position.set(s.pos.x, s.pos.y + bobY, s.pos.z);
    camera.rotation.set(s.pitch, s.yaw, Math.sin(s.bob) * 0.004, 'YXZ');
    telemetry.current.x = s.pos.x; telemetry.current.y = s.pos.y; telemetry.current.z = s.pos.z;
    telemetry.current.yaw = s.yaw;
  });

  return null;
}
