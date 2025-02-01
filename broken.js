'use strict'

typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message)
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e
}
const STRUCTURE_KEY = {
    A: STRUCTURE_SPAWN,
    N: STRUCTURE_NUKER,
    K: STRUCTURE_LINK,
    L: STRUCTURE_LAB,
    E: STRUCTURE_EXTENSION,
    S: STRUCTURE_STORAGE,
    T: STRUCTURE_TOWER,
    O: STRUCTURE_OBSERVER,
    M: STRUCTURE_TERMINAL,
    P: STRUCTURE_POWER_SPAWN,
    ".": STRUCTURE_ROAD,
    C: STRUCTURE_CONTAINER,
    R: STRUCTURE_RAMPART,
    W: STRUCTURE_WALL
}
const creepActions = {
    move: ({ creep, completed }, target) => {
        if (creep.pos.isEqualTo(target)) {
            return { success: ERR_INVALID_TARGET }
        }
        if (completed.has("move"))
            return { success: ERR_BUSY }
        const result = creep.manager.move(target, { range: 0 })
        return { success: result, persistent: true, actions: { move: result } }
    },
    harvest: ({ creep, completed }, target) => {
        if (target instanceof Source === false) {
            return { success: ERR_INVALID_TARGET }
        }
        if (completed.has("work"))
            return { success: ERR_BUSY }
        const result = creep.harvest(target)
        // how many work parts?
        const workParts = creep.body.filter(part => part.type === WORK).length
        const energyPerTick = workParts * HARVEST_POWER
        if (energyPerTick >= creep.store.getFreeCapacity(RESOURCE_ENERGY)) {
            return { success: OK, actions: { work: result } }
        }
        return { success: ERR_BUSY, actions: { work: result } }
    },
    transfer: ({ creep, completed }, target) => {
        if ('store' in target === false || target instanceof Tombstone) {
            return { success: ERR_INVALID_TARGET }
        }
        if (target instanceof Creep) {
            let targetMoving = false
            // is target creep moving to a target?
            if (target.manager.completed.has("move"))
                targetMoving = true
            else if (target.memory.travel && target.memory.travel.distance > 3)
                targetMoving = true
            if (targetMoving) {
                // inform creep we are on the way
                target.manager.addTask({
                    action: 'move',
                    id: creep.id
                }, true)
            }
        }
        creep.store
        target.store
        if (completed.has("transfer"))
            return { success: ERR_BUSY }
        const result = creep.transfer(target, RESOURCE_ENERGY)
        return { success: result, actions: { transfer: result } }
    },
    upgrade: ({ creep, completed }, target) => {
        if (target instanceof StructureController === false) {
            return { success: ERR_INVALID_TARGET }
        }
        if (completed.has("work"))
            return { success: ERR_BUSY, persistent: true }
        const result = creep.upgradeController(target)
        // how many work parts?
        const workParts = creep.body.filter(part => part.type === WORK).length
        const energyPerTick = workParts * HARVEST_POWER
        if (energyPerTick >= creep.store.getUsedCapacity(RESOURCE_ENERGY)) {
            return { success: OK, actions: { work: result } }
        }
        return { success: ERR_BUSY, actions: { work: result } }
    },
    build: ({ creep, completed }, target) => {
        if (target instanceof ConstructionSite === false) {
            return { success: ERR_INVALID_TARGET }
        }
        if (completed.has("work"))
            return { success: ERR_BUSY }
        const result = creep.build(target)
        // how many work parts?
        const workParts = creep.body.filter(part => part.type === WORK).length
        const energyPerTick = workParts * HARVEST_POWER
        if (energyPerTick >= creep.store.getUsedCapacity(RESOURCE_ENERGY)) {
            return { success: OK, actions: { work: result } }
        }
        return { success: ERR_BUSY, actions: { work: result } }
    },
    withdraw: ({ creep, completed }, target) => {
        if (!target || 'store' in target === false) {
            return { success: ERR_INVALID_TARGET }
        }
        if (target instanceof Creep) {
            if (target.manager.completed.has("transfer"))
                return { success: ERR_BUSY }
            const result = target.transfer(creep, RESOURCE_ENERGY)
            return { success: OK, actions: { transfer: result } }
        }
        if (completed.has("transfer"))
            return { success: ERR_BUSY }
        const result = creep.withdraw(target, RESOURCE_ENERGY)
        return { success: result, actions: { transfer: result } }
    },
    attack({ creep, completed }, target) {
        if (target instanceof Creep === false) {
            return { success: ERR_INVALID_TARGET }
        }
        if (completed.has("attack"))
            return { success: ERR_BUSY }
        const result = creep.attack(target)
        return { success: result, actions: { attack: result } }
    },
    renew({ creep, completed }, target) {
        if (target instanceof StructureSpawn === false) {
            return { success: ERR_INVALID_TARGET }
        }
        const result = target.renewCreep(creep)
        return { success: result }
    }
}

const CONFIG = {
    debug: 'basic', // enable/disable debugging
    visuals: {
        enabled: false, // enable/disable visuals
        show_matrix: false, // show pathfinding matrix
        creep_travel: false, // show creep paths
    },
    rooms: {
        default: {
            build: {
                enabled: true, // enable/disable auto building
                show_build: false, // show build orders
                show_build_levels: false, // show build levels
                build_frequency: 10, // ticks between build orders
                max_constructions: 3, // max number of construction sites to place
                auto_build_roads_level: 3.6, // build roads at this level
                auto_build_containers: 2.1, // build containers at this level
                build_orders: {
                    2: [
                        '     C   ',
                        '    A    ',
                        '         ',
                    ],
                    2.3: [
                        '  E .CEE ',
                        '   .A..  ',
                        '         ',
                    ],
                    2.4: [
                        '    .    ',
                        '  E .CEE ',
                        '   .A..  ',
                        '         ',
                        '         ',
                    ],
                    2.5: [
                        '   E.E   ',
                        '  E .CEE ',
                        '  ..A..  ',
                        '    .    ',
                        '         ',
                    ],
                    2.7: [
                        '   E.E   ',
                        '  E .CEE.',
                        ' ...A... ',
                        '    .    ',
                        '         ',
                    ],
                    3: [
                        '   E.ET  ',
                        '  E .CEE.',
                        ' ...A... ',
                        '    .    ',
                        '         ',
                    ],
                    3.15: [
                        '   E.ET  ',
                        ' EE .CEE.',
                        '  ..A... ',
                        '  E .  E ',
                        '         ',
                    ],
                    3.3: [
                        '   E.ET  ',
                        ' EE .CEE.',
                        '  ..A... ',
                        ' EE . EE ',
                        '         ',
                    ],
                    4: [
                        '  .. ..  ',
                        ' .EE.EE. ',
                        '.EEE.ETE.',
                        '.EE .CEE.',
                        ' ...A... ',
                        '.EEC. EE.',
                        '.EEE.EEE.',
                        ' .EE.EE. ',
                        '  .. ..  ',
                    ]
                }
            },
            spawnDelay: 15, // ticks to delay between spawns
            creeps: {
                // defender: {
                //     body: {
                //         parts: [TOUGH, MOVE, ATTACK, ATTACK, MOVE, MOVE],
                //         max: true
                //     },
                //     max: "enemies().length > 0 ? enemies().length : 0",
                //     conditions: [
                //     ],
                //     tasks: [
                //         // attack hostile
                //         {
                //             action: "attack",
                //             target: "closestHostile()",
                //             conditions: [],
                //             validates: [],
                //         },
                //     ]
                // },
                harvester: {
                    body: {
                        parts: [WORK, CARRY, MOVE, MOVE],
                        max: true
                    },
                    //  + (creeps().filter(c => usedCapacity(c) > 45).length * 2) - (creeps().filter(c => usedCapacity(c) < 20).length * 3)))
                    max: "sources().filter(notOverAssignedTo('harvest')).reduce((a,b) => a + walkablePositions(b), 0) + containers().filter(usedCapacity).length", // max number of creeps
                    conditions: [
                        // "mules.length > 0",
                        // "upgraders.length > 0"
                    ],
                    tasks: [
                        // harvest source
                        {
                            action: "harvest",
                            target: "closestSource()",
                            conditions: [],
                            validates: [
                                "target.energy > 0",
                            ],
                        },
                        // upgrade room controller
                        {
                            action: "upgrade",
                            target: "controller",
                            conditions: [],
                            validates: [],
                        },
                    ]
                },
                builder: {
                    body: {
                        parts: [WORK, CARRY, MOVE, MOVE],
                        max: true
                    },
                    max: "Math.ceil(constructionSites().length/2)",
                    conditions: [
                        "constructionSites().length > 0"
                    ],
                    tasks: [
                        // build construction site
                        {
                            action: "build",
                            target: "closestConstructionSite()",
                            conditions: [],
                            validates: [],
                        },
                        // upgrade room controller
                        {
                            action: "upgrade",
                            target: "controller",
                            conditions: [],
                            validates: [],
                        },
                        // harvest source
                        {
                            action: "harvest",
                            target: "closestSource()",
                            conditions: [],
                            validates: [
                                "target.energy > 0",
                            ],
                        },
                    ]
                },
                // mule: {
                //     body: {
                //         parts: [CARRY, CARRY, MOVE, MOVE],
                //         max: true
                //     },
                //     max: "containers().length >=2 ? 1 : 0",
                //     conditions: [
                //         "creepsByRole('harvester').length > 4",
                //     ],
                //     tasks: [
                //         // transfer to spawn
                //         {
                //             action: "transfer",
                //             target: "closestSpawn()",
                //             conditions: [],
                //             validates: [],
                //         },
                //     ]
                // },
            },
        }
    },
}

class BaseDebugger {
    constructor(debugPrefix = '') {
        this.debugPrefix = ''
        this.logs = []
        this.startCpu = 0
        this._logCpu = 0
        this.debugPrefix = `${this.constructor.name}[${debugPrefix}]`
        this.startCpu = Game.cpu.getUsed()
    }
    log(...args) {
        // Extract the level if the last argument is a valid level, default to 'basic'.
        let level = 'basic'
        if (typeof args[args.length - 1] === 'string' && ["basic", "log"].includes(args[args.length - 1])) {
            level = args.pop()
        }
        // Store the logs for later display.
        this.logs.push({ level, messages: args })
    }
    getCurrentCpu() {
        return Number((Game.cpu.getUsed() - this.startCpu).toFixed(2))
    }
    logCpu() {
        this._logCpu = Game.cpu.getUsed()
    }
    getLogCpu() {
        return Number((Game.cpu.getUsed() - this._logCpu).toFixed(2))
    }
    flushLogs() {
        if (!CONFIG.debug || this.logs.length === 0)
            return
        Game.cpu.getUsed() - this.startCpu
        let output = `<details>` +
            `<summary style='color:white;margin:0;'>[${Game.time}] <strong>${this.debugPrefix} </strong>:</summary>` +
            `<div style='display:flex;flex-direction:column;gap:8px;padding:4px 0;'>`
        output = this.buildLog(this.logs, "basic", output)
        output = this.buildLog(this.logs, "log", output)
        output += `</div></details>`
        // Output the entire log as a single HTML block.
        console.log(output)
        // Clear the logs after flushing.
        this.logs = []
    }
    buildLog(logs, display_level, output) {

        return output
    }
}

