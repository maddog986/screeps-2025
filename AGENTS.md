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

Uploading to Screeps requires credentials that are not present in this environment: either a `screeps.json` (gitignored, copy from `screeps.sample.json`) or a `SCREEPS_TOKEN` env var. Without one of these, `npm run push-*` throws "No upload credentials". `npm run build` (no DEST) works with no credentials and is what you use to verify a change compiles/bundles.

### Running / smoke-testing the bot without a Screeps server

The game engine is not available locally, so `require('./dist/main.js')` directly throws (the bundle augments Screeps globals like `Room.prototype` at load). To smoke-test the compiled bot you must stub the Screeps runtime: define global constructors `Room`/`RoomPosition`/`Source`/`Creep`, the `FIND_*`/`STRUCTURE_*`/`RESOURCE_*`/body-part constants, and `Game`/`Memory`, then call the exported `loop()`. A room named `sim` (or any owned room, or one listed in `CONFIG.rooms`) triggers the full `RoomHivemind` census. This is only a smoke test — real behavior must be watched in the Screeps simulator.

### Node

`.nvmrc` pins Node 18.18.0 but `package.json` engines allow `18.x || 20.x || 22.x`; the bot builds and runs fine on Node 22.
