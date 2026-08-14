# AGENTS.md

Read `README.md`, `docs/STRATEGY.md`, and `.cursor/rules/screeps.mdc` before changing behavior. This is Maddog986's Hivemind — a task-scored Screeps AI, not a starter kit.

## Cursor Cloud specific instructions

This repo is a **Screeps TypeScript bot**. There is no local server or web app to run: `src/main.ts` is bundled by rollup into `dist/main.js` and that bundle is what runs each tick inside the Screeps game (or is uploaded to the Screeps server via CI). Dependencies are already installed by the startup update script (`npm install`).

### Services / commands

There is a single "service": the compiled bot bundle. The relevant dev commands (see `package.json`):

- Typecheck (primary gate): `npx tsc --noEmit`
- Build the deploy bundle: `npm run build` → writes `dist/main.js` (rollup prints "No destination specified - code will be compiled but not uploaded"; that is expected and means it built without uploading).
- Lint: `npm run lint` — see caveat below.

`.cursor/rules/screeps.mdc` requires `npx tsc --noEmit` and `npm run build` to pass. CI (`.github/workflows/deploy-sim.yml`) only runs `npm install` + `npm run push-sim` (build + upload) on pushes to `hivemind` and `cursor/**`; it does **not** run lint or tests.

### Lint is currently broken (pre-existing, not an env issue)

`npm run lint` fails regardless of setup:
- ESLint 9 defaults to flat config but the repo ships legacy `.eslintrc.js`. Running it needs `ESLINT_USE_FLAT_CONFIG=false`.
- Even then, `.eslintrc.js` extends `"prettier/@typescript-eslint"`, a subpath that the installed `eslint-config-prettier` v10 no longer exports, so ESLint throws `ERR_PACKAGE_PATH_NOT_EXPORTED`.

Do not treat lint failure as something your change broke. Rely on `npx tsc --noEmit` (strict mode is on) as the correctness gate. Only fix the eslint config if a task explicitly asks for it.

### Deploying / uploading

`SCREEPS_TOKEN` is provided as an environment secret in Cursor Cloud, so uploads work directly:

- `npm run push-sim` builds and uploads to the Screeps **`sim`** branch — the active simulator branch (`activeSim: true`). This is how you deploy a change for the player to watch in the in-game simulator. `rollup-plugin-screeps` uploads silently on success; it only prints the rollup build line, so verify with the Screeps API if needed (e.g. `curl -s -H "X-Token: $SCREEPS_TOKEN" "https://screeps.com/api/user/code?branch=sim"`).
- `npm run push-main` / `push-season` / `push-pserver` target other destinations.
- `npm run build` (no DEST) compiles/bundles without uploading and needs no credentials — use it to verify a change compiles.

If `SCREEPS_TOKEN` is ever missing, the fallback is a gitignored `screeps.json` (copy from `screeps.sample.json`); without either, `npm run push-*` throws "No upload credentials". The token grants API/upload access only — it does not log you into the Screeps web client, so the simulator UI itself can't be driven from here.

### Running / smoke-testing the bot without a Screeps server

The game engine is not available locally, so `require('./dist/main.js')` directly throws (the bundle augments Screeps globals like `Room.prototype` at load). To smoke-test the compiled bot you must stub the Screeps runtime: define global constructors `Room`/`RoomPosition`/`Source`/`Creep`, the `FIND_*`/`STRUCTURE_*`/`RESOURCE_*`/body-part constants, and `Game`/`Memory`, then call the exported `loop()`. A room named `sim` (or any owned room, or one listed in `CONFIG.rooms`) triggers the full `RoomHivemind` census. This is only a smoke test — real behavior must be watched in the Screeps simulator.

### Node

`.nvmrc` pins Node 18.18.0 but `package.json` engines allow `18.x || 20.x || 22.x`; the bot builds and runs fine on Node 22.

### Local simulator (observe creep behavior without a Screeps server)

`npm run sim` builds the bot and runs it against a lightweight local Screeps engine mock (`tools/sim/`), so you can watch decision-making (task selection, idling, wandering, energy flow) at high speed and get analytics. It boots a room with a spawn at `20,26`, two sources, and a controller, then prints per-role flaw metrics (idle%, task switches, steps, actions) plus an energy ledger.

- Args: `npm run sim -- --ticks=1000 --snapshot=100 [--verbose]`.
- `tools/sim/engine.js` is the world/API mock; `tools/sim/run.js` is the driver + analytics. See the header comment in `engine.js` for fidelity notes.
- Fidelity: it runs the REAL compiled bot each tick, so targeting/assignment/idle flaws are trustworthy. Combat/minerals/links/fatigue are not modeled — use it for economy/behavior. Confirm final behavior in the real Screeps simulator.
- Movement matches the engine's intent model: `move`/`moveTo` register an intent and return `OK`, but the creep only changes tiles during an end-of-tick deconfliction phase (`world.resolveMovement`). `OK` does NOT mean the creep moved. Rules: a stationary creep blocks a mover (no shoving), chains that end on an empty tile all move, head-on swaps and cycles fail, and contested tiles are won by the earliest-issued intent (so the ORDER the bot issues moves matters). `node tools/sim/movement.test.js` pins these rules.
- Next-step selection uses a BFS that routes around walls, structures, and other creeps (like `moveTo` with `ignoreCreeps=false`); it only aims through creeps when no creep-free route exists. Use a real path model — greedy step-toward-target falsely strands creeps and inflates idle%.
- Sources are given a realistic number of mining tiles (`sourceOpenTiles`, default 2) by walling the rest, so harvester over-assignment/eviction behaves like real rooms. An all-open room hides that dynamic.
- Important sim detail: real Screeps recreates `Game` objects every tick (which resets the bot's per-tick caches like `CreepManager.creepCompletedActions`). The runner emulates this by clearing cached `creep._manager`/`room._manager` before each tick — do not remove that or creeps will "freeze" after one action.