function cpuLog(target, key, descriptor) {
    const originalMethod = descriptor.value
    descriptor.value = function (...args) {
        // Serialize args for cache key (handle RoomPosition and primitives)
        const serializedArgs = args.map(arg => {
            if (arg instanceof RoomPosition) {
                return `${arg.x},${arg.y},${arg.roomName}`
            }
            if (arg instanceof PathFinder.CostMatrix) {
                return `costmatrix`
            }
            if (arg instanceof Room) {
                return arg.name
            }
            if (arg instanceof RoomObject) {
                return `${arg.pos.x},${arg.pos.y},${arg.pos.roomName}`
            }
            return JSON.stringify(arg)
        })
        const cacheKey = `${serializedArgs.join(":")}`
        const startCPU = Game.cpu.getUsed()
        const result = originalMethod.apply(this, args)
        const endCPU = Game.cpu.getUsed()
        this.log(`**${key}** #e7d800[used ${(endCPU - startCPU).toFixed(2)}] key:${cacheKey.slice(0, 75)}`, 'log')
        return result
    }
}
const CacheStorage = {}
Memory.cache = {}
function cache(name, ttl = 1, debug = false) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value || descriptor.get
        if (typeof originalMethod !== "function") {
            throw new Error(`@cache can only be used on methods or getter properties.`)
        }
        descriptor.value = function (...args) {
            const context = this // Assert `this` type
            const contextKey = typeof context.cache === "function" ? context.cache() : "global"
            // Serialize args for cache key (handle RoomPosition and primitives)
            const serializedArgs = args.map(arg => {
                if (arg instanceof RoomPosition) {
                    return `${arg.x},${arg.y},${arg.roomName}`
                }
                if (arg instanceof PathFinder.CostMatrix) {
                    return `costmatrix`
                }
                if (arg instanceof Room) {
                    return arg.name
                }
                if (arg instanceof RoomObject) {
                    return `${arg.pos.x},${arg.pos.y},${arg.pos.roomName}`
                }
                return JSON.stringify(arg)
            })
            const cacheKey = `${name}:${contextKey}:${serializedArgs.join(":")}`
            const cached = CacheStorage[cacheKey]
            // Check if the cached value is valid
            if (cached && cached.expires >= Game.time) {
                if (debug)
                    console.log(`Cache hit for ${cacheKey}, serialized: ${cached.serialized}`)
                // Automatically resolve game objects from cached IDs
                if (cached.serialized) {
                    return cached.value.map(id => Game.getObjectById(id)).filter(Boolean)
                }
                return cached.value
            }
            // Measure CPU before executing the method
            const startCpu = Game.cpu.getUsed()
            // Compute the result and determine if it needs serialization
            const result = originalMethod.apply(this, args)
            const serialize_data = Array.isArray(result) && result.every(obj => obj === null || obj === undefined ? undefined : obj.id)
            // Measure CPU after execution
            const endCpu = Game.cpu.getUsed()
            const cpuUsed = endCpu - startCpu
            // If the result is an array of game objects, cache their IDs
            const serializedResult = serialize_data
                ? result.map(obj => obj.id) // Cache only IDs
                : result
            CacheStorage[cacheKey] = {
                value: serializedResult,
                serialized: serialize_data,
                expires: Game.time + ttl - 1,
            }
            // Optional: Store in Memory for debugging
            Memory.cache = Memory.cache || {}
            Memory.cache[cacheKey] = {
                key: cacheKey,
                value: serialize_data ? undefined : result,
                ids: serialize_data ? serializedResult : undefined,
                serialized: serialize_data,
                expires: Game.time + ttl - 1,
                computedAt: Game.time,
                cpuUsed, // Store the CPU usage for this computation
            }
            if (debug) {
                console.log(`Cache miss for ${cacheKey}, storing new result.`)
            }
            return result
        }
    }
}

var ROOMTYPE;
(function (ROOMTYPE) {
    ROOMTYPE["SOURCEKEEPER"] = "SK"
    ROOMTYPE["CORE"] = "CORE"
    ROOMTYPE["CONTROLLER"] = "CTRL"
    ROOMTYPE["ALLEY"] = "ALLEY"
})(ROOMTYPE || (ROOMTYPE = {}))
class utils {
    static walkablePositions(target, dist = 1) {
        if (!target || !target.roomName || !Game.rooms[target.roomName])
            return 0
        // TODO: verify room is valid
        return Game.rooms[target.roomName]
            .lookAtArea(target.y - dist, target.x - dist, target.y + dist, target.x + dist, true)
            .filter(a => ["plain", "swamp"].includes(a.terrain || "wall") &&
                (target.y + dist === a.y ||
                    target.y - dist === a.y ||
                    target.x + dist === a.x ||
                    target.x - dist === a.x))
            .length
    }
    // Helper function: Check if a position is walkable
    static isWalkable(room, x, y) {
        return !room
            .lookAt(x, y)
            .some(({ type, terrain, constructionSite }) => type === "structure" || (type === "constructionSite" && constructionSite.structureType !== 'road') || (type === "terrain" && terrain === "wall"))
    }
    // const neighbors = utils.getNeighbors(x, y, 1)
    // neighbors.forEach(([dx, dy]) => {
    //     if (roads.some(({ x: nx, y: ny }) => nx === dx && ny === dy)) {
    //         room.visual.line(dx, dy, x, y, { color: "#666", opacity: 0.25, width: 0.45 })
    //     }
    // })
    // • • •
    // • x •
    // • • •
    static getNeighbors(x, y, distance = 1) {
        const neighbors = []
        for (let dx = -distance; dx <= distance; dx++) {
            for (let dy = -distance; dy <= distance; dy++) {
                // filter out of bounds
                if (x + dx < 0 || x + dx > 49 || y + dy < 0 || y + dy > 49)
                    continue
                if (dx === 0 && dy === 0)
                    continue // Skip the center point
                neighbors.push([x + dx, y + dy])
            }
        }
        return neighbors
    }
    //   •
    // • x •
    //   •
    static getOrthogonalNeighbors(x, y, distance = 1) {
        const neighbors = []
        for (let i = 1; i <= distance; i++) {
            neighbors.push([x + i, y], [x - i, y], [x, y + i], [x, y - i])
        }
        return neighbors
    }
    static getGridNeighbors(x, y, distance = 1) {
        const neighbors = []
        for (let dx = -distance; dx <= distance; dx++) {
            for (let dy = -distance; dy <= distance; dy++) {
                const nx = x + dx
                const ny = y + dy
                // Ensure coordinates are within the Screeps map boundaries
                if (nx >= 0 && nx <= 49 && ny >= 0 && ny <= 49) {
                    neighbors.push([nx, ny])
                }
            }
        }
        return neighbors
    }
    static getRangeTo(arg1, arg2, arg3, arg4) {
        if (arg1 instanceof RoomPosition && arg2 instanceof RoomPosition) {
            // Overload for RoomPosition arguments
            return Math.max(Math.abs(arg1.x - arg2.x), Math.abs(arg1.y - arg2.y))
        }
        else if (typeof arg1 === "number" &&
            typeof arg2 === "number" &&
            typeof arg3 === "number" &&
            typeof arg4 === "number") {
            // Overload for x1, y1, x2, y2 arguments
            return Math.max(Math.abs(arg1 - arg3), Math.abs(arg2 - arg4))
        }
        else {
            throw new Error("Invalid arguments passed to getRangeTo")
        }
    }
    static isNearTo(pos1, pos2) {
        return this.getRangeTo(pos1, pos2) <= 1
    }
    static inRangeTo(pos1, pos2, range) {
        return this.getRangeTo(pos1, pos2) <= range
    }
    static findOptimalPosition(room, position, range = 1) {
        const adjacentPositions = []
        // Get all adjacent positions within range
        this.getNeighbors(position.x, position.y, range).forEach(([x, y]) => {
            if (room.lookAt(x, y).some(({ type, terrain }) => type === "structure" ||
                type === "constructionSite" ||
                (type === "terrain" && terrain === "wall")))
                return
            adjacentPositions.push(new RoomPosition(x, y, room.name))
        })
        // Evaluate each position for visibility to all walkable tiles around the source
        const optimalPosition = adjacentPositions
            .map((pos) => ({
                pos,
                visibleTiles: this.getNeighbors(pos.x, pos.y, 1).filter(([nx, ny]) => this.isWalkable(room, nx, ny) &&
                    this.isNearTo(position, new RoomPosition(nx, ny, pos.roomName))).length,
            }))
            // Sort by number of visible tiles and fall back to distance from source if needed
            .sort((a, b) => b.visibleTiles - a.visibleTiles || this.getRangeTo(position, a.pos) - this.getRangeTo(position, b.pos))
            .shift() // Take the position with the most visible tiles
        return optimalPosition === null || optimalPosition === undefined ? undefined : optimalPosition.pos // Return the optimal position or undefined if none found
    }
    static positionToObject(pos) {
        return { x: pos.x, y: pos.y, roomName: pos.roomName }
    }
    static objectToPosition(obj) {
        return new RoomPosition(obj.x, obj.y, obj.roomName)
    }
    static pathToDirections(path) {
        const directions = []
        for (let i = 0; i < path.length - 1; i++) {
            const currentPos = path[i]
            const nextPos = path[i + 1]
            const direction = currentPos.getDirectionTo(nextPos)
            directions.push(direction)
        }
        return directions
    }
    static directionsToPath(startPos, directions) {
        const path = [startPos] // Start with the initial position
        let currentPos = startPos
        for (const direction of directions) {
            if (currentPos.x <= 0 || currentPos.x >= 49 || currentPos.y <= 0 || currentPos.y >= 49) {
                break
            }
            const nextPos = this.getNextPosition(currentPos, direction)
            path.push(nextPos)
            currentPos = nextPos
        }
        return path
    }
    static getNextPosition(pos, direction) {
        const directionOffsets = {
            [TOP]: [0, -1],
            [TOP_RIGHT]: [1, -1],
            [RIGHT]: [1, 0],
            [BOTTOM_RIGHT]: [1, 1],
            [BOTTOM]: [0, 1],
            [BOTTOM_LEFT]: [-1, 1],
            [LEFT]: [-1, 0],
            [TOP_LEFT]: [-1, -1]
        }
        const [dx, dy] = directionOffsets[direction]
        return new RoomPosition(pos.x + dx, pos.y + dy, pos.roomName)
    }
    static reverseDirection(direction) {
        return ((direction + 4 - 1) % 8) + 1
    }
    static getRandomAdjacentDirection(direction) {
        // Array of relative offsets for adjacent directions
        const adjacentOffsets = [-1, 0, 1]
        // Randomly pick an offset
        const randomOffset = adjacentOffsets[Math.floor(Math.random() * adjacentOffsets.length)]
        // Calculate the new direction
        const newDirection = ((direction + randomOffset - 1 + 8) % 8) + 1
        return newDirection
    }
    ;
    static randomDirection() {
        // directions to use when searching for room exists
        const directions = [FIND_EXIT_TOP, FIND_EXIT_RIGHT, FIND_EXIT_BOTTOM, FIND_EXIT_LEFT]
        const values = Object.values(directions)
        return values[Math.floor(values.length * Math.random())]
    }
}

