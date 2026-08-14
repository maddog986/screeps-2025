'use strict'
/*
 * Local Hivemind simulator runner.
 *
 * Usage:
 *   npm run build && node tools/sim/run.js [--ticks=200] [--verbose] [--snapshot=25]
 *
 * Boots the COMPILED bot (dist/main.js) against the local engine mock with a
 * spawn at 20,26 and prints creep-behavior analytics so targeting / idling /
 * wandering flaws are measurable. See tools/sim/engine.js for fidelity notes.
 */
const path = require('path')
const engine = require('./engine')

function arg(name, def) {
    const hit = process.argv.find(a => a.startsWith(`--${name}=`))
    if (hit) return hit.split('=')[1]
    if (process.argv.includes(`--${name}`)) return true
    return def
}

const TICKS = parseInt(arg('ticks', '200'), 10)
const SNAP = parseInt(arg('snapshot', '25'), 10)
const VERBOSE = !!arg('verbose', false)

engine.installGlobals()
const world = engine.createWorld({ spawnPos: { x: 20, y: 26 } })
const Game = engine.getGame()
const Memory = engine.getMemory()

// Load the compiled bot AFTER globals exist.
const distPath = path.resolve(__dirname, '../../dist/main.js')
let bot
try {
    bot = require(distPath)
} catch (e) {
    console.error(`Failed to load ${distPath}. Run "npm run build" first.\n`, e)
    process.exit(1)
}
if (typeof bot.loop !== 'function') { console.error('dist/main.js does not export loop()'); process.exit(1) }

// ---------------------------------------------------------------------------
// Analytics accumulators
// ---------------------------------------------------------------------------
const stats = {} // per creep: { role, idle, alive, steps, switches, lastTask, targets:Set, actions:{} }
function ensure(name, role) {
    if (!stats[name]) stats[name] = { role, idle: 0, alive: 0, steps: 0, switches: 0, lastTask: null, targets: new Set(), actions: {} }
    return stats[name]
}

function rebuildById() {
    const w = engine.getWorld()
    for (const r of Object.values(w.rooms)) {
        for (const s of r._structures) w.byId[s.id] = s
        for (const s of r._sites) w.byId[s.id] = s
        for (const s of r._sources) w.byId[s.id] = s
        if (r.controller) w.byId[r.controller.id] = r.controller
    }
    for (const c of Object.values(w.creeps)) w.byId[c.id] = c
}

function roomSnapshot() {
    const room = Game.rooms.sim
    const spawn = room._structures.find(s => s.structureType === 'spawn')
    const byRole = {}
    for (const c of Object.values(world.creeps)) { if (c.spawning) continue; byRole[c.memory.role] = (byRole[c.memory.role] || 0) + 1 }
    const exts = room._structures.filter(s => s.structureType === 'extension').length
    const conts = room._structures.filter(s => s.structureType === 'container').length
    return {
        tick: Game.time, phase: room.memory.phase, rcl: room.controller.level,
        prog: `${room.controller.progress}/${room.controller.progressTotal}`,
        spawnE: `${spawn.store.energy}/${room.energyAvailable}:${room.energyCapacityAvailable}`,
        roles: byRole, sites: room._sites.length, exts, conts,
    }
}

function creepLine(c) {
    const t = (c.memory.tasks && c.memory.tasks[0]) ? c.memory.tasks[0].action : '-'
    return `    ${c.name.padEnd(4)} ${String(c.memory.role).padEnd(9)} @${c.pos.x},${c.pos.y} store=${c.store.energy}/${c.store.getCapacity()} task=${t}${c._moved ? ' moved' : ''}${c._acted ? ' act:' + c._acted : ''}`
}

console.log(`\n=== Hivemind local sim: ${TICKS} ticks, spawn @20,26, 2 sources, controller @30,20 ===\n`)

