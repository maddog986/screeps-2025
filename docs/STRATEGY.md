# Hivemind strategy brief

Primer for humans and Cloud Agents. The bot's job is not to play a scripted build order. It is to **react to the room in front of it** so a single placed spawn becomes a colony, then a neighbor, without anyone editing `CONFIG.rooms` first.

Official rules worth internalizing: [Screeps docs](https://docs.screeps.com/), especially controller levels, `BODYPART_COST`, and `CONTROLLER_STRUCTURES`.

## What Screeps actually constrains

| Constraint | Why it matters here |
| --- | --- |
| **RCL unlocks** | RCL 1 is a spawn and 300 energy. Extensions land at RCL 2 (5), 3 (10), 4 (20). First tower at 3. Storage at 4. Links at 5. The bunker stencil must not place what RCL cannot build. |
| **Energy / tick** | A source gives 10 energy/tick in owned rooms (3000 per 300 ticks). Early creeps that wander empty are the usual death spiral. |
| **Spawn busy** | One spawn is a single queue. Spawn cheap generalists first; fat bodies wait for extensions. |
| **GCL** | You may only *claim* as many rooms as `Game.gcl.level`. Extra rooms can be reserved. |
| **CPU** | Every `find`, `moveTo`, and debug HTML costs budget. A pretty log that runs every tick will starve the colony later. |
| **Visibility** | You only see rooms with a creep or structure. Scouts exist to fill `Memory.rooms`. |

## Intended life cycle

`src/colony_phase.ts` picks a phase from the room snapshot (RCL, extensions, containers, tower, storage, threat). Spawn quotas, bodies, remotes, and task weights all come from that policy.

```
bootstrap  RCL 1, no extensions
           3–5 cheap WCM generalists. No mule/builder/upgrader roles.
           Score upgrade and spawn-fill above building (unless the site is a spawn).

grow       RCL 2+ or any extension exists
           Cheap mule after a source container + 2 harvesters.
           1 upgrader. 1 builder if sites exist.
           5W miners only at 550 capacity, 5 extensions, source container, and a mule.

operate    RCL 3 + tower + 5 extensions + source container
           Static miners, mules, scouts. Remotes if RCL 4 and safe.

expand     RCL 4+, 1300 capacity, storage or source containers, threat 0
           Claimer if GCL and a scored target exist. Extra harvester for remotes.
```

```
RCL 1  Place spawn — bootstrap generalists mine, fill spawn, upgrade to RCL 2
RCL 2  Extensions, dedicated upgrader, first mule once a source container exists
RCL 3  Tower, more extensions, scout starts mapping exits
RCL 4  Storage (hub), roads, remotes, claimer if GCL allows and a neighbor looks safe
RCL 5  Links: source → spawn. Fewer mule trips.
RCL 6  Terminal, more extensions, controller link
```

Energy path we already encode:

**source → harvester → source container/link → mule → spawn/extensions/towers → controller container/link → upgrader**

After storage exists, the hub should become **source container → storage → (spawn | controller)**. That is the next economy unlock, and it is not fully implemented yet.

## Roles are biases

Harvesters may upgrade and build if no specialist exists. That is how a lonely spawn bootstraps. Once mules exist, harvesters should stay on sources. Once upgraders exist, random WORK creeps should stop sitting on the controller.

Spawn order is already harvester → mule → builder → upgrader → defender → scout → claimer. Keep economy ahead of GCL flex.

## Combat

Towers are the real defense until RCL 4+. Threat levels: 0 safe, 1 unarmed, 2 armed, 3 enemy tower, 4 enemy-owned. Do not send claimers or scouts into 2+. `squads.ts` is a sketch; idle movement to a hardcoded tile is a known hole.

## Expansion

`getExpansionTargets()` should pick rooms the way a player would:

1. Unowned (or ours to finish).
2. Two sources if possible.
3. Low threat, no enemy tower.
4. Adjacent or one hop from an owned room.
5. `CONFIG.rooms` names are hints, not a mandatory campaign.

If GCL is 1, do not claim. Reserve or remote-mine instead.

## How to brief a new Cloud Agent

Paste something like this (edit the last line with what you saw in sim):

```
Repo: hivemind branch. Read README.md, docs/STRATEGY.md, and .cursor/rules/screeps.mdc.

This is a Screeps TypeScript bot. Goal: place one spawn and let RoomHivemind grow the room, then expand via scout/claimer.

CI already deploys cursor/** and hivemind pushes to the Screeps sim branch.

Evolve the next slice on the strategy priority list. Open a PR. tsc and npm run build must pass.

Live notes from sim:
- (paste console / "creeps idle at controller" / "spawn empty" / etc.)
```

A new session is fine once this primer is on `hivemind`. This session already has the codebase in its head if you would rather say "go" here.

## Next slices (backlog)

1. **Reserve remotes** — claimer/reserver on a neighbor source room when GCL is tight.
2. **Link balancing** — source → spawn is placed at RCL 5; tune `manageLinks` if energy sits in the wrong link.
3. **Tower + walls** — ramparts already cover spawn/towers at RCL 3; extend when threat rises.
4. **CPU pass** — persist bunker plan, cache paths, drop unused visuals.

## What not to do

- Do not replace the task scorer with a giant `if (role === ...)` state machine.
- Do not require a room to be listed in `CONFIG.rooms` to function.
- Do not commit `screeps.json` or tokens.
- Do not turn on `manageCreeps` debug in `default` config.