// memoize walkable positions
const _walkablePositions = {}
class BaseContext extends BaseDebugger {
    constructor(room, prefix) {
        var _a
        super(prefix)
        this.room = room
        this.config = (_a = CONFIG === null || CONFIG === undefined ? undefined : CONFIG.rooms[room.name]) !== null && _a !== undefined ? _a : CONFIG.rooms.default
        this.memoizationCache = {} // Cache storage
        // Base context definitions
        const baseContext = {
            // Base constants
            RESOURCE_ENERGY: RESOURCE_ENERGY,
            controller: room.controller,
            controllerLevel: room.controller ? (room.controller.level + room.controller.progress / room.controller.progressTotal) : 0,
            energyAvailable: room.energyAvailable,
            energyCapacityAvailable: room.energyCapacityAvailable,
            room: room,
            roomName: room.name,
            // Find functions
            activeSources: () => this.getContext('sources').filter(s => s.energy > 0),
            constructionSites: () => room.find(FIND_MY_CONSTRUCTION_SITES),
            containers: () => this.getContext('structures').filter(this.filterByStructureType([STRUCTURE_CONTAINER])),
            creeps: () => room.find(FIND_MY_CREEPS),
            droppedResources: () => room.find(FIND_DROPPED_RESOURCES),
            enemies: () => room.find(FIND_HOSTILE_CREEPS),
            sources: () => room.find(FIND_SOURCES),
            spawns: () => room.find(FIND_MY_SPAWNS),
            structures: () => room.find(FIND_STRUCTURES),
            tombstones: () => room.find(FIND_TOMBSTONES),
            towers: () => this.getContext('structures').filter(this.filterByStructureType([STRUCTURE_TOWER])),
            // Helper functions
            assignedCreeps: this.assignedCreeps.bind(this),
            creepsByRole: this.creepsByRole.bind(this),
            // findRandomRoomToExit: this.findRandomRoomToExit.bind(this),
            freeCapacity: this.getFreeCapacity.bind(this),
            notOverAssignedTo: this.isNotOverAssignedTo.bind(this),
            usedCapacity: this.getUsedCapacity.bind(this),
            walkablePositions: this.walkablePositions.bind(this),
        }
        // Use Proxy for lazy evaluation of context properties
        this.proxy = new Proxy(baseContext, {
            get: (target, prop) => (prop in target ? target[prop] : undefined),
            set: (target, prop, value) => {
                target[prop] = value
                return true
            },
        })
    }
    contextKeys() {
        return Object.keys(this.proxy)
    }
    contextValues() {
        return Object.values(this.proxy)
    }
    setContext(key, value) {
        this.proxy[key] = value
    }
    getContext(key, cache) {
        const cacheKey = key
        this.logCpu()
        if (["enemies", "structures", "sources", "spawns", "constructionSites", "containers", "towers", "droppedResources"].includes(String(key)))
            cache = true
        if (cache && cacheKey in this.memoizationCache) {
            this.log(`#8cc16e[**getContext**] ${String(key)} cpu used: ${this.getLogCpu()}`)
            return this.memoizationCache[cacheKey]
        }
        const value = this.proxy[cacheKey]
        const result = typeof value === 'function' ? value() : value
        this.log(`#e1554e[**getContext**] ${String(key)} cpu used: ${this.getLogCpu()}`)
        if (cache) {
            this.memoizationCache[cacheKey] = result
        }
        return result
    }
    evaluateExpression(expression) {
        console.log('expression!')
        return new Function(...this.contextKeys(), `return ${expression};`).bind(this)(...this.contextValues())
    }
    getFreeCapacity(target) {
        if (!target)
            return 0
        if ('store' in target) {
            return Math.max(target.store.getFreeCapacity(), target.store.getFreeCapacity(RESOURCE_ENERGY), 0)
        }
        if ('energy' in target && 'energyCapacity' in target) {
            return target.energyCapacity - target.energy
        }
        return 0
    }
    getUsedCapacity(target) {
        if (!target)
            return 0
        if ('store' in target) {
            return Math.max(target.store.getUsedCapacity(RESOURCE_ENERGY), target.store.getUsedCapacity(), 0)
        }
        if ('energy' in target) {
            return target.energy
        }
        return 0
    }
    isNotOverAssignedTo(action) {
        return (target) => {
            if (!target)
                return false
            // // console.log("\n------------", `isNotOverAssignedTo ${action} target:`, target)
            // const freeCapacity = this.getFreeCapacity(target)
            // // console.log('freeCapacity:', freeCapacity)
            // const usedCapacity = this.getUsedCapacity(target)
            // // console.log('usedCapacity:', usedCapacity)
            // if (action === 'transfer' && freeCapacity === 0) {
            //     return false
            // }
            // else if (action === 'withdraw' && usedCapacity === 0) {
            //     return false
            // }
            // const assignedCreeps = this.assignedCreeps(target, action)
            // // console.log('assignedCreeps:', assignedCreeps)
            // if (assignedCreeps.length === 0)
            //     return true
            // // limit number of creeps assigned to a target during transfer
            // if (action === 'transfer' && assignedCreeps.length > 3)
            //     return false
            // // limit number of creeps assigned to a target during renew
            // if (action === 'renew' && assignedCreeps.length > 1)
            //     return false
            // if (action === 'harvest' || target instanceof Source) {
            //     const walkablePositions = this.walkablePositions(target)
            //     // console.log('walkablePositions:', walkablePositions)
            //     if (walkablePositions === 0)
            //         return false
            //     // no positions left
            //     if (walkablePositions <= assignedCreeps.length)
            //         return false
            // }
            // // if target is spawn, will it be full before creep can get to it
            // if (action === 'transfer' && target instanceof StructureSpawn) {
            //     const creep = this.getContext('creep')
            //     if (creep) {
            //         const distance = creep.pos.getRangeTo(target)
            //         const freeCapacity = target.store.getFreeCapacity() || 0
            //         // spawn regens 1 energy per tick
            //         if (distance > freeCapacity)
            //             return false
            //     }
            // }
            if (action === 'transfer') {
                const assignedCreepsUsedCapacity = assignedCreeps.reduce((total, c) => total + this.getUsedCapacity(c), 0)
                return freeCapacity > assignedCreepsUsedCapacity
            }
            else if (action === 'withdraw') {
                const assignedCreepsFreeCapacity = assignedCreeps.reduce((total, c) => total + this.getFreeCapacity(c), 0)
                return usedCapacity > assignedCreepsFreeCapacity
            }
            return true
        }
    }
    assignedCreeps(target, action = undefined) {
        if (!target)
            return []
        const creepContext = this.getContext('creep')
        const creeps = this.getContext('creeps', true)
        // console.log(`assignedCreeps: target: ${target} action: ${action} creepContext: ${creepContext} creeps: ${creeps}`)
        const ROLE_PRIORITY = {
            mule: 1,
            builder: 2,
            harvester: 3,
        }
        return creeps
            .filter((creep) => {
                if (!creepContext)
                    return true
                return ROLE_PRIORITY[creep.memory.role] >= ROLE_PRIORITY[creepContext.memory.role]
            })
            .filter((creep) => creep.memory.tasks &&
                creep.memory.tasks.some((task) => 'id' in task && task.id === target.id && (!action || task.action === action)) &&
                (!creepContext || creep.id !== creepContext.id && creep.pos.getRangeTo(target) <= creepContext.pos.getRangeTo(target)))
    }
    walkablePositions(target) {
        if (!target)
            return 0
        if (target.id in _walkablePositions) {
            return _walkablePositions[target.id]
        }
        const positions = utils.walkablePositions(target.pos)
        _walkablePositions[target.id] = positions
        return positions
    }
    creepsByRole(role) {
        return this.getContext('creeps', true).filter((creep) => creep.memory.role === role)
    }
    // sort by shortcuts
    sortByFreeCapacity(a, b) {
        return this.getFreeCapacity(a) - this.getFreeCapacity(b)
    }
    sortByUsedCapacity(a, b) {
        return this.getUsedCapacity(a) - this.getUsedCapacity(b)
    }
    sortByRange(a, b) {
        return a.pos.getRangeTo(a) - b.pos.getRangeTo(b)
    }
    sortByCreepRange(a, b) {
        return a.pos.getRangeTo(this.getContext('creep')) - b.pos.getRangeTo(this.getContext('creep'))
    }
    // filter by free capacity
    filterByHasFreeCapacity(target) {
        return this.getFreeCapacity(target) > 0
    }
    // filter by used capacity
    filterByHasUsedCapacity(target) {
        return this.getUsedCapacity(target) > 0
    }
    // filter by structure type
    filterByStructureType(types) {
        return (structure) => types.includes(structure.structureType)
    }
    // filter by near something
    filterByNear(targets, range = 1) {
        return (structure) => targets.some(target => structure.pos.inRangeTo(target.pos, range))
    }
}

class BaseClass extends BaseContext {
    constructor(room, prefix = undefined) {
        // enable debugging for this class
        super(room, prefix ? prefix : room.name)
        this.log(`**${this.constructor.name} initialized.**`)
    }
}

