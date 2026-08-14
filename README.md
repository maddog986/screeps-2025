# Hivemind

A TypeScript Screeps AI. Each owned room is run by a **RoomHivemind** that surveys the room, places buildings, fills spawn queues, and runs towers/links. Creeps do not follow hardcoded state machines. They pick a scored **task** (harvest, haul, build, upgrade, fight, scout, claim) and execute it through `CreepManager`.

This repo started from [screeps-typescript-starter](https://github.com/screepers/screeps-typescript-starter). The `hivemind` branch is the latest working design.

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

A room is "wanted" if it appears in `CONFIG.rooms` (or is `sim`). Wanted rooms get the full structure scan and build planner even before they are fully owned.

### Spawn quotas

Bodies scale with `energyCapacityAvailable`. Quotas start conservative and grow with infrastructure:

| Role | When it spawns | Job |
| --- | --- | --- |
| `harvester` | Always at least 1 | Mine sources. Dump into nearby containers/links. Will upgrade/build/haul if those specialists do not exist yet. |
| `mule` | +1 per source, spawn, or controller container | Move energy: source containers → spawn/extensions/towers → controller container. |
| `upgrader` | Controller level ≥ 2.1 | Sit on the controller and pull from the nearby container/link. |
| `builder` | Containers exist and there are construction sites | Build the bunker and roads. |
| `defender` | Quota stays 0 unless you raise it | Attack hostiles in this room, or travel to a threatened help room. |
| `scout` | Quota stays 0 unless you raise it | Walk adjacent rooms so `Memory.rooms` stays fresh. |
| `claimer` | Quota stays 0 unless you raise it | Claim or reserve the next unowned room listed in `CONFIG.rooms`. |

Harvesters bootstrap a new room alone. Once containers go up, mules take over logistics and harvesters stay on the sources.

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

Rooms listed in `CONFIG.rooms` (other than `default`) are expansion targets.

- At RCL 4+, a safe room treats those names as **help rooms**. If a target is visible and unowned, its sources are treated as remote harvest targets. If it is owned but still building a spawn, this room can reassign a spare harvester to go help.
- A claimer (if you set `creepsSetup.claimer.max`) walks to the first configured room that is not yours and `claimController`s it. If GCL is not high enough it reserves and signs instead.
- A scout (if you set `creepsSetup.scout.max`) walks `Game.map.describeExits` neighbors, revisiting rooms whose `Memory.rooms[name].lastSeen` is older than 150 ticks (300 if they were threatening).

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

CONFIG.rooms.default             // fallback for rooms not listed by name
CONFIG.rooms.W8N3                // per-room debug + bunker + spawnPos
```

`debug` is a list of channels: `manageCreeps`, `manageSpawns`, `manageTowers`, `manageConstruction`, `manageRoles`, `manageLinks`. Enabled channels dump an HTML log at the end of the tick. Leave it empty (or omit it) in production — `manageCreeps` is expensive.

**Update `CONFIG.rooms` to your rooms before deploying.** The checked-in names (`W8N3`, `W7N3`, `W7N4`) and `spawnPos` values are from the original shard. `default` is used for any other visible room, including the simulator.

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

Needs Node 18 (see `.nvmrc`).

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

Destinations in `screeps.sample.json`: `main`, `sim`, `season`, `pserver`. Private servers need [screepsmod-auth](https://github.com/ScreepsMods/screepsmod-auth).

```bash
npm run lint
```

## Manual overrides

- **Flag named like a creep** — that creep walks to the flag and ignores tasks until it arrives.
- **Room flags** — idle creeps path to the nearest flag (useful as a harvester or upgrader park).
- **`CONFIG.rooms[name].debug`** — turn on a channel to see why a creep picked a task.

## Known gaps

- Scout and claimer quotas default to 0. Expansion code is implemented; it will not spawn those creeps until you raise `max`.
- Defender quota is also 0. Towers are the live defense.
- Squad idle movement uses a hardcoded coordinate.
- Bunker stencil is filled through RCL 5. Storage, terminal, and later structures are in the letter map but not in the current layout.
- `hivemind` is the branch that was being brought online. Expect scoring weights to need live tuning.
