'use strict'
/*
 * Minimal local Screeps engine mock.
 *
 * Goal: run the REAL compiled bot (dist/main.js) tick-by-tick against a
 * controllable world so we can observe creep decision-making (targeting,
 * task selection, idling, movement) at high speed and collect analytics.
 *
 * Fidelity notes / intentional simplifications:
 *  - Movement is greedy step-toward-target (Chebyshev), avoiding blocking
 *    structures/creeps. It is NOT Screeps' exact A*; use it to spot task
 *    thrash / assignment flaws, not to micro-optimize literal path length.
 *  - Action intents are applied immediately (return codes computed from
 *    current state), which matches how the bot reacts within a tick.
 *  - Combat, minerals, links transfer cooldowns, road build-speed nuances,
 *    and fatigue are not modeled. Early-game economy (bootstrap -> grow) is.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const C = {
    OK: 0,
    ERR_NOT_OWNER: -1, ERR_NO_PATH: -2, ERR_NAME_EXISTS: -3, ERR_BUSY: -4,
    ERR_NOT_FOUND: -5, ERR_NOT_ENOUGH_ENERGY: -6, ERR_NOT_ENOUGH_RESOURCES: -6,
    ERR_INVALID_TARGET: -7, ERR_FULL: -8, ERR_NOT_IN_RANGE: -9,
    ERR_INVALID_ARGS: -10, ERR_TIRED: -11, ERR_NO_BODYPART: -12,
    ERR_RCL_NOT_ENOUGH: -14, ERR_GCL_NOT_ENOUGH: -15,

    RESOURCE_ENERGY: 'energy',

    FIND_EXIT_TOP: 1, FIND_EXIT_RIGHT: 3, FIND_EXIT_BOTTOM: 5, FIND_EXIT_LEFT: 7,
    FIND_EXIT: 10, FIND_CREEPS: 101, FIND_MY_CREEPS: 102, FIND_HOSTILE_CREEPS: 103,
    FIND_SOURCES_ACTIVE: 104, FIND_SOURCES: 105, FIND_DROPPED_RESOURCES: 106,
    FIND_STRUCTURES: 107, FIND_MY_STRUCTURES: 108, FIND_HOSTILE_STRUCTURES: 109,
    FIND_FLAGS: 110, FIND_CONSTRUCTION_SITES: 111, FIND_MY_SPAWNS: 112,
    FIND_HOSTILE_SPAWNS: 113, FIND_MY_CONSTRUCTION_SITES: 114,
    FIND_HOSTILE_CONSTRUCTION_SITES: 115, FIND_MINERALS: 116, FIND_NUKES: 117,
    FIND_TOMBSTONES: 118,

    TOP: 1, TOP_RIGHT: 2, RIGHT: 3, BOTTOM_RIGHT: 4, BOTTOM: 5,
    BOTTOM_LEFT: 6, LEFT: 7, TOP_LEFT: 8,

    MOVE: 'move', WORK: 'work', CARRY: 'carry', ATTACK: 'attack',
    RANGED_ATTACK: 'ranged_attack', TOUGH: 'tough', HEAL: 'heal', CLAIM: 'claim',

    BODYPART_COST: { move: 50, work: 100, attack: 80, carry: 50, heal: 250, ranged_attack: 150, tough: 10, claim: 600 },
    CARRY_CAPACITY: 50,
    HARVEST_POWER: 2, UPGRADE_CONTROLLER_POWER: 1, BUILD_POWER: 5, REPAIR_POWER: 100,
    DISMANTLE_POWER: 50,
    SOURCE_ENERGY_CAPACITY: 3000, ENERGY_REGEN_TIME: 300,
    CREEP_SPAWN_TIME: 3, CREEP_LIFE_TIME: 1500,

    STRUCTURE_SPAWN: 'spawn', STRUCTURE_EXTENSION: 'extension', STRUCTURE_ROAD: 'road',
    STRUCTURE_WALL: 'constructedWall', STRUCTURE_RAMPART: 'rampart',
    STRUCTURE_KEEPER_LAIR: 'keeperLair', STRUCTURE_PORTAL: 'portal',
    STRUCTURE_CONTROLLER: 'controller', STRUCTURE_LINK: 'link',
    STRUCTURE_STORAGE: 'storage', STRUCTURE_TOWER: 'tower',
    STRUCTURE_OBSERVER: 'observer', STRUCTURE_POWER_SPAWN: 'powerSpawn',
    STRUCTURE_LAB: 'lab', STRUCTURE_TERMINAL: 'terminal',
    STRUCTURE_CONTAINER: 'container', STRUCTURE_NUKER: 'nuker',
    STRUCTURE_FACTORY: 'factory', STRUCTURE_KEY: 'keeperLair',

    LOOK_CREEPS: 'creep', LOOK_ENERGY: 'energy', LOOK_RESOURCES: 'resource',
    LOOK_SOURCES: 'source', LOOK_STRUCTURES: 'structure', LOOK_TERRAIN: 'terrain',
    LOOK_CONSTRUCTION_SITES: 'constructionSite',

    TERRAIN_MASK_WALL: 1, TERRAIN_MASK_SWAMP: 2,
    COLOR_RED: 1, COLOR_WHITE: 8,
}

// Energy required (progress) at each controller level to reach the next.
const CONTROLLER_LEVELS = { 1: 200, 2: 45000, 3: 135000, 4: 405000, 5: 1215000, 6: 3645000, 7: 10935000 }

// Structure counts allowed per structureType, indexed by RCL (0..8).
const CONTROLLER_STRUCTURES = {
    spawn: [0, 1, 1, 1, 1, 1, 1, 2, 3],
    extension: [0, 0, 5, 10, 20, 30, 40, 50, 60],
    link: [0, 0, 0, 0, 0, 2, 3, 4, 6],
    road: [2500, 2500, 2500, 2500, 2500, 2500, 2500, 2500, 2500],
    constructedWall: [0, 2500, 2500, 2500, 2500, 2500, 2500, 2500, 2500],
    rampart: [0, 0, 2500, 2500, 2500, 2500, 2500, 2500, 2500],
    tower: [0, 0, 0, 1, 1, 2, 2, 3, 6],
    storage: [0, 0, 0, 0, 1, 1, 1, 1, 1],
    observer: [0, 0, 0, 0, 0, 0, 0, 0, 1],
    powerSpawn: [0, 0, 0, 0, 0, 0, 0, 0, 1],
    extractor: [0, 0, 0, 0, 0, 0, 1, 1, 1],
    terminal: [0, 0, 0, 0, 0, 0, 1, 1, 1],
    lab: [0, 0, 0, 0, 0, 0, 3, 6, 10],
    container: [5, 5, 5, 5, 5, 5, 5, 5, 5],
    nuker: [0, 0, 0, 0, 0, 0, 0, 0, 1],
    factory: [0, 0, 0, 0, 0, 1, 1, 1, 1],
}
C.CONTROLLER_STRUCTURES = CONTROLLER_STRUCTURES

const BLOCKING_STRUCTURES = new Set([
    C.STRUCTURE_SPAWN, C.STRUCTURE_EXTENSION, C.STRUCTURE_TOWER, C.STRUCTURE_WALL,
    C.STRUCTURE_LINK, C.STRUCTURE_STORAGE, C.STRUCTURE_TERMINAL, C.STRUCTURE_LAB,
    C.STRUCTURE_NUKER, C.STRUCTURE_OBSERVER, C.STRUCTURE_POWER_SPAWN, C.STRUCTURE_FACTORY,
])

let world // set by createWorld; used by some globals
let idCounter = 1
const nextId = (p) => `${p}_${idCounter++}`

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
class Store {
    constructor(capacity, energy = 0) { this._cap = capacity; this.energy = energy }
    getCapacity() { return this._cap }
    getUsedCapacity() { return this.energy }
    getFreeCapacity() { return this._cap - this.energy }
}

// ---------------------------------------------------------------------------
// RoomPosition
// ---------------------------------------------------------------------------
class RoomPosition {
    constructor(x, y, roomName) { this.x = x; this.y = y; this.roomName = roomName }
    getRangeTo(t) { const p = t.pos || t; return Math.max(Math.abs(this.x - p.x), Math.abs(this.y - p.y)) }
    isNearTo(t) { return this.getRangeTo(t) <= 1 }
    isEqualTo(t) { const p = t.pos || t; return this.x === p.x && this.y === p.y }
    inRangeTo(t, r) { return this.getRangeTo(t) <= r }
    getDirectionTo(t) {
        const p = t.pos || t
        const dx = Math.sign(p.x - this.x), dy = Math.sign(p.y - this.y)
        if (dx === 0 && dy < 0) return C.TOP
        if (dx > 0 && dy < 0) return C.TOP_RIGHT
        if (dx > 0 && dy === 0) return C.RIGHT
        if (dx > 0 && dy > 0) return C.BOTTOM_RIGHT
        if (dx === 0 && dy > 0) return C.BOTTOM
        if (dx < 0 && dy > 0) return C.BOTTOM_LEFT
        if (dx < 0 && dy === 0) return C.LEFT
        if (dx < 0 && dy < 0) return C.TOP_LEFT
        return C.TOP
    }
    findClosestByRange(targets) {
        if (!Array.isArray(targets)) return null
        let best = null, bestR = Infinity
        for (const t of targets) { const r = this.getRangeTo(t); if (r < bestR) { bestR = r; best = t } }
        return best
    }
    findClosestByPath(targets) { return this.findClosestByRange(targets) }
    lookFor() { return [] }
}

// ---------------------------------------------------------------------------
// Game objects
// ---------------------------------------------------------------------------
class Source {
    constructor(room, x, y) {
        this.id = nextId('source'); this.room = room; this.pos = new RoomPosition(x, y, room.name)
        this.energy = C.SOURCE_ENERGY_CAPACITY; this.energyCapacity = C.SOURCE_ENERGY_CAPACITY
        this.ticksToRegeneration = 0
    }
    tick() {
        if (this.energy === 0) {
            if (this.ticksToRegeneration <= 0) this.ticksToRegeneration = C.ENERGY_REGEN_TIME
            this.ticksToRegeneration--
            if (this.ticksToRegeneration <= 0) { this.energy = this.energyCapacity; this.ticksToRegeneration = 0 }
        }
    }
}

class StructureController {
    constructor(room, x, y) {
        this.id = nextId('controller'); this.room = room; this.pos = new RoomPosition(x, y, room.name)
        this.structureType = C.STRUCTURE_CONTROLLER
        this.level = 1; this.progress = 0; this.my = true; this.owner = { username: world.username }
        this.ticksToDowngrade = 20000; this.safeMode = 0; this.hits = 0; this.hitsMax = 0
    }
    get progressTotal() { return this.level >= 8 ? 0 : CONTROLLER_LEVELS[this.level] }
    addProgress(n) {
        this.progress += n
        while (this.level < 8 && this.progress >= this.progressTotal) { this.progress -= this.progressTotal; this.level++ }
    }
}

class BaseStructure {
    constructor(room, x, y, type, capacity) {
        this.id = nextId(type); this.room = room; this.pos = new RoomPosition(x, y, room.name)
        this.structureType = type; this.my = true
        this.hits = 5000; this.hitsMax = 5000
        if (capacity != null) this.store = new Store(capacity)
    }
}

class StructureSpawn extends BaseStructure {
    constructor(room, x, y, name) {
        super(room, x, y, C.STRUCTURE_SPAWN, 300)
        this.name = name; this.spawning = null
        this.hitsMax = 5000; this.hits = 5000
    }
    spawnCreep(body, name, opts = {}) {
        if (this.spawning) return C.ERR_BUSY
        const cost = body.reduce((a, p) => a + C.BODYPART_COST[p], 0)
        if (this.room.energyAvailable < cost) return C.ERR_NOT_ENOUGH_ENERGY
        if (world.creeps[name] || Game.creeps[name]) return C.ERR_NAME_EXISTS
        // Deduct energy from spawn then extensions
        let remaining = cost
        const banks = [this, ...this.room._structures.filter(s => s.structureType === C.STRUCTURE_EXTENSION)]
        for (const b of banks) { const take = Math.min(remaining, b.store.energy); b.store.energy -= take; remaining -= take; if (remaining <= 0) break }
        const creep = new Creep(this.room, this.pos.x, this.pos.y, name, body, opts.memory || {})
        creep.spawning = true
        this.spawning = { name, needTime: body.length * C.CREEP_SPAWN_TIME, remainingTime: body.length * C.CREEP_SPAWN_TIME }
        world.pendingSpawns.push({ spawn: this, creep })
        world.creeps[name] = creep
        Game.creeps[name] = creep
        return C.OK
    }
    tickSpawn() {
        if (!this.spawning) return
        this.spawning.remainingTime--
        if (this.spawning.remainingTime <= 0) {
            const pending = world.pendingSpawns.find(p => p.spawn === this && p.creep.name === this.spawning.name)
            if (pending) {
                const c = pending.creep
                c.spawning = false
                const free = this.room._firstFreeAround(this.pos.x, this.pos.y)
                if (free) { c.pos.x = free.x; c.pos.y = free.y }
                world.pendingSpawns = world.pendingSpawns.filter(p => p !== pending)
            }
            this.spawning = null
        }
    }
}

class StructureExtension extends BaseStructure {
    constructor(room, x, y) { super(room, x, y, C.STRUCTURE_EXTENSION, 50) }
}
class StructureContainer extends BaseStructure {
    constructor(room, x, y) { super(room, x, y, C.STRUCTURE_CONTAINER, 2000); this.my = false }
}
class StructureTower extends BaseStructure {
    constructor(room, x, y) { super(room, x, y, C.STRUCTURE_TOWER, 1000) }
}
class StructureRoad {
    constructor(room, x, y) {
        this.id = nextId('road'); this.room = room; this.pos = new RoomPosition(x, y, room.name)
        this.structureType = C.STRUCTURE_ROAD; this.hits = 5000; this.hitsMax = 5000
    }
}
class StructureRampart extends BaseStructure {
    constructor(room, x, y) { super(room, x, y, C.STRUCTURE_RAMPART, null); this.hitsMax = 300000 }
}
class StructureStorage extends BaseStructure {
    constructor(room, x, y) { super(room, x, y, C.STRUCTURE_STORAGE, 1000000) }
}
class StructureLink extends BaseStructure {
    constructor(room, x, y) { super(room, x, y, C.STRUCTURE_LINK, 800); this.cooldown = 0 }
    transferEnergy() { return C.OK }
}

class ConstructionSite {
    constructor(room, x, y, type) {
        this.id = nextId('cs'); this.room = room; this.pos = new RoomPosition(x, y, room.name)
        this.structureType = type; this.my = true; this.progress = 0
        this.progressTotal = CONSTRUCTION_COST[type] || 1000
    }
}
const CONSTRUCTION_COST = {
    spawn: 15000, extension: 3000, road: 300, constructedWall: 1, rampart: 1,
    link: 5000, storage: 30000, tower: 5000, observer: 8000, powerSpawn: 100000,
    lab: 50000, terminal: 100000, container: 5000, nuker: 100000, factory: 100000,
}

class Creep {
    constructor(room, x, y, name, body, memory) {
        this.id = nextId('creep'); this.room = room; this.pos = new RoomPosition(x, y, room.name)
        this.name = name; this.body = body.map(t => ({ type: t, hits: 100 }))
        this.memory = memory; this.spawning = false; this.fatigue = 0
        this.ticksToLive = C.CREEP_LIFE_TIME
        const carry = this.body.filter(b => b.type === C.CARRY).length
        this.store = new Store(carry * C.CARRY_CAPACITY)
        this.my = true
        this._acted = null; this._moved = false; this._stepsThisLife = 0
    }
    getActiveBodyparts(type) { return this.body.filter(b => b.type === type && b.hits > 0).length }
    say() { return C.OK }

    moveTo(target, opts) { return this._step(target.pos || target) }
    move(dir) {
        const d = DIR_DELTA[dir]; if (!d) return C.ERR_INVALID_ARGS
        return this._moveToTile(this.pos.x + d[0], this.pos.y + d[1])
    }
    _step(targetPos) {
        if (this.pos.getRangeTo(targetPos) <= 1 && this.pos.isEqualTo(targetPos) === false) {
            // already adjacent; still counts as OK (no move needed)
            return C.OK
        }
        // choose neighbor minimizing chebyshev distance to target that is walkable+free
        let best = null, bestScore = Infinity
        for (const [dx, dy] of DIR_LIST) {
            const nx = this.pos.x + dx, ny = this.pos.y + dy
            if (!this.room._isWalkable(nx, ny, this)) continue
            const score = Math.max(Math.abs(nx - targetPos.x), Math.abs(ny - targetPos.y))
            if (score < bestScore) { bestScore = score; best = [nx, ny] }
        }
        if (!best) return C.ERR_NO_PATH
        const cur = Math.max(Math.abs(this.pos.x - targetPos.x), Math.abs(this.pos.y - targetPos.y))
        if (bestScore >= cur) return C.ERR_NO_PATH // no progress possible
        return this._moveToTile(best[0], best[1])
    }
    _moveToTile(nx, ny) {
        if (!this.room._isWalkable(nx, ny, this)) return C.ERR_NO_PATH
        this.pos.x = nx; this.pos.y = ny
        this._moved = true; this._stepsThisLife++
        return C.OK
    }

    harvest(source) {
        if (this.pos.getRangeTo(source) > 1) return C.ERR_NOT_IN_RANGE
        if (source.energy <= 0) return C.ERR_NOT_ENOUGH_RESOURCES
        const amount = Math.min(this.getActiveBodyparts(C.WORK) * C.HARVEST_POWER, source.energy, this.store.getFreeCapacity())
        if (amount <= 0) return this.store.getFreeCapacity() <= 0 ? C.ERR_FULL : C.ERR_NOT_ENOUGH_RESOURCES
        source.energy -= amount; this.store.energy += amount
        this._acted = 'harvest'; world.stats.energyHarvested += amount
        return C.OK
    }
    upgradeController(ctrl) {
        if (this.store.energy <= 0) return C.ERR_NOT_ENOUGH_RESOURCES
        if (this.pos.getRangeTo(ctrl) > 3) return C.ERR_NOT_IN_RANGE
        const amount = Math.min(this.getActiveBodyparts(C.WORK) * C.UPGRADE_CONTROLLER_POWER, this.store.energy)
        this.store.energy -= amount; ctrl.addProgress(amount)
        this._acted = 'upgrade'; world.stats.energyToController += amount
        return C.OK
    }
    build(site) {
        if (this.store.energy <= 0) return C.ERR_NOT_ENOUGH_RESOURCES
        if (this.pos.getRangeTo(site) > 3) return C.ERR_NOT_IN_RANGE
        const amount = Math.min(this.getActiveBodyparts(C.WORK) * C.BUILD_POWER, this.store.energy, site.progressTotal - site.progress)
        this.store.energy -= amount; site.progress += amount
        this._acted = 'build'; world.stats.energyToBuild += amount
        if (site.progress >= site.progressTotal) this.room._completeSite(site)
        return C.OK
    }
    repair(structure) {
        if (this.store.energy <= 0) return C.ERR_NOT_ENOUGH_RESOURCES
        if (this.pos.getRangeTo(structure) > 3) return C.ERR_NOT_IN_RANGE
        const amount = Math.min(this.getActiveBodyparts(C.WORK) * 1, this.store.energy)
        this.store.energy -= amount; structure.hits = Math.min(structure.hitsMax, structure.hits + amount * C.REPAIR_POWER)
        this._acted = 'repair'
        return C.OK
    }
    transfer(target, resource, amount) {
        if (this.pos.getRangeTo(target) > 1) return C.ERR_NOT_IN_RANGE
        if (this.store.energy <= 0) return C.ERR_NOT_ENOUGH_RESOURCES
        if (!target.store) return C.ERR_INVALID_TARGET
        const free = target.store.getFreeCapacity()
        if (free <= 0) return C.ERR_FULL
        const amt = Math.min(amount != null ? amount : this.store.energy, this.store.energy, free)
        this.store.energy -= amt; target.store.energy += amt
        this._acted = 'transfer'
        if (target.structureType === C.STRUCTURE_SPAWN || target.structureType === C.STRUCTURE_EXTENSION) world.stats.energyToSpawn += amt
        return C.OK
    }
    withdraw(target, resource, amount) {
        if (this.pos.getRangeTo(target) > 1) return C.ERR_NOT_IN_RANGE
        if (!target.store || target.store.energy <= 0) return C.ERR_NOT_ENOUGH_RESOURCES
        const amt = Math.min(amount != null ? amount : this.store.getFreeCapacity(), this.store.getFreeCapacity(), target.store.energy)
        if (amt <= 0) return C.ERR_FULL
        target.store.energy -= amt; this.store.energy += amt
        this._acted = 'withdraw'
        return C.OK
    }
    pickup(resource) {
        if (this.pos.getRangeTo(resource) > 1) return C.ERR_NOT_IN_RANGE
        const amt = Math.min(resource.amount, this.store.getFreeCapacity())
        if (amt <= 0) return C.ERR_FULL
        resource.amount -= amt; this.store.energy += amt
        this._acted = 'pickup'
        if (resource.amount <= 0) this.room._removeDropped(resource)
        return C.OK
    }
    attack() { this._acted = 'attack'; return C.OK }
    rangedAttack() { this._acted = 'attack'; return C.OK }
    heal() { return C.OK }
    reserveController() { return C.OK }
    claimController() { return C.OK }
    signController() { return C.OK }
    recycleCreep() { return C.OK }
}

const DIR_DELTA = { 1: [0, -1], 2: [1, -1], 3: [1, 0], 4: [1, 1], 5: [0, 1], 6: [-1, 1], 7: [-1, 0], 8: [-1, -1] }
const DIR_LIST = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]]

// ---------------------------------------------------------------------------
// Room
// ---------------------------------------------------------------------------
class Room {
    constructor(name, terrain) {
        this.name = name; this.memory = (Memory.rooms[name] ??= {})
        this._terrain = terrain // 50x50 array, 1 = wall
        this._sources = []; this._structures = []; this._sites = []; this._dropped = []
        this.controller = null
        this.visual = new RoomVisual()
    }
    get energyAvailable() {
        return this._structures.filter(s => s.structureType === C.STRUCTURE_SPAWN || s.structureType === C.STRUCTURE_EXTENSION)
            .reduce((a, s) => a + s.store.energy, 0)
    }
    get energyCapacityAvailable() {
        return this._structures.filter(s => s.structureType === C.STRUCTURE_SPAWN || s.structureType === C.STRUCTURE_EXTENSION)
            .reduce((a, s) => a + s.store.getCapacity(), 0)
    }
    get storage() { return this._structures.find(s => s.structureType === C.STRUCTURE_STORAGE) }
    _creepsHere() { return Object.values(world.creeps).filter(c => !c.spawning && c.room === this) }
    find(type, opts) {
        let res
        switch (type) {
            case C.FIND_SOURCES: case C.FIND_SOURCES_ACTIVE: res = this._sources; break
            case C.FIND_STRUCTURES: res = this._structures; break
            case C.FIND_MY_STRUCTURES: res = this._structures.filter(s => s.my); break
            case C.FIND_MY_SPAWNS: res = this._structures.filter(s => s.structureType === C.STRUCTURE_SPAWN); break
            case C.FIND_CONSTRUCTION_SITES: case C.FIND_MY_CONSTRUCTION_SITES: res = this._sites; break
            case C.FIND_DROPPED_RESOURCES: res = this._dropped; break
            case C.FIND_MY_CREEPS: case C.FIND_CREEPS: res = this._creepsHere(); break
            case C.FIND_HOSTILE_CREEPS: case C.FIND_HOSTILE_STRUCTURES:
            case C.FIND_HOSTILE_SPAWNS: case C.FIND_FLAGS: case C.FIND_TOMBSTONES:
            case C.FIND_NUKES: case C.FIND_MINERALS: res = []; break
            default: res = []
        }
        if (opts && typeof opts.filter === 'function') res = res.filter(opts.filter)
        else if (opts && typeof opts.filter === 'object') res = res.filter(o => Object.entries(opts.filter).every(([k, v]) => o[k] === v))
        return res
    }
    lookAt(x, y) {
        const out = [{ type: 'terrain', terrain: this._terrainAt(x, y) }]
        for (const s of this._structures) if (s.pos.x === x && s.pos.y === y) out.push({ type: 'structure', structure: s })
        for (const s of this._sites) if (s.pos.x === x && s.pos.y === y) out.push({ type: 'constructionSite', constructionSite: s })
        return out
    }
    lookAtArea(top, left, bottom, right) {
        const out = []
        for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
            if (x < 0 || y < 0 || x > 49 || y > 49) continue
            out.push({ x, y, type: 'terrain', terrain: this._terrainAt(x, y) })
        }
        return out
    }
    createConstructionSite(x, y, type) {
        const rcl = this.controller ? this.controller.level : 0
        const allowed = (CONTROLLER_STRUCTURES[type] || [])[rcl] || 0
        const existing = this._structures.filter(s => s.structureType === type).length + this._sites.filter(s => s.structureType === type).length
        if (allowed > 0 && existing >= allowed) return C.ERR_RCL_NOT_ENOUGH
        if (allowed === 0) return C.ERR_RCL_NOT_ENOUGH
        if (this._terrainAt(x, y) === 'wall') return C.ERR_INVALID_TARGET
        if (this._structures.some(s => s.pos.x === x && s.pos.y === y && s.structureType === type)) return C.ERR_INVALID_TARGET
        if (this._sites.some(s => s.pos.x === x && s.pos.y === y)) return C.ERR_INVALID_TARGET
        if (world.totalSites() >= 100) return C.ERR_FULL
        this._sites.push(new ConstructionSite(this, x, y, type))
        return C.OK
    }
    findExitTo() { return C.ERR_NO_PATH }
    getPositionAt(x, y) { return new RoomPosition(x, y, this.name) }

    _terrainAt(x, y) { return this._terrain[y * 50 + x] === 1 ? 'wall' : 'plain' }
    _isWalkable(x, y, mover) {
        if (x < 1 || y < 1 || x > 48 || y > 48) return false
        if (this._terrainAt(x, y) === 'wall') return false
        for (const s of this._sources) if (s.pos.x === x && s.pos.y === y) return false
        if (this.controller && this.controller.pos.x === x && this.controller.pos.y === y) return false
        for (const s of this._structures) if (s.pos.x === x && s.pos.y === y && BLOCKING_STRUCTURES.has(s.structureType)) return false
        for (const c of this._creepsHere()) if (c !== mover && c.pos.x === x && c.pos.y === y) return false
        return true
    }
    _firstFreeAround(x, y) {
        for (const [dx, dy] of DIR_LIST) if (this._isWalkable(x + dx, y + dy, null)) return { x: x + dx, y: y + dy }
        return null
    }
    _completeSite(site) {
        this._sites = this._sites.filter(s => s !== site)
        let s
        switch (site.structureType) {
            case C.STRUCTURE_EXTENSION: s = new StructureExtension(this, site.pos.x, site.pos.y); break
            case C.STRUCTURE_CONTAINER: s = new StructureContainer(this, site.pos.x, site.pos.y); break
            case C.STRUCTURE_TOWER: s = new StructureTower(this, site.pos.x, site.pos.y); break
            case C.STRUCTURE_ROAD: s = new StructureRoad(this, site.pos.x, site.pos.y); break
            case C.STRUCTURE_RAMPART: s = new StructureRampart(this, site.pos.x, site.pos.y); break
            default: return
        }
        this._structures.push(s)
        world.stats.structuresBuilt[site.structureType] = (world.stats.structuresBuilt[site.structureType] || 0) + 1
    }
    _removeDropped(r) { this._dropped = this._dropped.filter(d => d !== r) }
}

class RoomVisual {
    constructor() {}
    line() { return this } circle() { return this } rect() { return this }
    poly() { return this } text() { return this }
}

// ---------------------------------------------------------------------------
// PathFinder (simple BFS)
// ---------------------------------------------------------------------------
const PathFinder = {
    CostMatrix: class { set() {} get() { return 0 } clone() { return this } },
    search(origin, goal, opts) {
        const goals = Array.isArray(goal) ? goal : [goal]
        const room = world.rooms[origin.roomName]
        const targets = goals.map(g => ({ x: (g.pos || g).x, y: (g.pos || g).y, range: g.range || 0 }))
        const startKey = (p) => `${p.x},${p.y}`
        const atGoal = (x, y) => targets.some(t => Math.max(Math.abs(x - t.x), Math.abs(y - t.y)) <= t.range)
        if (atGoal(origin.x, origin.y)) return { path: [], ops: 0, cost: 0, incomplete: false }
        const visited = new Set([startKey(origin)])
        let frontier = [{ x: origin.x, y: origin.y, path: [] }]
        let ops = 0
        while (frontier.length && ops < 5000) {
            const next = []
            for (const node of frontier) {
                for (const [dx, dy] of DIR_LIST) {
                    ops++
                    const nx = node.x + dx, ny = node.y + dy
                    if (nx < 1 || ny < 1 || nx > 48 || ny > 48) continue
                    const key = `${nx},${ny}`
                    if (visited.has(key)) continue
                    if (room && room._terrainAt(nx, ny) === 'wall') continue
                    const path = node.path.concat([new RoomPosition(nx, ny, origin.roomName)])
                    if (atGoal(nx, ny)) return { path, ops, cost: path.length, incomplete: false }
                    visited.add(key)
                    next.push({ x: nx, y: ny, path })
                }
            }
            frontier = next
        }
        return { path: [], ops, cost: 0, incomplete: true }
    },
}

// ---------------------------------------------------------------------------
// Game / Memory / world
// ---------------------------------------------------------------------------
let Game, Memory

function installGlobals() {
    Object.assign(global, C)
    global.RoomPosition = RoomPosition
    global.Room = Room
    global.Source = Source
    global.Creep = Creep
    global.Structure = BaseStructure
    global.OwnedStructure = BaseStructure
    global.StructureSpawn = StructureSpawn
    global.StructureExtension = StructureExtension
    global.StructureContainer = StructureContainer
    global.StructureTower = StructureTower
    global.StructureStorage = StructureStorage
    global.StructureLink = StructureLink
    global.StructureController = StructureController
    global.StructureRoad = StructureRoad
    global.StructureRampart = StructureRampart
    global.ConstructionSite = ConstructionSite
    global.RoomVisual = RoomVisual
    global.PathFinder = PathFinder
    global.Tombstone = class Tombstone {}
    global.Resource = class Resource { constructor() { this.amount = 0; this.resourceType = C.RESOURCE_ENERGY } }
    Memory = global.Memory = { creeps: {}, rooms: {} }
    Game = global.Game = {
        time: 0,
        creeps: {},
        rooms: {},
        spawns: {},
        flags: {},
        cpu: { getUsed: () => 0, limit: 20, tickLimit: 500, bucket: 10000 },
        gcl: { level: 1, progress: 0, progressTotal: 1000000 },
        map: { getRoomLinearDistance: () => 1, describeExits: () => ({}) },
        getObjectById: (id) => world.byId[id] || null,
    }
}

function createWorld({ username = 'HivemindDev', roomName = 'sim', spawnPos = { x: 20, y: 26 },
    controllerPos = { x: 30, y: 20 }, sources = [{ x: 15, y: 15 }, { x: 25, y: 35 }] } = {}) {
    // terrain: border walls only, rest plain
    const terrain = new Array(50 * 50).fill(0)
    for (let i = 0; i < 50; i++) { terrain[i] = 1; terrain[49 * 50 + i] = 1; terrain[i * 50] = 1; terrain[i * 50 + 49] = 1 }

    world = {
        username, rooms: {}, creeps: {}, byId: {}, pendingSpawns: [],
        stats: {
            energyHarvested: 0, energyToController: 0, energyToSpawn: 0, energyToBuild: 0,
            structuresBuilt: {},
        },
        totalSites() { return Object.values(this.rooms).reduce((a, r) => a + r._sites.length, 0) },
    }

    const room = new Room(roomName, terrain)
    world.rooms[roomName] = room
    Game.rooms[roomName] = room

    for (const s of sources) { const src = new Source(room, s.x, s.y); room._sources.push(src); world.byId[src.id] = src }

    const ctrl = new StructureController(room, controllerPos.x, controllerPos.y); room.controller = ctrl; world.byId[ctrl.id] = ctrl

    const spawn = new StructureSpawn(room, spawnPos.x, spawnPos.y, 'Spawn1')
    spawn.store.energy = 300 // fresh room bonus so bootstrap can start
    room._structures.push(spawn); world.byId[spawn.id] = spawn; Game.spawns.Spawn1 = spawn

    return world
}

module.exports = {
    installGlobals, createWorld,
    getGame: () => Game, getMemory: () => Memory, getWorld: () => world, C,
    _classes: { Room, Creep, StructureSpawn },
}