// Enhanced Traveler module
class CreepMovement extends BaseClass {
    constructor(creep) {
        super(creep.room, creep.name)
        this.creep = creep
    }
    circle(stroke, opacity = 0.5) {
        if (!CONFIG.visuals.enabled || !CONFIG.visuals.creep_travel)
            return
        this.creep.room.visual.circle(this.creep.pos, { fill: 'transparent', radius: 0.50, stroke, opacity })
    }
    move(target, options = {}) {
        var _a
        var _b
        this.logCpu()
        this.creep.manager.log(`**traveler:** attempting to move to target ${target}`)
        const targetPos = target instanceof RoomPosition ? target : target.pos
        // make sure creep isnt tired
        if (this.creep.fatigue > 0) {
            this.creep.manager.log(`**traveler:** creep is tired`)
            return ERR_TIRED
        }
        // default options
        const { range = 1, ignoreCreeps = false, stuckThreshold = 4, ...defaultOptions } = options
        // if creep is super stuck, reset travel data and tasks
        if (this.creep.memory.travel && this.creep.memory.travel.stuck > (stuckThreshold * 2)) {
            this.creep.manager.log(`**traveler:** creep is super stuck, resetting travel data and tasks`)
            delete this.creep.memory.travel
            delete this.creep.memory.tasks
        }
        // make sure travel memory is set
        (_a = (_b = this.creep.memory).travel) !== null && _a !== undefined ? _a : (_b.travel = {
            stuck: 0,
            target: target instanceof Creep ? { id: target.id } : utils.positionToObject(target),
            lastPos: new RoomPosition(0, 0, this.creep.room.name),
            destination: utils.positionToObject(targetPos),
            distance: 0,
            range,
            path: ''
        })
        // check if the target moved
        if (target instanceof Creep && !utils.objectToPosition(this.creep.memory.travel.destination).isNearTo(targetPos)) {
            this.creep.manager.log('**traveler:** target has changed positions. repathing.:')
            this.creep.memory.travel.path = ''
        }
        this.creep.manager.log('**traveler:** creep.memory.travel:', this.creep.memory.travel)
        // creep hasnt moved since last tick, must be stuck
        if (this.creep.pos.isEqualTo(utils.objectToPosition(this.creep.memory.travel.lastPos))) {
            // increase stuck
            this.creep.memory.travel.stuck += 1
            // reset path if stuck
            if (this.creep.memory.travel.stuck > stuckThreshold) {
                this.creep.memory.travel.path = ''
                this.circle('red', (this.creep.memory.travel.stuck / 6))
            }
            this.creep.manager.log(`**traveler:** stuck increased: ${this.creep.memory.travel.stuck}`)
        }
        // creep has moved, must not be stuck
        else {
            // no longer stuck
            this.creep.memory.travel.stuck = 0
            // remove first pathing step
            this.creep.memory.travel.path = this.creep.memory.travel.path.substring(1)
            // update lastPos
            this.creep.memory.travel.lastPos = utils.positionToObject(this.creep.pos)
            // update distance
            this.creep.memory.travel.distance = this.creep.pos.getRangeTo(utils.objectToPosition(this.creep.memory.travel.destination))
        }
        // check last position of path to make sure its not blocked
        if (this.creep.memory.travel.path.length < 4) {
            // check for a creep with no travel data that is parked at the destination
            if (Object.values(Game.creeps).some(c => c.my && !c.memory.travel && c.pos.isEqualTo(utils.objectToPosition(this.creep.memory.travel.destination)))) {
                this.creep.memory.travel.path = ''
                this.creep.manager.log(`**traveler:** reset path due to parked creep`)
            }
        }
        // build a path if none exists
        if (!this.creep.memory.travel.path.length) {
            // blue circle around creep
            this.circle('blue')
            // find path
            const pathFinder = PathFinder.search(this.creep.pos, { pos: targetPos, range }, {
                maxRooms: 2,
                maxOps: 2000,
                roomCallback: (roomName) => this.creep.room.manager.getMatrix(this.creep, options),
            })
            // path not found
            if (pathFinder.incomplete && targetPos.roomName === this.creep.room.name) {
                this.creep.memory.travel.stuck += 1
                this.creep.manager.log(`**traveler:** failed to find path to target: ${target}`, pathFinder)
                return ERR_NO_PATH
            }
            pathFinder.path.unshift(this.creep.pos) // add creep pos to path
            // convert path to directions
            const path = utils.pathToDirections(pathFinder.path).join('')
            this.creep.manager.log(`**traveler:** new path: ${path} from ${this.creep.pos}: to target: ${target}`, { pos: targetPos, range, pathFinder })
            // set new path
            this.creep.memory.travel.path = path
            // set new destination
            this.creep.memory.travel.destination = utils.positionToObject(pathFinder.path[pathFinder.path.length - 1])
        }
        // draw creep travel path
        if (CONFIG.visuals.enabled && CONFIG.visuals.creep_travel) {
            const pathToRoomPositions = utils.directionsToPath(this.creep.pos, this.creep.memory.travel.path.split('').map(dir => Number(dir)))
            this.creep.room.visual.poly(pathToRoomPositions, { stroke: '#fff', lineStyle: 'dashed', opacity: 0.2 })
        }
        // get next direction
        const nextDirection = Number(this.creep.memory.travel.path.substring(0, 1))
        // move to target
        const result = this.creep.move(nextDirection)
        this.creep.manager.log(`**traveler:** move result: ${result} to target: ${target} cpu: ${this.getLogCpu()}`)
        return result
    }
}

