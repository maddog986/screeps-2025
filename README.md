# Hivemind

A TypeScript Screeps AI. The intended loop is: **place one spawn, then watch the colony grow.** Each owned room is run by a **RoomHivemind** that surveys the room, places buildings, fills spawn queues, and runs towers/links. Creeps do not follow hardcoded state machines. They pick a scored **task** (harvest, haul, build, upgrade, fight, scout, claim) and execute it through `CreepManager`. Quotas and the bunker stencil unlock from RCL and infrastructure, so the same code bootstraps a brand-new spawn and later expands into scouted neighbors.

This repo started from [screeps-typescript-starter](https://github.com/screepers/screeps-typescript-starter). The `hivemind` branch is the latest working design.

Strategy for humans and Cloud Agents lives in [`docs/STRATEGY.md`](docs/STRATEGY.md). Cursor loads [`.cursor/rules/screeps.mdc`](.cursor/rules/screeps.mdc) on every session.

## How a tick runs

`src/main.ts` is the only Screeps entry point:

1. Delete `Memory.creeps` entries for creeps that no longer exist.
2. Touch `room.manager` for every visible room. The first access constructs `RoomHivemind`, which is the room's entire tick: census, spawn quotas, towers, construction, links, and opportunistic pickup/withdraw tasks.
3. `SquadManager` groups combat creeps and runs simple tactics if enemies are present.
4. Every non-spawning creep runs `CreepManager.manageCreepTasks()`: keep the current task if it is still valid, otherwise score candidates and take the best one.
5. Flush per-room debug logs (only if that room has debug channels enabled).

Room and creep managers are attached as prototypes (`room.manager`, `creep.manager`) in `src/prototypes.ts`. Range checks are cached for the tick via `getRangeToCached` / `isNearToCached`.

## Room hivemind

`src/room_hivemind.ts` is the colony brain. On construct it:

- Records sources, hostiles, controller progress, and a **threat level** (0 = safe, 1 = unarmed visitors, 2 = armed creeps, 3 = enemy towers, 4 = enemy-owned).
- Indexes containers and links by whether they sit near a **source**, **spawn**, or **controller**. That index drives haul scoring later.
- Maintains a per-tick **shadow store** (`transfers`) so two creeps do not both plan to withdraw the last 50 energy from the same container.
- For owned rooms: sizes creep bodies, attacks/heals/repairs with towers, plans the bunker, pumps source links toward spawn/controller links, and spawns whatever role is under quota.

Any **owned** room (plus `sim` and names listed in `CONFIG.rooms`) gets the full structure scan and build planner. You do not have to pre-register a room for a placed spawn to start working. `CONFIG.rooms` is for per-room overrides (`spawnPos`, bunker, debug) and optional expansion hints.

### Spawn quotas

Bodies scale with `energyCapacityAvailable`. Quotas react to what the room already has — that is the "grows on its own" part. Spawn order is harvester → mule → builder → upgrader → defender → scout → claimer.

| Role | When it spawns | Job |
| --- | --- | --- |
| `harvester` | 2–4 generalists before source containers; then 1 per source | Mine sources. Dump into nearby containers/links. Will upgrade/build/haul if those specialists do not exist yet. |
| `mule` | +1 per source container, +1 if a spawn container exists, +1 controller container at RCL 3+ | Move energy: source containers → spawn/extensions/towers → controller container. |
| `builder` | Any construction sites (2 if there are 3+ sites and containers) | Build the bunker and roads. |
| `upgrader` | RCL 2+ (2 at RCL 4 with a controller container) | Sit on the controller and pull from the nearby container/link. |
| `defender` | Threat level ≥ 2 | Attack hostiles in this room, or travel to a threatened help room. |
| `scout` | RCL 3+, safe, `CONFIG.autonomy.explore` | Walk adjacent rooms so `Memory.rooms` stays fresh. |
| `claimer` | RCL 4+, safe, spare GCL, and an expansion target, `CONFIG.autonomy.expand` | Claim or reserve the next target. |

A brand-new spawn starts with a handful of small harvesters. They harvest, upgrade the controller, and build the first containers. After that, mules and specialists appear as the bunker unlocks.

### Energy flow

```
Source ──harvest──► Harvester ──transfer──► Source container / source link
                                              │
                                              │ mule withdraw, or link.transferEnergy
                                              ▼
                                    Spawn / extensions / towers
                                              │
                                              │ mule transfer once spawn is full
                                              ▼
                                    Controller container / controller link
                                              │
                                              ▼
                                           Upgrader
```

Towers shoot first, then heal, then repair only when the room is fat (energy in source containers, spare mules, tower above 800).

Repair threshold (`room.repairThreshold`) creeps upward when the room is rich and downward when hostiles show up, so towers stop polishing walls during a raid.

### Building

`CONFIG.rooms[roomName].build` holds a **bunker stencil** centered on the spawn (`A` in the layout). Letters map to structures:

`A` spawn · `E` extension · `T` tower · `C` container · `K` link · `.` road · plus storage, terminal, labs, etc.

Every `build_frequency` ticks the planner:

1. Stamps the stencil around the spawn, filtered to tiles that are still empty.
2. Places a container next to each source and the controller (`auto_build_containers`, default RCL 1).
3. Paths roads from spawn to sources/controller (`auto_build_roads_level`, default RCL 4).
4. Creates up to `max_constructions` sites, in level order, only if the controller is high enough.

`spawnPos` is used when a claimer first takes a room so the first spawn site is dropped at a known coordinate.

### Expansion

Outward growth is meant to happen without a scripted room list.

1. A scout walks `Game.map.describeExits` neighbors and writes `Memory.rooms` (owner, sources, threat, lastSeen). Stale rooms are revisited after 150 ticks (300 if they were threatening).
2. `getExpansionTargets()` prefers unowned names in `CONFIG.rooms`, then scouted unowned neighbors of rooms you already own (must have sources and threat &lt; 2).
3. A claimer walks to the nearest target and `claimController`s it. If GCL is not high enough it reserves and signs instead.
4. At RCL 4+, a safe home room treats those targets (and other owned rooms) as **help rooms**. Visible unowned rooms become remote harvest targets. A newly claimed room still building its spawn can receive a spare home harvester.

Set `CONFIG.autonomy.explore` / `expand` to `false` to keep a single-room colony.

### Combat

Towers handle most defense. `SquadManager` (`src/squads.ts`) is a separate layer: combat-bodied creeps in the same room are grouped into squads of 4, regroup if they spread out, then focus-fire / hit-and-run / hold / surround. Default tactic is surround. Idle squads currently walk toward a hardcoded parking tile — treat this as unfinished.

## Creep tasks

`src/creep_manager.ts` scores every legal target for the creep's role (and for roles it is allowed to impersonate when those creeps are missing). Score is priority plus a distance penalty plus a tiny random jitter so two creeps do not always pick the same container.

Tasks live on `creep.memory.tasks`:

- `TaskObject` — `{ id, action }` for a game object (source, spawn, container, …).
- `TaskPosition` — `{ pos, action }` for a room coordinate (scout / claim / move).

`blocking` tasks are dropped if the creep is not in range (used for opportunistic pickup). `persistent` tasks (renew) stay until they finish. One work action and one transfer action are allowed per tick; extra work returns `ERR_BUSY` and retries next tick.

Drop a flag named after a creep (`H1`, `M2`, …) to override AI and send that creep to the flag. The flag is removed when they arrive.

Idle creeps park on the nearest room flag, with mules preferring the link that matches their assigned station (spawn / source / controller).

## Configuration

All tunables are in `src/config.ts`.

```ts
CONFIG.visuals.enabled           // room text: RCL, repair threshold, role counts
CONFIG.visuals.show_assignments  // red count of creeps tasked to a structure
CONFIG.visuals.show_transfers    // shadow-store deltas
CONFIG.visuals.show_matrix       // reserved
CONFIG.visuals.creep_travel      // reserved

CONFIG.autonomy.explore          // spawn scouts (default true)
CONFIG.autonomy.expand           // spawn claimers when GCL allows (default true)

CONFIG.rooms.default             // fallback bunker / spawnPos for any unlisted room
CONFIG.rooms.W8N3                // optional per-room debug + bunker + spawnPos
```

`debug` is a list of channels: `manageCreeps`, `manageSpawns`, `manageTowers`, `manageConstruction`, `manageRoles`, `manageLinks`. Enabled channels dump an HTML log at the end of the tick. Leave it empty (or omit it) — `manageCreeps` is expensive.

`CONFIG.rooms` entries other than `default` are optional. Use them to pin `spawnPos` on a claim or to bias expansion toward specific rooms. `default` covers the simulator and any owned room you have not listed. The checked-in `W8N3` / `W7N3` / `W7N4` values are from the original shard.

## Project layout

```
src/main.ts            Tick loop
src/config.ts          Visuals, room list, bunker stencils
src/room_hivemind.ts   Room census, spawning, towers, links, builder
src/creep_manager.ts   Task scoring and execution
src/squads.ts          Combat squads
src/prototypes.ts      room.manager, creep.tasks, cached ranges
```

## Setup

Needs Node 18+ (see `.nvmrc`).

```bash
npm install
cp screeps.sample.json screeps.json
```

Edit `screeps.json` with a [Screeps auth token](https://screeps.com/a/#!/account/auth-tokens) (or private-server email/password). That file is gitignored.

```bash
npm run build          # compile to dist/main.js, no upload
npm run push-main      # upload to the "main" destination
npm run push-sim       # upload to the sim branch
npm run watch-main     # rebuild + upload on change
```

You can skip `screeps.json` and pass a token instead:

```bash
SCREEPS_TOKEN=... npm run push-sim
```

Destinations in `screeps.sample.json`: `main`, `sim`, `season`, `pserver`. Private servers need [screepsmod-auth](https://github.com/ScreepsMods/screepsmod-auth).

```bash
npm run lint
```

## CI: push to the Screeps simulator

`.github/workflows/deploy-sim.yml` builds the bundle and uploads it to the Screeps **`sim`** branch on every push to `hivemind` or `cursor/**` (Cloud Agent branches). That is the branch the in-game simulator runs. It uses `push` rather than `pull_request` so the `SCREEPS_TOKEN` repository secret is available.

One-time setup:

1. In the Screeps client, open **Script** and create a branch named `sim` if it does not exist. The API will not create it for you.
2. Create a **full access** auth token at [screeps.com/a/#!/account/auth-tokens](https://screeps.com/a/#!/account/auth-tokens).
3. Add it as `SCREEPS_TOKEN` on the GitHub **Screeps** environment
   (`Settings → Environments → Screeps`), which is what this workflow reads.
4. In the simulator, set the active branch to **sim**.

After that, each push to `hivemind` or a `cursor/**` branch overwrites `sim`. Use **Actions → Deploy to Screeps sim → Run workflow** to push `sim` or `main` by hand.

`SCREEPS_TOKEN` lives on the **Screeps** GitHub Environment (`Settings → Environments → Screeps`). The deploy job sets `environment: Screeps` so that secret is injected. A repository-level secret with the same name also works.

The token is read from the environment (`SCREEPS_TOKEN`). It is never committed. `screeps.json` stays local-only.

## Brief a Cloud Agent

New sessions do not remember this chat. They do read `.cursor/rules/screeps.mdc` and anything you paste.

A kickoff that is enough to set one free:

```
Read README.md, docs/STRATEGY.md, and .cursor/rules/screeps.mdc.
Evolve the next slice on the strategy backlog. Open a PR.
tsc and npm run build must pass. Pushes deploy to the Screeps sim branch.

What I saw in the simulator:
- (idle creeps / empty spawn / no construction / etc.)
```

This session already has the repo in context. You can also just say "go" here.

## Manual overrides

- **Flag named like a creep** — that creep walks to the flag and ignores tasks until it arrives.
- **Room flags** — idle creeps path to the nearest flag (useful as a harvester or upgrader park).
- **`CONFIG.rooms[name].debug`** — turn on a channel to see why a creep picked a task.

## Known gaps

- Squad idle movement uses a hardcoded coordinate.
- Bunker stencil is filled through RCL 5. Storage, terminal, and later structures are in the letter map but not in the current layout.
- Expansion picks the nearest safe scouted neighbor; it does not yet score mineral type, source count, or remote distance beyond one hop.
- Scoring weights still need live tuning. The design is emergent (highest-score task wins), not a scripted RCL checklist.
