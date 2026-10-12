# NEO TOKYO — After Dark

A browser-based, interactive cyberpunk Tokyo environment that places the viewer inside a neon city with recognizable Tokyo landmarks.

## Run & Operate

- Start the app using the managed workflow `artifacts/neo-tokyo: web`.
- `pnpm --filter @workspace/neo-tokyo run typecheck` — check the experience's TypeScript
- `pnpm run typecheck` — full typecheck across all packages
- The experience does not need accounts, API keys, or a database.
- The managed workflow supplies the frontend's `PORT` and `BASE_PATH`.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- React + Vite, Three.js / React Three Fiber
- Native Web Audio for opt-in procedural urban ambience
- The shared Express API and database packages are scaffolded, but are not required for the city experience.

## Where things live

- `artifacts/neo-tokyo/` — interactive city experience, served at `/`
- `artifacts/neo-tokyo/src/lib/city-audio.ts` — user-activated ambient sound engine
- `artifacts/mockup-sandbox/` — separate design preview scaffold, not the city app
- `artifacts/api-server/` — shared backend scaffold

## Architecture decisions

- Prioritize a real surrounding, explorable environment rather than a marketing page or a static image. **Why:** the user wants to be placed in the middle of the city.
- Treat the AAA reference as a visual ambition, not a claim that this browser build matches a large studio game. **Why:** atmosphere and recognizable architecture matter, but performance must remain usable.
- No backend is needed for local camera controls and atmosphere settings. **Why:** there is no requested shared state or account system.

## Product

An immersive night-time Tokyo scene with landmark viewpoints, exploration and cinematic camera controls, rain, quality controls, and optional ambient sound.

## User preferences

- The user wants recognizable, iconic Tokyo buildings in the skyline.
- Place the user in the middle, surrounded by neon cyberpunk Tokyo.
- The user describes the target as "very professional and advanced, akin to a triple a video game."

## Gotchas

- Sound must start from an explicit user gesture and must be muted when the tab is hidden.
- Preserve drag-to-look as an alternative to pointer lock, which embedded browser previews can restrict.
- Use artifact base-prefixed asset URLs and the managed workflow; do not hardcode local server addresses.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