// // extend Creep prototype
if (!Creep.prototype._manager) {
    Object.defineProperty(Creep.prototype, 'manager', {
        get: function () {
            if (!this._manager) {
                this._manager = new CreepManager(this)
            }
            return this._manager
        },
    })
}
class CreepManager extends CreepMovement {
    constructor(creep) {
        var _a, _b, _c
        var _d
        // debugger
        super(creep)
        this.completed = new Set()
        this.assignedTasks = ((_b = (_a = this.config) === null || _a === undefined ? undefined : _a.creeps[creep.memory.role]) === null || _b === undefined ? undefined : _b.tasks) || [];
        // make sure tasks is set
        (_c = (_d = this.creep.memory).tasks) !== null && _c !== undefined ? _c : (_d.tasks = [])
        this.log(`**CreepManager.constructor:** ${creep.name} loaded data:`, {
            tasks_assigned: this.assignedTasks.length,
            tasks_in_memory: [...this.creep.memory.tasks],
        })
        if (creep.ticksToLive && creep.ticksToLive < 100) {
            creep.manager.addTask({
                action: 'renew',
                id: this.creep.room.manager.spawn.id,
            })
        }
    }
    setupContext() {
        // set some extra context
        this.setContext('creep', this.creep)
        this.setContext('closestSpawn', () => this.creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
            filter: (s) => (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        }))
        this.setContext('closestSource', () => this.creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE, {
            filter: this.isNotOverAssignedTo('harvest').bind(this),
        }))
        this.setContext('closestByPath', (type) => this.creep.pos.findClosestByPath(type))
        this.setContext('closestByRange', (type) => this.creep.pos.findClosestByRange(type))
        this.setContext('closestConstructionSite', () => this.getContext('constructionSites', true)
            // sort by most done first
            .sort((a, b) => b.progress - a.progress)
        // first one
        [0])
        this.setContext('closestHostile', (type) => this.creep.pos.findClosestByPath(this.getContext('enemies', true)))
    }
    run() {
        // clear out empty travels
        if (this.creep.memory.travel) {
            const { destination, lastPos } = this.creep.memory.travel
            const targetPos = new RoomPosition(destination.x, destination.y, destination.roomName)
            if (this.creep.pos.isEqualTo(targetPos)) {
                this.log(`**traveler:** at target position. clearing data:`, this.creep.memory.travel)
                delete this.creep.memory.travel
            }
        }
        this.executeTasks()
    }
    creepPassesChecks(action) {
        // creep pre-checks
        if (['transfer', 'build', 'repair', 'upgrade'].includes(action) && this.getUsedCapacity(this.creep) === 0) {
            this.log(`**performAction:** pre-check creep for **${action}**. no storage capacity. cleared task.`)
            return false
        }
        else if (['withdraw', 'harvest'].includes(action) && this.getFreeCapacity(this.creep) === 0) {
            this.log(`**performAction:** pre-check creep for **${action}**. no free capacity (${this.getFreeCapacity(this.creep)}). cleared task.`)
            return false
        }
        else if (['renew'].includes(action) && this.creep.ticksToLive && this.creep.ticksToLive > 1450) {
            return false
        }
        else if (['heal'].includes(action) && this.creep.hits === this.creep.hitsMax) {
            return false
        }
        return true
    }
    targetPassesChecks(action, target) {
        if (target instanceof RoomPosition)
            return true
        // target pre-checks
        if (['transfer'].includes(action) && this.getFreeCapacity(target) === 0) {
            this.log(`**performAction:** pre-check target ${action}. no free capacity. cleared task.`)
            return false
        }
        else if (['withdraw', 'harvest', 'renew'].includes(action) && this.getUsedCapacity(target) === 0) {
            this.log(`**performAction:** pre-check target ${action}. no used capacity. cleared task.`)
            return false
        }
        else if (['renew'].includes(action) && target instanceof StructureSpawn && target.spawning) {
            return false
        }
        if (action === 'transfer' && target instanceof StructureSpawn) {
            const creep = this.getContext('creep')
            if (creep) {
                const distance = creep.pos.getRangeTo(target)
                const freeCapacity = target.store.getFreeCapacity() || 0
                if (distance > freeCapacity)
                    return false
            }
        }
        return true
    }
    // convert memory task to object
    unserializeTask(memoryTask) {
        if ('pos' in memoryTask) {
            const { pos } = memoryTask
            return { ...memoryTask, pos: new RoomPosition(pos.x, pos.y, pos.roomName) }
        }
        if ('id' in memoryTask) {
            const { id } = memoryTask
            const object = Game.getObjectById(id)
            return object ? { ...memoryTask, id, object } : undefined
        }
        return
    }
    // add task to creep memory
    addTask(task, priorty = false) {
        var _a
        var _b
        task.completed = undefined
        task.persistent = undefined;
        (_a = (_b = this.creep.memory).tasks) !== null && _a !== undefined ? _a : (_b.tasks = [])
        if (this.creep.memory.tasks.some(t => JSON.stringify(t) === JSON.stringify(task))) {
            this.log(`**addTask:** task already exists:`, task)
            return
        }
        this.log(`**addTask:** add new task:`, { ...task })
        if (priorty) {
            this.creep.memory.tasks.unshift(task)
        }
        else {
            this.creep.memory.tasks.push(task)
        }
    }
    hasTask(action) {
        var _a
        var _b;
        (_a = (_b = this.creep.memory).tasks) !== null && _a !== undefined ? _a : (_b.tasks = [])
        return this.creep.memory.tasks.some(task => task.action === action)
    }
    processTasks() {
        // make sure context is setup
        this.setupContext()
        // Iterate through the configuration to find a matching condition
        for (const assignedTask of this.assignedTasks) {
            this.log(`**processTasks:** assignedTask check:`, assignedTask)
            const { action } = assignedTask
            // creep pre-checks
            if (!this.creepPassesChecks(action))
                continue
            // Resolve the target dynamically
            const target = this.evaluateExpression(assignedTask.target)
            if (!target || typeof target === 'function') {
                this.log(`**processTasks:** #FFA2A2[**target not found:**]`, { target: assignedTask.target, resolved: target })
                continue
            }
            // target pre-checks
            if (!this.targetPassesChecks(action, target))
                continue
            // save target
            this.setContext('target', target)
            this.setContext('creep', this.creep)
            // check conditions
            if (assignedTask.conditions) {
                if (!assignedTask.conditions.every((cond) => this.evaluateExpression(cond))) {
                    this.log(`**processTasks:** #FFA2A2[**condition failed:**] conditions:`, assignedTask.conditions)
                    continue
                }
                this.log(`**processTasks:** #BCFFA2[**condition passed:**] conditions:`, assignedTask.conditions)
            }
            // check validates of the task
            if (assignedTask.validates && !assignedTask.validates.every((cond) => this.evaluateExpression(cond))) {
                this.log(`**processTasks:** #FFA2A2[**validate failed:**] validates:`, assignedTask.validates)
                continue
            }
            // Add the task
            if ('id' in target) {
                this.addTask({
                    id: target.id,
                    action,
                })
            }
            else if (target instanceof RoomPosition) {
                this.addTask({
                    pos: target,
                    action,
                })
            }
            break // Stop processing after assigning a task
        }
    }
    // execute all tasks in memory
    executeTasks() {
        var _a, _b, _c
        var _d, _e;
        (_a = (_d = this.creep.memory).tasks) !== null && _a !== undefined ? _a : (_d.tasks = [])
        // if not tasks found, find some
        if (this.creep.memory.tasks.length === 0) {
            this.log(`**CreepManager.executeTasks:** no tasks found. processing tasks.`)
            this.processTasks()
        }
        // make sure context is setup
        this.setupContext()
        this.log(`**executeTasks:** all tasks assigned to memory:`, [...this.creep.memory.tasks])
        // task result types:
        // completed: ran during this tick
        // blocking: task is blocking and other tasks should not follow
        // persistent: task will not be removed from memory until completed
        // loop through all tasks
        while (this.creep.memory.tasks.length > 0) {
            // find a task that is not completed
            const task = this.creep.memory.tasks.find(task => !task.completed)
            if (!task) {
                this.log('**executeTasks:** Tasks loop completed.')
                break
            }
            // mark as run this tick
            task.completed = true
            this.log(`**executeTasks:** perform task '${task.action}'. details:`, { ...task })
            const unserialized = this.unserializeTask(task)
            if (!unserialized) {
                this.log(`**executeTasks:** "unserialized" is invalid for task.`)
                this.creep.memory.tasks.shift()
                continue
            }
            const { action, ...rest } = unserialized
            const target = 'pos' in rest ? rest.pos : rest.object
            if (!target) {
                this.log(`**executeTasks:** "target" invalid for task **${action}**`)
                this.creep.memory.tasks.shift()
                continue
            }
            this.log(`**executeTasks:** target: ${target}`)
            // creep and target pre-checks
            if (!this.creepPassesChecks(action) || !this.targetPassesChecks(action, target)) {
                this.creep.memory.tasks.shift()
                continue
            }
            // creep is fatigued and cannot perform actions
            if (this.creep.fatigue > 0 && ["harvest", "upgrade", "build", "repair"].includes(action)) {
                continue
            }
            // make sure context is setup
            this.setupContext()
            this.setContext('target', target)
            this.setContext('creep', this.creep)
            const taskConfig = this.assignedTasks.find(entry => entry.action === action)
            if (taskConfig && ((_b = taskConfig === null || taskConfig === undefined ? undefined : taskConfig.validates) === null || _b === undefined ? undefined : _b.length)) {
                this.log(`**executeTasks** task revalidation for **${action}**:`, taskConfig)
                const conditionsMet = taskConfig.validates.every((cond) => this.evaluateExpression(cond))
                if (conditionsMet) {
                    this.log(`**executeTasks:** #BCFFA2[**validation passed.**]`)
                }
                else {
                    this.log(`**executeTasks:** #FFA2A2[**task validation failed.**]`)
                    this.creep.memory.tasks.shift()
                    continue
                }
            }
            if (action !== 'move') {
                const range = (target instanceof StructureController || target instanceof ConstructionSite) ? 3 : 1
                if (range < this.creep.pos.getRangeTo(target)) {
                    const moveResult = this.creep.manager.move(target, { range })
                    this.log(`**executeTasks:** not within range for **${action}**. move result: ${moveResult}`)
                    if (moveResult === OK) {
                        this.log('**executeTasks:** completed: move')
                        this.completed.add("move")
                    }
                    task.persistent = true // persist the task for another tick
                    if (task.blocking) {
                        break
                    }
                    else {
                        continue
                    }
                }
            }
            // run the action to get the result
            const result = creepActions[action] && creepActions[action](this, target)
            this.log(`**executeTasks:** action **${action}** result:`, result)
            // loop through actions to make as completed if result is OK
            Object.keys(result.actions || {}).forEach(action => {
                if (result.actions[action] === OK) {
                    this.log(`**executeTasks** completed action: ${action}`)
                    this.completed.add(action)
                }
            })
            // remove the task from the list if it was successful and not permanent
            if ([OK, ERR_NOT_OWNER, ERR_NOT_FOUND, ERR_NOT_ENOUGH_RESOURCES, ERR_INVALID_TARGET].includes(result.success) && !result.persistent) {
                this.log(`**executeTasks:** removing task ${action}.`)
                this.creep.memory.tasks.shift() // removes task from memory
                continue
            }
            // dont run anymore tasks after a blocking task
            if (task.blocking) {
                this.log(`**executeTasks:** task is blocking. not processing anymore tasks.`)
                break
            }
        }
        this.log(`**executeTasks:** completed actions. Memory:`, [...this.creep.memory.tasks])
        // update creep memory
        this.creep.memory.tasks = this.creep.memory.tasks
            //.filter(task => !task.completed && !task.persistent) // tasks to keep around for next time
            .map(task => {
                task.completed = undefined
                task.persistent = undefined
                return task
            })
        this.log('**executeTasks** completed:', {
            completed_actions: Array.from(this.completed),
            updated_memory_tasks: [...this.creep.memory.tasks],
        });
        (_c = (_e = this.creep.memory).idle) !== null && _c !== undefined ? _c : (_e.idle = 0)
        if (this.creep.memory.tasks.length === 0) {
            // reset travel if no tasks are left
            this.creep.memory.travel = undefined
            // increase idle timer
            this.creep.memory.idle++
        }
        else {
            this.creep.memory.idle = 0
        }
        // only continue if CPU is tammed
        if (this.creep.room.manager.getCurrentCpu() > 10) {
            this.log(`**executeTasks:** CPU limit reached: ${this.creep.room.manager.getCurrentCpu()}`)
            return
        }
        if (!this.creep.memory.travel && this.creep.memory.role !== 'mule') {
            const spawns = this.room.manager.spawns
            spawns.forEach((s) => {
                if (this.completed.has('move') || this.creep.pos.getRangeTo(s) > 1)
                    return
                const directionTo = this.creep.pos.getDirectionTo(s)
                // reverse direction
                const reverseDirection = utils.reverseDirection(directionTo)
                // randomize direction
                const randomDirection = utils.getRandomAdjacentDirection(reverseDirection)
                this.log(`**move:** directionTo: ${directionTo}, reverseDirection: ${reverseDirection}, randomDirection: ${randomDirection}`)
                const move = this.creep.move(randomDirection)
                if (move === OK) {
                    this.completed.add('move')
                }
            })
        }
    }
}

class RoomMemoryManager extends BaseContext {
    constructor(room) {
        var _a, _b
        var _c, _d
        // enable debugging for this class
        super(room, room.name);
        (_a = (_c = this.room).memory) !== null && _a !== undefined ? _a : (_c.memory = {
            next_spawn: 0,
            hostiles: [],
            underAttack: false,
            sources: [],
            owner: '',
            last_seen: Game.time,
            avgCpu: 0
        });
        (_b = (_d = this.room.memory).hostiles) !== null && _b !== undefined ? _b : (_d.hostiles = [])
        this.enemies = this.getContext('enemies', true)
        this.sources = this.getContext('sources', true)
        // log all hostiles
        this.enemies.forEach((c) => {
            const previouslySeen = this.room.memory.hostiles.find((h) => h.id === c.id)
            if (previouslySeen) {
                previouslySeen.last_seen = Game.time
                return
            }
            this.room.memory.hostiles.push({
                id: c.id,
                owner: c.owner.username,
                body: c.body.map(b => b.type),
                last_seen: Game.time
            })
        })
        //this.enemies.map((c: Creep) => c.id)
        this.room.memory.underAttack = this.enemies.length > 0
        this.setContext('underAttack', this.room.memory.underAttack)
        // save sources to memory
        this.room.memory.sources = this.sources.map(s => s.id)
        // // save owner to memory
        // this.room.memory.owner = this.room.controller?.owner?.username ?? ''
        // this.setContext('roomOwner', this.room.memory.owner)
        // save last seen
        this.room.memory.last_seen = Game.time
        this.setContext('roomLastSeen', this.room.memory.last_seen)
    }
}

class RoomSpawnManager extends RoomMemoryManager {
    constructor(room) {
        // enable debugging for this class
        super(room)
        this.creeps = this.getContext('creeps', true)
        this.spawns = this.getContext('spawns', true)
        this.log(`**RoomSpawnManager.constructor** loaded:`, {
            creeps: this.creeps.length,
            spawns: this.spawns.length,
        })
    }
    run() {
        // loop through each spawn and spawn creeps
        this.spawnManager()
    }
    spawnManager() {
        const roles = this.allRolesConfig()
        this.spawns.forEach(spawn => {
            var _a
            if (spawn.spawning)
                return
            for (const role in this.config.creeps) {
                const creepConfig = roles[role]
                if (!((_a = creepConfig === null || creepConfig === undefined ? undefined : creepConfig.body) === null || _a === undefined ? undefined : _a.length))
                    continue
                const creeps = this.creepsByRole(role)
                if (creeps.length >= creepConfig.max)
                    continue
                const name = this.creepName(role)
                this.log(`**Spawning** ${name} with ${creepConfig.body}`)
                const result = spawn.spawnCreep(creepConfig.body, name, { memory: { role, room: this.room.name, idle: 0 } })
                const spawnTime = creepConfig.body.length * 3 // calculate how long it will take to spawn this creep
                if (result === OK) {
                    this.room.memory.next_spawn = Game.time + spawnTime + this.config.spawnDelay
                }
                else {
                    this.log(`Failed to spawn ${name}: ${result}`)
                }
            }
        })
    }
    // creep body generator
    generateBody(role) {
        const energyAvailable = Math.min(700, this.room.energyCapacityAvailable)
        const config = this.config.creeps[role]
        if (!config.body.max)
            return config.body.parts
        const baseBody = config.body.parts
        let body = [...baseBody]
        const cost = (bodyParts) => bodyParts.reduce((sum, part) => sum + BODYPART_COST[part], 0)
        while (cost(body.concat(baseBody)) <= energyAvailable) {
            body = body.concat(baseBody)
        }
        return body
    }
    // get role configuration
    roleConfig(role) {
        if (!this.config.creeps[role])
            return null
        const roleConfig = this.config.creeps[role]
        const conditionsMet = roleConfig.conditions.every((cond) => this.evaluateExpression(cond))
        if (!conditionsMet)
            return null
        const max = Math.floor(Number(this.evaluateExpression(roleConfig.max)))
        const body = this.generateBody(role)
        return { max, body }
    }
    // get all roles configuration
    allRolesConfig() {
        return Object.keys(this.config.creeps).reduce((acc, role) => {
            const config = this.roleConfig(role)
            if (config)
                acc[role] = config
            return acc
        }, {})
    }
    // find a unique name for a creep
    creepName(role) {
        let name = role.slice(0, 1).toUpperCase()
        let i = 1
        while (!!Game.creeps[`${name}${i}`]) {
            i++
        }
        return `${name}${i}`
    }
}

