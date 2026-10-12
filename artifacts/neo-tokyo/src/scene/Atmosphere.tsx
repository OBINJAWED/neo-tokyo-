import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MeshReflectorMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { createNoiseTexture, sharedUniforms } from './materials';

export const FOG_COLOR = '#24102f';

const SKY_VERT = `
varying vec3 vDir;
void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`;
const SKY_FRAG = `
uniform float uTime; uniform vec3 uFog; varying vec3 vDir;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for(int i=0;i<5;i++){ v += a*n(p); p *= 2.03; a *= 0.5; } return v; }
void main(){
  vec3 d = normalize(vDir);
  float e = d.y;
  vec3 zenith = vec3(0.02, 0.012, 0.05);
  vec3 mid = vec3(0.09, 0.03, 0.14);
  vec3 glow = vec3(0.55, 0.12, 0.28);
  vec3 col = mix(mid, zenith, smoothstep(0.05, 0.6, e));
  col += glow * exp(-max(e, 0.0) * 9.0) * 0.55;
  vec2 cp = d.xz / (max(e, 0.02) + 0.18) * 1.4 + vec2(uTime * 0.006, uTime * 0.002);
  float c = fbm(cp);
  float cl = smoothstep(0.42, 0.85, c) * smoothstep(0.0, 0.25, e);
  vec3 under = mix(vec3(0.5, 0.14, 0.32), vec3(0.12, 0.2, 0.45), smoothstep(0.05, 0.5, e));
  col = mix(col, under * (0.35 + 0.6 * c), cl * 0.85);
  // Fuji silhouette to the west-southwest
  float az = atan(d.z, d.x);
  float fa = az - 2.85;
  fa = mod(fa + 3.14159, 6.28318) - 3.14159;
  float prof = 0.075 * pow(max(0.0, 1.0 - abs(fa) / 0.42), 1.25);
  prof = min(prof, 0.062);
  if (e < prof && e > -0.02) {
    vec3 m = vec3(0.07, 0.03, 0.11);
    float snow = smoothstep(prof - 0.018, prof - 0.006, e) * step(0.04, prof) * (0.6 + 0.4 * n(vec2(fa * 80.0, e * 200.0)));
    col = mix(m, vec3(0.32, 0.22, 0.36), snow);
  }
  col = mix(col, uFog, smoothstep(0.08, -0.01, e));
  gl_FragColor = vec4(col, 1.0);
}`;

export function Sky() {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { uTime: sharedUniforms.uTime, uFog: { value: new THREE.Color(FOG_COLOR) } },
      }),
    [],
  );
  const geo = useMemo(() => new THREE.SphereGeometry(4000, 48, 24), []);
  useEffect(() => () => { mat.dispose(); geo.dispose(); }, [mat, geo]);
  useFrame(({ camera }) => ref.current?.position.copy(camera.position));
  return <mesh ref={ref} geometry={geo} material={mat} renderOrder={-10} frustumCulled={false} />;
}

const RAIN_VERT = `
attribute vec3 aOffset; attribute float aEnd;
uniform float uTime; uniform vec3 uCam;
varying float vA;
void main(){
  vec3 box = vec3(70.0, 46.0, 70.0);
  vec3 p = aOffset;
  float sp = 26.0 * (0.8 + fract(aOffset.x * 0.37) * 0.4);
  p.y -= uTime * sp;
  p.x -= uTime * 3.0;
  p = mod(p - uCam + box * 0.5, box) + uCam - box * 0.5;
   float len = 0.35 + fract(aOffset.z * 0.71) * 0.45;
  p.y += aEnd * len;
  p.x += aEnd * len * 0.11;
  vA = 1.0 - aEnd;
  vec4 mv = viewMatrix * vec4(p, 1.0);
   vA *= smoothstep(48.0, 4.0, -mv.z) * smoothstep(2.0, 6.0, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const RAIN_FRAG = `
