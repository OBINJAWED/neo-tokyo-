# NEO TOKYO — After Dark

An interactive cyberpunk Tokyo 3D environment in React Three Fiber / Three.js, featuring iconic Tokyo landmarks, futuristic neon architecture, cinematic camera controls, rain and volumetric atmospheric effects, and procedural ambient audio.

## Quick Start

### 1. Install Dependencies
```bash
npx pnpm install
```

### 2. Run the Development Server
```bash
npx pnpm dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 3. Build for Production
```bash
npx pnpm build
```

### 4. Run Typecheck
```bash
npx pnpm typecheck
```

## Project Structure

- `artifacts/neo-tokyo/`: Main 3D Cyberpunk Tokyo experience (React 19, Three.js, React Three Fiber, Postprocessing, TailwindCSS, Lucide).
  - `src/scene/`: 3D components for the city skyline, landmarks (Tokyo Tower, Shibuya Crossing, etc.), rain atmosphere, and lighting.
  - `src/lib/city-audio.ts`: Web Audio procedural ambience engine.
  - `src/pages/Experience.tsx`: Main interactive cockpit, camera presets, HUD, and controls.
- `artifacts/mockup-sandbox/`: UI design preview sandbox.
- `artifacts/api-server/`: Backend service scaffold.
- `lib/`: Shared TypeScript client and schema libraries (`api-client-react`, `api-spec`, `api-zod`, `db`).