class RoomMatrix extends RoomSpawnManager {
    constructor(room) {
        super(room)
        this.sources = this.getContext('sources', true) //this.room.find(FIND_SOURCES)
        this.constructions = this.getContext('constructionSites', true) // this.room.find(FIND_MY_CONSTRUCTION_SITES)
        this.structures = this.getContext('structures', true) // this.room.find(FIND_STRUCTURES)
        this.containers = this.getContext('containers', true) // this.allStructures.filter(({ structureType }) => structureType === STRUCTURE_CONTAINER)
        this.controllerLevel = this.getContext('controllerLevel')
        this.spawn = this.spawns[0]
        this.setContext('spawn', this.spawn)
        this.log(`**RoomBuilder** context loaded:`, {
            controllerLevel: this.controllerLevel,
            containers: this.containers.length,
            spawn: this.spawn ? this.spawn.id : 'none',
        })
        this.terrain = Game.map.getRoomTerrain(this.room.name)
        this.matrix = new PathFinder.CostMatrix()
        this.buildRoomCostMatrix()
    }
    getMatrix(creep, options = {}) {
        // console.log('**RoomMatrix:** getMatrix', creep)
        this.logCpu()
        const matrix = this.buildRoomCreepMatrix(creep, options)
        this.log(`**RoomMatrix:** ${this.room.name} matrix built for creep ${creep.name}. CPU: ${this.getLogCpu()}`)
        return matrix
    }
    buildRoomCostMatrix(options = {}) {
        const { highCost = 8, // Default high cost
            edgeCost = 200, // Default edge cost
            wallCost = 15, // Default wall cost
            roadCost = 1, // Default road cost
            plainCost = 3, // Default plain cost
            swampCost = 9, // Default swamp cost
            ...TRAVELER_DEFAULT } = options
        this.logCpu()
        // set swamp and plain costs
        for (let y = 0; y < 50; y++) {
            for (let x = 0; x < 50; x++) {
                const type = this.terrain.get(x, y)
                const cost = this.matrix.get(x, y)
                switch (type) {
                    case TERRAIN_MASK_WALL:
                        this.matrix.set(x, y, 255)
                        // nice to have, but its slow as shit
                        // // Directly check and set costs for adjacent positions
                        // for (let dx = -1; dx <= 1; dx++) {
                        //     for (let dy = -1; dy <= 1; dy++) {
                        //         const nx = x + dx
                        //         const ny = y + dy
                        //         if (nx >= 0 && nx < 50 && ny >= 0 && ny < 50) {
                        //             const cost = this.matrix.get(nx, ny)
                        //             this.matrix.set(nx, ny, Math.min(255, cost + highCost))
                        //         }
                        //     }
                        // }
                        break
                    case TERRAIN_MASK_SWAMP:
                        this.matrix.set(x, y, Math.min(255, cost + swampCost))
                        break
                    case 0:
                        this.matrix.set(x, y, Math.min(255, cost + plainCost))
                        break
                }
            }
        }
        this.log('**matrix**: set swamp and plain costs', `cpu:${this.getLogCpu()}`)
        this.logCpu()
        // Mark positions within a distance of 4 around the controller
        const controller = this.room.controller
        if (controller && controller.my) {
            // get all positions around the target
            utils.getNeighbors(controller.pos.x, controller.pos.y, 3)
                // remove out of bounds
                .filter(([x, y]) => x >= 0 && x < 50 && y >= 0 && y < 50)
                // remap with existing cost
                .map(([x, y]) => ({ x, y, cost: this.matrix.get(x, y) }))
                // set new cost
                .forEach(({ x, y, cost }) => {
                    this.matrix.set(x, y, Math.max(1, cost + highCost))
                })
        }
        this.log('**matrix**: controller ', `cpu:${this.getLogCpu()}`)
        this.logCpu()
        // Mark positions around spawns
        this.spawns.forEach(s => {
            // get all positions around the target
            utils.getNeighbors(s.pos.x, s.pos.y, 1)
                // remove out of bounds
                // ignore walls
                .filter(([x, y]) => x >= 0 && x < 50 && y >= 0 && y < 50 && this.terrain.get(x, y) === TERRAIN_MASK_WALL)
                // set new cost
                .forEach(([x, y]) => {
                    const cost = this.matrix.get(x, y)
                    this.matrix.set(x, y, Math.min(255, cost + highCost))
                })
        })
        this.log('**matrix**: spawns', `cpu:${this.getLogCpu()}`)
        this.logCpu()
        // Mark positions around sources
        this.sources
            .forEach(s => {
                // get all positions around the target
                utils.getNeighbors(s.pos.x, s.pos.y, 1)
                    // remove out of bounds
                    .filter(([x, y]) => x >= 0 && x < 50 && y >= 0 && y < 50)
                    // ignore walls
                    .filter(([x, y]) => this.terrain.get(x, y) !== TERRAIN_MASK_WALL)
                    // remap with existing cost
                    .map(([x, y]) => ({ x, y, cost: this.matrix.get(x, y) }))
                    // set new cost
                    .forEach(({ x, y, cost }) => {
                        this.matrix.set(x, y, plainCost)
                    })
            })
        this.log('**matrix**: sources', `cpu:${this.getLogCpu()}`)
        this.logCpu()
        //room.find(FIND_STRUCTURES)
        this.structures
            // remap with existing cost
            .map(({ pos: { x, y, }, structureType }) => ({ x, y, structureType, cost: this.matrix.get(x, y) }))
            .forEach(({ cost, structureType, x, y }) => {
                if (structureType === STRUCTURE_ROAD || structureType === STRUCTURE_CONTAINER || structureType === STRUCTURE_RAMPART) {
                    // Favor roads
                    this.matrix.set(x, y, Math.max(1, cost - 10))
                }
                else {
                    // Impassable structures
                    this.matrix.set(x, y, 255)
                }
            })
        this.log('**matrix**: structures', `cpu:${this.getLogCpu()}`)
        this.logCpu()
        //room.find(FIND_CONSTRUCTION_SITES)
        this.constructions
            // remap with existing cost
            .map(({ pos: { x, y, }, structureType }) => ({ x, y, structureType, cost: this.matrix.get(x, y) }))
            .forEach(({ cost, structureType, x, y }) => {
                if (structureType === STRUCTURE_ROAD || structureType === STRUCTURE_CONTAINER || structureType === STRUCTURE_RAMPART) {
                    // Favor roads
                    this.matrix.set(x, y, Math.max(1, cost - 10))
                }
                else {
                    // Impassable structures
                    this.matrix.set(x, y, 255)
                }
            })
        this.log('**matrix**: constructions', `cpu:${this.getLogCpu()}`)
    }
    buildRoomCreepMatrix(creep, options = {}) {
        const costMatrix = this.matrix.clone()
        const { highCost = 8, // Default high cost
            ignoreCreeps = false, // Default ignore creeps
            ...TRAVELER_DEFAULT } = options
        if (ignoreCreeps)
            return costMatrix
        if (!creep.manager.hasTask('harvest')) {
            const sources = this.getContext('sources', true)
            sources.forEach(s => {
                utils.getNeighbors(s.pos.x, s.pos.y, 1)
                    .forEach(([x, y]) => {
                        costMatrix.set(x, y, 200)
                    })
            })
        }
        // avoid enemies
        this.enemies.forEach((c) => {
            const canAttack = c.body.some(b => b.type === ATTACK || b.type === RANGED_ATTACK)
            utils.getNeighbors(c.pos.x, c.pos.y, canAttack ? 4 : 2)
                .forEach(([x, y]) => {
                    costMatrix.get(x, y)
                    costMatrix.set(x, y, canAttack ? 255 : 120)
                })
        })
        // find creeps that have been at the same position for awhile
        //room.find(FIND_MY_CREEPS)
        this.creeps
            // remap with existing cost
            .map((c) => ({ c, x: c.pos.x, y: c.pos.y, cost: costMatrix.get(c.pos.x, c.pos.y) }))
            .forEach(({ c, x, y, cost }) => {
                var _a
                // cheap hack to get creeps to group together near a controller
                // idea is they could share resources while together
                const controller = this.room.controller
                if (controller && c.pos.inRangeTo(controller.pos, 3)) {
                    utils.getNeighbors(c.pos.x, c.pos.y, 1)
                        .forEach(([x, y]) => {
                            const cost = costMatrix.get(x, y)
                            // is position clear of creeps and structures?
                            if (cost <= 200) {
                                costMatrix.set(x, y, Math.max(1, cost - highCost))
                            }
                        })
                }
                if (c.id === creep.id)
                    return // don't pathfind through self
                // parked creep
                if (!c.memory.travel || !((_a = c.memory.tasks) === null || _a === undefined ? undefined : _a.length)) {
                    costMatrix.set(x, y, 255)
                }
                else if (c.memory.travel && c.memory.travel.target) {
                    const destinationPosition = utils.objectToPosition(c.memory.travel.destination)
                    // creeps end point, try to avoid
                    if (c.pos.isEqualTo(destinationPosition)) {
                        costMatrix.set(destinationPosition.x, destinationPosition.y, 255)
                    }
                    else {
                        const cost = costMatrix.get(destinationPosition.x, destinationPosition.y)
                        costMatrix.set(destinationPosition.x, destinationPosition.y, Math.min(255, cost + 20))
                    }
                }
            })
        return costMatrix
    }
}