varying float vA;
void main(){ gl_FragColor = vec4(vec3(0.72, 0.82, 1.0) * 1.4, vA * 0.22); }`;

const SPLASH_VERT = `
attribute vec3 aOffset;
uniform float uTime; uniform vec3 uCam;
varying float vA; varying vec2 vUv;
void main(){
  vec3 box = vec3(40.0, 1.0, 40.0);
  float life = fract(uTime * (1.4 + fract(aOffset.y * 7.0)) + aOffset.y);
  vec3 c = aOffset + vec3(floor(uTime * 1.3 + aOffset.y) * 13.7, 0.0, floor(uTime * 1.3 + aOffset.y) * 7.3);
  c = mod(c - uCam + box * 0.5, box) + uCam - box * 0.5;
  c.y = 0.06;
  vec3 p = c + vec3(position.x, 0.0, position.y) * (0.05 + life * 0.35);
  vA = 1.0 - life;
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const SPLASH_FRAG = `
varying float vA; varying vec2 vUv;
void main(){
  float d = length(vUv - 0.5) * 2.0;
  float ring = smoothstep(0.65, 0.85, d) * smoothstep(1.0, 0.88, d);
  gl_FragColor = vec4(vec3(0.75, 0.85, 1.0), ring * vA * 0.5);
}`;

export function Rain({ count, splashes }: { count: number; splashes: number }) {
  const built = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 2 * 3);
    const off = new Float32Array(count * 2 * 3);
    const end = new Float32Array(count * 2);
    let s = 11;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < count; i++) {
      const x = rnd() * 70, y = rnd() * 46, z = rnd() * 70;
      for (let k = 0; k < 2; k++) {
        off.set([x, y, z], (i * 2 + k) * 3);
        end[i * 2 + k] = k;
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aOffset', new THREE.BufferAttribute(off, 3));
    geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    const uniforms = { uTime: sharedUniforms.uTime, uCam: { value: new THREE.Vector3() } };
    const mat = new THREE.ShaderMaterial({ vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms });
    const lines = new THREE.LineSegments(geo, mat);
    lines.frustumCulled = false;

    const sGeo = new THREE.InstancedBufferGeometry();
    const plane = new THREE.PlaneGeometry(1, 1);
    sGeo.index = plane.index;
    sGeo.setAttribute('position', plane.getAttribute('position'));
    sGeo.setAttribute('uv', plane.getAttribute('uv'));
    const sOff = new Float32Array(splashes * 3);
    for (let i = 0; i < splashes; i++) sOff.set([rnd() * 40, rnd(), rnd() * 40], i * 3);
    sGeo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(sOff, 3));
    sGeo.instanceCount = splashes;
    const sMat = new THREE.ShaderMaterial({ vertexShader: SPLASH_VERT, fragmentShader: SPLASH_FRAG, transparent: true, depthWrite: false, uniforms });
    const sMesh = new THREE.Mesh(sGeo, sMat);
    sMesh.frustumCulled = false;
    const group = new THREE.Group();
    group.add(lines, sMesh);
    return { group, uniforms, disposables: [geo, mat, sGeo, sMat, plane] };
  }, [count, splashes]);
  useEffect(() => () => built.disposables.forEach((d) => d.dispose()), [built]);
  useFrame(({ camera }) => built.uniforms.uCam.value.copy(camera.position));
  return <primitive object={built.group} />;
}

export function Ground({ reflector, resolution }: { reflector: boolean; resolution: number }) {
  const rough = useMemo(() => {
    const t = createNoiseTexture(256);
    t.repeat.set(160, 160);
    return t;
  }, []);
  useEffect(() => () => rough.dispose(), [rough]);
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0}>
      <planeGeometry args={[4200, 4200]} />
      {reflector ? (
        <MeshReflectorMaterial
          key={resolution}
          resolution={resolution}
          blur={[220, 60]}
          mixBlur={0.9}
          mixStrength={3.2}
          mixContrast={1.1}
          mirror={0.75}
          depthScale={0.6}
          minDepthThreshold={0.3}
          maxDepthThreshold={1.4}
          color="#0d0b16"
          metalness={0.6}
          roughness={0.75}
          roughnessMap={rough}
        />
      ) : (
        <meshStandardMaterial color="#0d0b16" metalness={0.75} roughness={0.32} roughnessMap={rough} />
      )}
    </mesh>
  );
}