for (let i = 0; i < TICKS; i++) {
    // reset per-tick flags
    for (const c of Object.values(world.creeps)) { c._moved = false; c._acted = null }
    // In real Screeps, Game objects are recreated each tick, which resets the
    // bot's per-tick caches (RoomHivemind, CreepManager.creepCompletedActions).
    // We reuse objects across ticks, so clear the cached managers to match.
    for (const c of Object.values(world.creeps)) delete c._manager
    for (const r of Object.values(world.rooms)) delete r._manager
    rebuildById()

    Game.time++
    try {
        bot.loop()
    } catch (e) {
        console.error(`\n!! bot.loop() threw on tick ${Game.time}:\n`, e)
        console.error('World creeps:', Object.keys(world.creeps))
        process.exit(1)
    }

    // post-loop world updates
    const room = Game.rooms.sim
    for (const s of room._structures) {
        if (s.structureType === 'spawn') s.tickSpawn()
    }
    for (const src of room._sources) src.tick()

    // accumulate analytics for live (non-spawning) creeps
    for (const c of Object.values(world.creeps)) {
        if (c.spawning) continue
        const st = ensure(c.name, c.memory.role)
        st.alive++
        st.steps = c._stepsThisLife
        if (c._moved) {/* moving counts as active */}
        if (c._acted) st.actions[c._acted] = (st.actions[c._acted] || 0) + 1
        const task = (c.memory.tasks && c.memory.tasks[0]) ? c.memory.tasks[0] : null
        const taskAction = task ? task.action : null
        const taskId = task ? (task.id || (task.pos ? `${task.pos.x},${task.pos.y}` : null)) : null
        if (taskAction !== st.lastTask) { if (st.lastTask !== null) st.switches++; st.lastTask = taskAction }
        if (taskId) st.targets.add(taskId)
        if (!c._moved && !c._acted) st.idle++
    }

    if (Game.time % SNAP === 0 || i === TICKS - 1) {
        const s = roomSnapshot()
        console.log(`[t${String(s.tick).padStart(3)}] phase=${String(s.phase).padEnd(9)} RCL${s.rcl} ctrl=${s.prog.padEnd(11)} spawnE=${s.spawnE.padEnd(13)} ext=${s.exts} cont=${s.conts} sites=${s.sites} creeps=${JSON.stringify(s.roles)}`)
        if (VERBOSE) {
            for (const c of Object.values(world.creeps)) { if (c.spawning) continue; console.log(creepLine(c)) }
        }
    }
}

// ---------------------------------------------------------------------------
// Final summary
// ---------------------------------------------------------------------------
const w = engine.getWorld()
console.log(`\n=== SUMMARY after ${TICKS} ticks ===`)
console.log(`Controller: RCL ${Game.rooms.sim.controller.level}  progress ${Game.rooms.sim.controller.progress}/${Game.rooms.sim.controller.progressTotal}`)
console.log(`Energy: harvested=${w.stats.energyHarvested}  ->controller=${w.stats.energyToController}  ->spawn/ext=${w.stats.energyToSpawn}  ->build=${w.stats.energyToBuild}`)
console.log(`Structures built: ${JSON.stringify(w.stats.structuresBuilt)}`)

console.log(`\n--- Per-creep behavior ---`)
console.log('  name  role       alive idle  idle%  steps  taskSwitches  distinctTargets  actions')
for (const [name, st] of Object.entries(stats)) {
    const idlePct = st.alive ? ((st.idle / st.alive) * 100).toFixed(0) : '0'
    console.log(`  ${name.padEnd(5)} ${st.role.padEnd(9)} ${String(st.alive).padStart(5)} ${String(st.idle).padStart(5)} ${String(idlePct).padStart(5)}% ${String(st.steps).padStart(6)} ${String(st.switches).padStart(13)} ${String(st.targets.size).padStart(16)}  ${JSON.stringify(st.actions)}`)
}

console.log(`\n--- Flaw metrics by role (idle = ended tick with no move & no action) ---`)
const byRole = {}
for (const st of Object.values(stats)) {
    const r = byRole[st.role] ??= { creeps: 0, alive: 0, idle: 0, switches: 0, steps: 0 }
    r.creeps++; r.alive += st.alive; r.idle += st.idle; r.switches += st.switches; r.steps += st.steps
}
console.log('  role       creeps  aliveTicks  idleTicks  idle%   avgSwitches/creep  avgSteps/creep')
for (const [role, r] of Object.entries(byRole)) {
    const idlePct = r.alive ? ((r.idle / r.alive) * 100).toFixed(0) : '0'
    console.log(`  ${role.padEnd(9)} ${String(r.creeps).padStart(6)} ${String(r.alive).padStart(11)} ${String(r.idle).padStart(10)} ${String(idlePct).padStart(5)}%  ${(r.switches / r.creeps).toFixed(1).padStart(17)}  ${(r.steps / r.creeps).toFixed(1).padStart(13)}`)
}
console.log('')