class RoomBuilder extends RoomMatrix {
    constructor(room) {
        super(room)
        this.buildable = []
        this.built_structures = 0
        if (this.config.build.enabled) {
            this.buildable = this.processBuildableStructures()
        }
    }
    run() {
        super.run()
        if (CONFIG.visuals.enabled) {
            if (this.config.build.show_build) {
                this.displayBuildStructures()
            }
            if (CONFIG.visuals.show_matrix) {
                this.displayMatrix()
            }
        }
        if (this.config.build.enabled && this.buildable.length > 0 && Game.time % this.config.build.build_frequency === 0) {
            this.buildStructures()
        }
    }
    /**
     * ROOM BUILDER
     */
    // Parse layout into structure positions
    setBuildPositions(layout, center, level) {
        if (!layout.length)
            return []
        const height = layout.length
        const width = layout[0].length
        const centerY = Math.floor(height / 2)
        const centerX = Math.floor(width / 2)
        const buildable_structures = []
        layout.forEach((row, y) => {
            row.split('').forEach((char, x) => {
                const structure = STRUCTURE_KEY[char]
                if (!structure || structure === STRUCTURE_SPAWN)
                    return
                buildable_structures.push({
                    x: center.x + (x - centerX),
                    y: center.y + (y - centerY),
                    structure,
                    level,
                })
            })
        })
        return buildable_structures
    }
    filterPositions(buildable_structures) {
        // remove positions that are not clear
        return buildable_structures
            // remove duplicates with a higher level
            .filter((v, i, a) => a.findIndex(t => t.x === v.x && t.y === v.y && t.structure === v.structure && t.level < v.level) === -1)
            .filter((v, i, a) => a.findIndex(t => t.x === v.x && t.y === v.y && t.structure === v.structure) === i)
            // remove structures that are blocked
            .filter(({ x, y }) => utils.isWalkable(this.room, x, y))
        // .filter((v, i, a) => a.findIndex(t => t.x === v.x && t.y === v.y && t.structure === v.structure) === i)
    }
    processBuildableStructures() {
        const buildOrder = this.config.build.build_orders
        if (!buildOrder || !this.spawn)
            return []
        // this.spawns = Object.values(Game.spawns)//.filter(({ my, room }) => my && room.name === this.room.name) //.this.allStructures.filter(({ structureType }) => structureType === STRUCTURE_SPAWN) as StructureSpawn[]
        // this.spawn = this.spawns[0]
        let buildable_structures = []
        for (const level in buildOrder) {
            // add layout to the buildable_structures
            buildable_structures.push(...this.setBuildPositions(buildOrder[level], this.spawn.pos, Number(level)))
        }
        buildable_structures = this.filterPositions(buildable_structures)
        // add a container near sources
        this.sources
            .forEach((source) => {
                // look for containers near source
                const containerNearSource = this.containers
                    // get all containers near source
                    .filter(({ pos }) => source.pos.getRangeTo(pos) <= 3)
                if (containerNearSource.length)
                    return
                const buildingNearSource = this.constructions
                    // get all containers near source
                    .filter(({ pos }) => source.pos.getRangeTo(pos) <= 3)
                if (buildingNearSource.length)
                    return
                const optimalPosition = utils.findOptimalPosition(this.room, source.pos, 1)
                if (!optimalPosition) {
                    console.log('BUILDER ISSUE: No optimal position found for container near source:', source)
                    return
                }
                buildable_structures.push({ x: optimalPosition.x, y: optimalPosition.y, structure: STRUCTURE_CONTAINER, level: 3 })
            })
        // build roads to sources
        this.spawns.forEach((spawn) => {
            this.sources.forEach((source) => {
                // look for containers near source
                const container_near_source = this.containers
                    // get all containers near source
                    .filter(({ pos }) => utils.inRangeTo(source.pos, pos, 2))
                    // remap to structure positions
                    .map(({ pos }) => ({ x: pos.x, y: pos.y, structure: STRUCTURE_CONTAINER, level: this.config.build.auto_build_roads_level }))
                    // get first item
                    .shift()
                if (container_near_source) {
                    buildable_structures.push(container_near_source)
                }
                const container_pos = buildable_structures
                    .find(({ x, y, structure }) => structure === STRUCTURE_CONTAINER && utils.inRangeTo(source.pos, new RoomPosition(x, y, source.room.name), 2))
                if (!container_pos) {
                    console.log("BUILDER ISSUE: No container position found near source:", source)
                    return
                }
                // find a path to the source
                new RoomPosition(container_pos.x, container_pos.y, this.room.name)
                    .findPathTo(spawn.pos, {
                        range: 1,
                        ignoreCreeps: true,
                        maxOps: 5000,
                        maxRooms: 1,
                        costCallback: (roomName, costMatrix) => {
                            costMatrix = this.matrix.clone()
                            for (const { x, y, structure } of buildable_structures) {
                                if (structure === STRUCTURE_WALL) {
                                    costMatrix.set(x, y, 255)
                                }
                                else if (structure === STRUCTURE_ROAD) {
                                    costMatrix.set(x, y, 1)
                                }
                                else {
                                    costMatrix.set(x, y, 255)
                                }
                            }
                            return costMatrix
                        },
                    })
                    .forEach(({ x, y }) => {
                        buildable_structures.push({ x: x, y, structure: STRUCTURE_ROAD, level: this.config.build.auto_build_roads_level })
                    })
                // remove container_near_source from buildable_structures
                if (container_near_source) {
                    const index = buildable_structures.findIndex(({ x, y, structure }) => x === container_near_source.x && y === container_near_source.y && structure === STRUCTURE_CONTAINER)
                    if (index >= 0) {
                        buildable_structures.splice(index, 1)
                    }
                }
            })
        })
        return this.filterPositions(buildable_structures)
    }
    displayBuildStructures() {
        if (!CONFIG.visuals.enabled || !this.buildable.length)
            return
        for (const { x, y, structure, level } of this.buildable) {
            this.room.visual.structure(new RoomPosition(x, y, this.room.name), structure)
        }
        const roads = [...this.structures, ...this.constructions]
            // filter out roads
            .filter(({ structureType }) => structureType === STRUCTURE_ROAD)
            // remap to structure positions
            .map(({ pos }) => ({ x: pos.x, y: pos.y, level: this.config.build.auto_build_roads_level, structure: STRUCTURE_ROAD }))
        roads.push(...this.buildable.filter(({ structure }) => structure === STRUCTURE_ROAD))
        roads
            .forEach(({ x, y, level }) => {
                // Get neighboring positions around the current road
                const neighbors = utils.getNeighbors(x, y, 1)
                neighbors.forEach(([dx, dy]) => {
                    if (!utils.isWalkable(this.room, dx, dy))
                        return
                    if (roads.some(({ x: nx, y: ny }) => nx === dx && ny === dy)) {
                        this.room.visual.line(dx, dy, x, y, { color: "#666", opacity: 0.25, width: 0.45 })
                    }
                })
            })
        if (!this.config.build.show_build_levels)
            return
        for (const { x, y, structure, level } of this.buildable) {
            // draw text above the structure with level
            this.room.visual.text(level.toString(), x, y + 0.1, {
                font: '0.3 Arial',
                color: structure === STRUCTURE_CONTAINER ? '#000' : (this.controllerLevel >= level ? 'yellow' : '#fff'),
                opacity: 0.75
            })
        }
    }
    // construct a structure
    constructStructure(structure) {
        if (!this.config.build.enabled)
            return
        const constructionSites = this.constructions
        if ((constructionSites.length + this.built_structures) >= this.config.build.max_constructions)
            return
        const pos = new RoomPosition(structure.x, structure.y, this.room.name)
        if (OK === this.room.createConstructionSite(pos, structure.structure)) {
            this.built_structures++
        }
    }
    // build structures
    buildStructures() {
        const spawn = this.spawn
        if (!spawn)
            return
        const controllerLevel = this.getContext("controllerLevel") // this.room.controller!.level + (this.room.controller!.progress / this.room.controller!.progressTotal)
        const buildable_structures = this.buildable
            // filter out higher levels
            .filter(({ level }) => level <= controllerLevel)
        this.log(`**RoomBuilder** Buildable structures to build ${buildable_structures.length}`)
        // sort by priority
        buildable_structures.sort((a, b) => {
            var _a, _b, _c, _d
            const priorityA = (_b = (_a = this.config.build.build_orders[a.level]) === null || _a === undefined ? undefined : _a.indexOf(a.structure)) !== null && _b !== undefined ? _b : Infinity
            const priorityB = (_d = (_c = this.config.build.build_orders[b.level]) === null || _c === undefined ? undefined : _c.indexOf(b.structure)) !== null && _d !== undefined ? _d : Infinity
            return priorityA - priorityB
        })
        // do building
        if (this.config.build.max_constructions > 0) {
            // build the structures
            buildable_structures
                .slice(0, Math.min(buildable_structures.length, Math.max(0, this.config.build.max_constructions - this.constructions.length)))
                .forEach((structure) => {
                    this.constructStructure(structure)
                })
        }
    }
    // display the room matrix
    displayMatrix() {
        // lets visualize the room matrix
        const matrix = this.matrix
        // loop through the matrix, display a number on each tile with its cost
        for (let y = 0; y < 50; y++) {
            for (let x = 0; x < 50; x++) {
                const cost = matrix.get(x, y)
                this.room.visual.text(cost.toString(), x, y + 0.1, {
                    font: '0.4 Arial',
                    opacity: 0.35
                })
            }
        }
    }
}

