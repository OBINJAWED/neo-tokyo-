import { Suspense, useMemo, type MutableRefObject } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { Bloom, ChromaticAberration, EffectComposer, Noise, ToneMapping, Vignette } from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { QUALITY, type Quality } from '@/lib/settings';
import { City } from './City';
import { Landmarks } from './Landmarks';
import { Flyers, Pedestrians, Searchlights, Traffic } from './Life';
import { FOG_COLOR, Ground, Rain, Sky } from './Atmosphere';
import { Rig } from './Rig';
import { sharedUniforms } from './materials';
import { VIEWPOINTS, type Command, type InputState, type Telemetry } from './world';

function Clock() {
  useFrame((s) => {
    sharedUniforms.uTime.value = s.clock.elapsedTime;
  });
  return null;
}

function Effects() {
  const offset = useMemo(() => new THREE.Vector2(0.0006, 0.0004), []);
  return (
    <EffectComposer multisampling={0}>
      <Bloom mipmapBlur intensity={0.9} luminanceThreshold={0.75} luminanceSmoothing={0.2} radius={0.78} />
      <ChromaticAberration offset={offset} radialModulation modulationOffset={0.35} blendFunction={BlendFunction.NORMAL} />
      <Vignette offset={0.28} darkness={0.72} />
      <Noise premultiply opacity={0.07} blendFunction={BlendFunction.SOFT_LIGHT} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}

interface Props {
  quality: Quality;
  rain: boolean;
  cinematic: boolean;
  input: MutableRefObject<InputState>;
  command: MutableRefObject<Command | null>;
  telemetry: MutableRefObject<Telemetry>;
  onShot: (name: string | null) => void;
  onArrive: (index: number) => void;
  onContextLost: () => void;
}

export default function Scene({ quality, rain, cinematic, input, command, telemetry, onShot, onArrive, onContextLost }: Props) {
  const q = QUALITY[quality];
  return (
    <Canvas
      dpr={q.dpr}
      gl={{ antialias: !q.post, powerPreference: 'high-performance', stencil: false }}
      camera={{ fov: 64, near: 0.3, far: 5200, position: VIEWPOINTS[0].pos }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        scene.fog = new THREE.FogExp2(FOG_COLOR, 0.00115);
        scene.background = new THREE.Color(FOG_COLOR);
        gl.domElement.addEventListener('webglcontextlost', (e) => {
          e.preventDefault();
          onContextLost();
        });
      }}
      style={{ position: 'absolute', inset: 0, touchAction: 'none' }}
    >
      <Clock />
      <Suspense fallback={null}>
        <Environment resolution={128} frames={1}>
          <color attach="background" args={['#0c0716']} />
          <Lightformer form="rect" intensity={3} color="#ff2d75" position={[30, 6, -40]} scale={[40, 6, 1]} />
          <Lightformer form="rect" intensity={3} color="#00e5ff" position={[-40, 10, 20]} rotation-y={Math.PI / 2} scale={[50, 4, 1]} />
          <Lightformer form="rect" intensity={2} color="#ffb21e" position={[0, 4, 50]} rotation-y={Math.PI} scale={[60, 3, 1]} />
          <Lightformer form="circle" intensity={1.2} color="#7a4dff" position={[0, 60, 0]} rotation-x={Math.PI / 2} scale={40} />
        </Environment>
      </Suspense>
      <Sky />
      <hemisphereLight args={['#5b3a9a', '#ff2d75', 0.5]} />
      <directionalLight position={[-300, 400, 200]} intensity={0.35} color="#8fa8ff" />
      <pointLight position={[0, 14, 0]} intensity={900} distance={120} decay={2} color="#ff4f8b" />
      <pointLight position={[-28, 10, -26]} intensity={700} distance={90} decay={2} color="#2fe6ff" />
      <pointLight position={[30, 12, 28]} intensity={700} distance={90} decay={2} color="#ffb347" />
      <City showFar={q.far} />
      <Landmarks />
      <Traffic />
      <Pedestrians count={q.peds} />
      <Flyers />
      <Searchlights />
      {rain && <Rain count={q.rain} splashes={q.splashes} />}
      <Ground reflector={q.reflector} resolution={q.reflectRes || 256} />
      <Rig input={input} command={command} telemetry={telemetry} cinematic={cinematic} onShot={onShot} onArrive={onArrive} />
      {q.post && <Effects />}
    </Canvas>
  );
}