// extend Room prototype
if (!Room.prototype._manager) {
    Object.defineProperty(Room.prototype, 'manager', {
        get: function () {
            if (!this._manager) {
                this._manager = new RoomManager(this)
            }
            return this._manager
        },
    })
}
class RoomManager extends RoomBuilder {
    constructor(room) {
        var _a
        super(room)
        this.creepsIdle = []
        this.containerNearSource = []
        this.conatinersNearSpawn = []
        this.harvestersAtSource = []
        this.refillableStructures = []
        this.refillableStructuresNotOverAssigned = []
        this.towers = []
        this.creepsNeedHealing = []
        this.droppedResources = []
        this.sourcePositions = 0
        this.tombstones = []
        // needs to be my room
        if (!((_a = room.controller) === null || _a === undefined ? undefined : _a.my)) {
            return
        }
        this.towers = this.getContext('towers', true)
        this.droppedResources = this.getContext('droppedResources', true)
        this.creepsIdle = this.creeps
            .filter((creep) => !creep.memory.tasks || creep.memory.tasks.length === 0)
        this.creepsNeedHealing = this.creeps
            .filter((creep) => creep.hits < creep.hitsMax)
        this.containerNearSource = this.containers
            .filter(this.filterByNear(this.sources))
        this.conatinersNearSpawn = this.containers
            .filter(this.filterByNear(this.spawns))
        // harvesters at source
        this.harvestersAtSource = this.creeps
            .filter((creep) => (creep.memory.role === 'harvester' || creep.manager.hasTask('harvest')) && !creep.memory.travel)
        this.refillableStructures = this.getContext('structures', true)
            .filter(this.filterByStructureType([STRUCTURE_EXTENSION, STRUCTURE_SPAWN, STRUCTURE_TOWER]))
            .filter(this.getFreeCapacity)
        this.refillableStructuresNotOverAssigned = this.refillableStructures
            .filter(this.isNotOverAssignedTo('transfer').bind(this))
        this.sourcePositions = this.sources.reduce((a, b) => a + this.walkablePositions(b), 0)
        this.tombstones = this.room.find(FIND_TOMBSTONES).filter(t => t.store.getUsedCapacity(RESOURCE_ENERGY) > 0)
        this.setContext('sourcePositions', this.sourcePositions)
        this.setContext('creepsIdle', this.creepsIdle)
        this.setContext('creepsNeedHealing', this.creepsNeedHealing)
        this.setContext('containerNearSource', this.containerNearSource)
        this.setContext('harvestersAtSource', this.harvestersAtSource)
        this.setContext('refillableStructures', this.refillableStructures)
        this.setContext('refillableStructuresNotOverAssigned', this.refillableStructuresNotOverAssigned)
        this.setContext('conatinersNearSpawn', this.conatinersNearSpawn)
        this.log(`**RoomManager** context keys added:`, {
            creepsIdle: this.creepsIdle.length,
            refillableStructures: this.refillableStructures,
            harvestersAtSource: this.harvestersAtSource.length,
            containerNearSource: this.containerNearSource.length,
            conatinersNearSpawn: this.conatinersNearSpawn.length,
            refillableStructuresNotOverAssigned: this.refillableStructuresNotOverAssigned.length
        })
        // towers need to attack
        this.manageTowers()
        // have creeps pickup dropped resources near by
        this.pickupResources()
        // have a harvester transfer resources to a container near a source
        this.harvesterTransferToContainer()
        // builders/mules can vampire energy from harvesters
        this.vampireCreeps()
        // figure out what to do with idle creeps
        this.idleCreeps()
    }
    manageTowers() {
        for (const tower of this.towers) {
            if (this.enemies.length) {
                const result = tower.attack(this.enemies[0])
                this.log(`Tower attacking enemy: ${this.enemies[0].name}: ${result}`)
                continue
            }
            if (this.creepsNeedHealing.length) {
                const creep = this.creepsNeedHealing[0]
                const result = tower.heal(creep)
                this.log(`Tower healing creep: ${creep.name}: ${result}`)
                continue
            }
        }
    }
    pickupResources() {
        this.droppedResources.forEach(resource => {
            const creepsNearBy = this.creeps.filter(creep => creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
                creep.pos.inRangeTo(resource, 1))
            creepsNearBy.forEach(creep => {
                const transfer = creep.pickup(resource)
                if (transfer === OK) {
                    creep.manager.completed.add('transfer')
                }
            })
        })
    }
    idleCreeps() {
        const totalMules = this.creeps.filter(c => c.memory.role === 'mule').length
        // have an idle creep transfer resources from a container near a source to a container near a spawn
        this.creepsIdle
            // only creeps with carry wanted
            .filter(c => c.body.some(p => p.type === CARRY))
            // looping through all creeps
            .forEach(creep => {
                this.setContext('creep', creep) // set context for this creep
                const tombstones = this.tombstones
                    .filter(this.filterByHasUsedCapacity.bind(this))
                    .filter(this.isNotOverAssignedTo('withdraw').bind(this))
                const containerNearSourceWithUsedCapacity = this.containerNearSource
                    .filter(this.filterByHasUsedCapacity.bind(this))
                    .filter(this.isNotOverAssignedTo('withdraw').bind(this))
                const conatinersNearSpawnWithFreeCapacity = this.conatinersNearSpawn
                    .filter(this.filterByHasFreeCapacity.bind(this))
                    .filter(this.isNotOverAssignedTo('transfer').bind(this))
                const conatinersNearSpawnWithUsedCapacity = this.conatinersNearSpawn
                    .filter(this.filterByHasUsedCapacity.bind(this))
                    .filter(this.isNotOverAssignedTo('withdraw').bind(this))
                const refillableStructures = this.refillableStructuresNotOverAssigned
                    .filter(this.isNotOverAssignedTo('transfer').bind(this))
                const creepsAssignedToHarvest = this.creeps.filter(c => c.manager.hasTask('harvest')).length
                this.sourcePositions - creepsAssignedToHarvest <= 0
                // console.log(creep.name, `sourcePositions: ${this.sourcePositions} creepsAssignedToHarvest: ${creepsAssignedToHarvest} sourcesNoPositions: ${sourcesNoPositions ? 'true' : 'false'}`)
                const fillInAsMule = totalMules === 0 || creep.memory.role === 'mule'
                // free needs energy
                if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
                    // refill structures using spawn container
                    if (refillableStructures.length && (conatinersNearSpawnWithUsedCapacity.length || containerNearSourceWithUsedCapacity.length) && fillInAsMule) {
                        const refillable = refillableStructures
                            // sort by range of creep, sortest first
                            .sort(this.sortByCreepRange.bind(this))
                            // grab closest
                            .shift()
                        const container = [...conatinersNearSpawnWithUsedCapacity, ...containerNearSourceWithUsedCapacity]
                            // sort by range of creep, sortest first
                            .sort((a, b) => a.pos.getRangeTo(refillable) - b.pos.getRangeTo(refillable))
                            // closest first
                            .shift()
                        creep.manager.addTask({
                            action: 'withdraw',
                            id: container.id,
                            blocking: true // block transfer request until withdraw is done
                        })
                        creep.manager.addTask({
                            action: 'transfer',
                            id: refillable.id,
                        })
                    }
                    // refill a spawn container from source container
                    else if (containerNearSourceWithUsedCapacity.length && conatinersNearSpawnWithFreeCapacity.length && fillInAsMule) {
                        const refillable = conatinersNearSpawnWithFreeCapacity
                            // sort by range of creep, sortest first
                            .sort(this.sortByCreepRange.bind(this))
                            // grab closest
                            .shift()
                        const container = containerNearSourceWithUsedCapacity
                            // sort by range of creep, sortest first
                            .sort((a, b) => a.pos.getRangeTo(refillable) - b.pos.getRangeTo(refillable))
                            // closest first
                            .shift()
                        creep.manager.addTask({
                            action: 'withdraw',
                            id: container.id,
                            blocking: true
                        })
                        creep.manager.addTask({
                            action: 'transfer',
                            id: refillable.id,
                        })
                    }
                    // else if ((containerNearSourceWithUsedCapacity.length || conatinersNearSpawnWithUsedCapacity.length) && !['harvester', 'mule'].includes(creep.memory.role)) {
                    //     const containers = [...conatinersNearSpawnWithUsedCapacity, ...containerNearSourceWithUsedCapacity]
                    //         // sort by range of creep, sortest first
                    //         .sort(this.sortByCreepRange.bind(this))
                    //     console.log(`4): containers(${containers.length}):`, containers[0])
                    //     creep.manager.addTask({
                    //         action: 'withdraw',
                    //         id: containers[0].id,
                    //         blocking: true
                    //     })
                    // }
                    // pickup tombstones
                    else if (tombstones.length && fillInAsMule) {
                        const tombstone = tombstones
                            // sort by range of creep, sortest first
                            .sort(this.sortByCreepRange.bind(this))
                            // grab closest
                            .shift()
                        creep.manager.addTask({
                            action: 'withdraw',
                            id: tombstone.id,
                        })
                    }
                    // withdraw from a source container
                    else if (containerNearSourceWithUsedCapacity.length && !fillInAsMule) {
                        const container = containerNearSourceWithUsedCapacity
                            // sort by range of creep, sortest first
                            .sort(this.sortByCreepRange.bind(this))
                            .shift()
                        creep.manager.addTask({
                            action: 'withdraw',
                            id: container.id,
                            blocking: true
                        })
                    }
                    // // withdraw from a source container if a mule
                    // else if (containerNearSourceWithUsedCapacity.length && (sourcesNoPositions || ['mule'].includes(creep.memory.role))) {
                    //     const containers = containerNearSourceWithUsedCapacity
                    //         // sort by range of creep, sortest first
                    //         .sort(this.sortByCreepRange.bind(this))
                    //     console.log(`5): containers(${containers.length}):`, containers[0])
                    //     creep.manager.addTask({
                    //         action: 'withdraw',
                    //         id: containers[0].id,
                    //         blocking: true
                    //     })
                    // }
                    // }
                }
                // creep has energy
                else {
                    // transfer into a refillable Structure
                    if (refillableStructures.length && fillInAsMule) {
                        const refillable = refillableStructures
                            // sort by range of creep, sortest first
                            .sort(this.sortByCreepRange.bind(this))
                            .shift()
                        creep.manager.addTask({
                            action: 'transfer',
                            id: refillable.id,
                        })
                    }
                    // refill spawn container
                    else if (conatinersNearSpawnWithFreeCapacity.length) {
                        const refillable = conatinersNearSpawnWithFreeCapacity
                            // sort by range of creep, sortest first
                            .sort(this.sortByCreepRange.bind(this))
                            .shift()
                        creep.manager.addTask({
                            action: 'transfer',
                            id: refillable.id,
                        })
                    }
                    // park the mule somewhere near the spawn
                    else if (['mule'].includes(creep.memory.role) && this.conatinersNearSpawn.length) {
                        creep.manager.addTask({
                            action: 'move',
                            pos: this.conatinersNearSpawn[0].pos,
                        })
                    }
                    // else if (containerNearSourceWithUsedCapacity.length && creep.store.getFreeCapacity() > 0) {
                    //     const container = containerNearSourceWithUsedCapacity
                    //         // sort by range of creep, sortest first
                    //         .sort(this.sortByCreepRange.bind(this))
                    //     // withdraw from a source container
                    //     creep.manager.addTask({
                    //         action: 'withdraw',
                    //         id: container[0].id,
                    //     })
                    // }
                }
            })
    }
    vampireCreeps() {
    }
    harvesterTransferToContainer() {
    }
}

// main game loop
const loop = () => {
    console.log('---------------------------------------')
    // Automatically delete memory of missing creeps
    for (const name in Memory.creeps) {
        if (!(name in Game.creeps)) {
            delete Memory.creeps[name]
            continue
        }
    }
    let cpuStart = Game.cpu.getUsed()
    // get all rooms
    const rooms = Object.values(Game.rooms)
    // loop all rooms
    rooms.forEach(room => {
        room.manager.run()
    })
    console.log('All rooms cpu:', Game.cpu.getUsed() - cpuStart)
    cpuStart = Game.cpu.getUsed()
    // loop my creeps
    const creeps = Object.values(Game.creeps)
        .filter(c => c.my && !c.spawning)
    // setup tasks for creeps
    creeps.forEach(creep => {
        creep.manager.run()
    })
    console.log('creeps cpu:', Game.cpu.getUsed() - cpuStart)
    cpuStart = Game.cpu.getUsed()
    // setup tasks for creeps
    creeps.forEach(creep => {
        creep.manager.flushLogs()
    })
    // loop all rooms
    rooms.forEach(room => {
        room.manager.flushLogs()
    })
    console.log('logs cpu:', Game.cpu.getUsed() - cpuStart)

    cpuStart = Game.cpu.getUsed()
    console.log('total cpu:', Game.cpu.getUsed())
}

exports.loop = loop
//# sourceMappingURL=main.js.map
