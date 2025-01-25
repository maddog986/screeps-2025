// Enhanced Traveler module

import { CONFIG } from 'config'
import cache from 'utils/cache'
import Debuggable from 'utils/debugger'

declare global { // using global declaration to extend the existing types
    interface CreepMemory {
        _travel?: TravelerMemory
    }

    interface Creep {
        travel(target: RoomPosition, options?: TravelerOptions): ScreepsReturnCode
    }
}

export interface TravelerMemory {
    stuck: number
    target: { x: number, y: number, roomName: string }
    lastPos: { x: number, y: number, roomName: string }
    distance: number
    path: string
}

interface TravelerOptions {
    stuckThreshold?: number
    range?: number
    useCache?: boolean
    ignoreCreeps?: boolean
    highCost?: number       // Cost for high-priority areas
    edgeCost?: number       // Cost for tiles near edges
    wallCost?: number       // Cost for tiles near walls
    plainCost?: number      // Cost for plain tiles
    swampCost?: number      // Cost for swamp tiles
    roadCost?: number       // Cost for road tiles
}

// extending creep prototype to make moving easier
Creep.prototype.travel = function (target: RoomPosition, options: TravelerOptions = {}): ScreepsReturnCode {
    return Traveler.move(this, target, options)
}

const defaultOptions: TravelerOptions = {
    useCache: true,         // Default use cache
    range: 1,               // Default range
    ignoreCreeps: false,    // Default ignore creeps
    stuckThreshold: 4,      // Default stuck threshold
    highCost: 8,            // Default high cost
    edgeCost: 200,          // Default edge cost
    wallCost: 15,           // Default wall cost
    roadCost: 1,            // Default road cost
    plainCost: 3,           // Default plain cost
    swampCost: 9,           // Default swamp cost
}

export default class Traveler extends Debuggable {
    static isTravelValid(creep: Creep | undefined, target: RoomPosition | undefined = undefined): boolean {
        if (!creep) return false
        if (!creep.memory._travel) return false
        if (!creep.memory._travel.target) return false

        return true
    }

    static positionToObject(pos: RoomPosition): { x: number, y: number, roomName: string } {
        return { x: pos.x, y: pos.y, roomName: pos.roomName }
    }

    static objectToPosition(obj: { x: number, y: number, roomName: string }): RoomPosition {
        return new RoomPosition(obj.x, obj.y, obj.roomName)
    }

    static move(creep: Creep, target: RoomPosition, options: TravelerOptions = {}): ScreepsReturnCode {
        const logger = new Debuggable(true, `Traveler[${creep.name}]`)

        // if creep is tired, do nothing
        if (creep.fatigue > 0 || creep.spawning) {
            // draw circle around creep
            if (CONFIG.visuals && CONFIG.visuals.creep_travel && !creep.spawning) {
                creep.room.visual.circle(creep.pos, { fill: 'transparent', radius: 0.50, stroke: 'yellow' })
                logger.debug(`[${creep.name}] is tired.`)
            }
            return ERR_TIRED
        }

        // Initialize travel memory if invalid
        if (!creep.memory._travel || !Traveler.isTravelValid(creep, target)) {
            // console.log(creep.name, 'initialize travel memory')
            creep.memory._travel = {
                stuck: 0,
                target: Traveler.positionToObject(target),
                lastPos: Traveler.positionToObject(creep.pos),
                distance: 0,
                path: ''
            }

            logger.debug(`[${creep.name}] initialized travel memory.`, creep.memory._travel)
        }
        // Check if creep is stuck
        else if (creep.pos.isEqualTo(Traveler.objectToPosition(creep.memory._travel.lastPos))) {
            creep.memory._travel.stuck += 1

            logger.debug(`[${creep.name}] is stuck.`, creep.memory._travel)
        }
        // Reset stuck counter and check if path is blocked at the end by a parked creep
        else {
            logger.debug(`[${creep.name}] resuming travel. memory:`, creep.memory._travel)

            creep.memory._travel.stuck = 0

            const targetPos = Traveler.objectToPosition(creep.memory._travel.target)
            const creeps = Object.values(Game.creeps).filter(
                (c) => c.id !== creep.id &&
                    (!c.memory._travel || !c.memory._travel.path.length) &&
                    c.pos.isEqualTo(targetPos)
            )

            // path is blocked by a parked creep
            if (creeps.length) {
                options.useCache = false

                logger.debug(`[${creep.name}] path is blocked by a parked creep.`, creeps)
            }
        }

        // default options
        const { useCache = true, range = 1, ignoreCreeps = false, stuckThreshold = 4, ...defaultOptions } = options

        logger.debug(`[${creep.name}] moving to target position: ${JSON.stringify(creep.memory._travel.target)}.`, options)

        // find path to target
        if (!useCache || !creep.memory._travel.path.length || creep.memory._travel.stuck > stuckThreshold) {
            // Generate new path using custom CostMatrix
            const new_path = creep.room.findPath(creep.pos, target, {
                range,
                ignoreCreeps,
                ignoreRoads: true,
                maxRooms: 1,
                costCallback: (roomName, costMatrix) => this.buildRoomCostMatrix(roomName, costMatrix, options),
            })
                .map(step => step.direction)
                .join('')

            // console.log(creep.name, 'new path:', new_path, 'length:', new_path.length)

            const posAtEndOfPath = new_path.split('').reduce((pos, direction) => this.getPosFromDirection(pos, Number(direction) as DirectionConstant), creep.pos)

            creep.memory._travel.target = Traveler.positionToObject(posAtEndOfPath)
            creep.memory._travel.path = new_path
            creep.memory._travel.distance = new_path.length // acutal path distance to target

            if (!useCache) {
                creep.memory._travel.stuck = 0
            }

            // blue circle around creep
            if (CONFIG.visuals && CONFIG.visuals.creep_travel) creep.room.visual.circle(creep.pos, { fill: 'transparent', radius: 0.50, stroke: 'blue' })

            logger.debug(`[${creep.name}] generated new path.`, creep.memory._travel)
        }

        // path finding failed
        if (creep.memory._travel.path.length === 0) {
            logger.debug(`[${creep.name}] path finding failed.`, creep.memory._travel)
            logger.flushLogs()

            delete creep.memory._travel
            return ERR_NO_PATH
        }

        const nextDirection = Number(creep.memory._travel.path.substring(0, 1)) as DirectionConstant
        const nextPosition = this.getPosFromDirection(creep.pos, nextDirection)

        // const nextPosition = this.getPosFromDirection(creep.pos, nextDirection)
        // // check if another creep shares this next position
        // const creeps = creep.pos.findInRange(FIND_MY_CREEPS, 2, {
        //     filter: c => c.id !== creep.id &&
        //         c.memory._travel && c.memory._travel.path && c.memory._travel.path.length > 0 && c.memory._travel.lastPos &&
        //         c.pos.getRangeTo(creep) === 2 &&
        //         // is creep going to be at the same spot as we?
        //         nextPosition.isEqualTo(
        //             this.getPosFromDirection(this.objectToPosition(c.memory._travel.lastPos), Number(c.memory._travel?.path.slice(0, 1)) as DirectionConstant)
        //         )
        // })
        // if (creeps.length) {
        //     creep.say('WAIT?')
        //     // for (const c of creeps) {
        //     //     if (!c.memory._travel || !c.memory._travel.path || c.memory._travel.path.length === 0 || !c.memory._travel.lastPos) continue
        //     //     // figure out if creeps are going oppisite directions
        //     //     const cNextDirection = Number(c.memory._travel?.path.slice(0, 1)) as DirectionConstant
        //     //     const cNextPosition = this.getPosFromDirection(this.objectToPosition(c.memory._travel.lastPos), cNextDirection)
        //     //     // console.log(`creep1: ${creep.name} creep2: ${c.name}\n` +
        //     //     //     `c1:pos: ${creep.pos}\n` +
        //     //     //     `c2:pos: ${c.pos}\n` +
        //     //     //     `c1:nextDirection: ${nextDirection}\n` +
        //     //     //     `c2:NextDirection: ${cNextDirection}\n` +
        //     //     //     `c3:nextPosition: ${nextPosition}\n` +
        //     //     //     `c4:cNextPosition: ${cNextPosition}`)
        //     //     // if creeps are going opposite directions, we can swap places
        //     //     if (nextDirection + cNextDirection === 9) {
        //     //         // console.log(creep.name, 'swap places with', c.name)
        //     //         creep.say('SWAP?')
        //     //         creep.pull(c)
        //     //         c.pull(creep)
        //     //     }
        //     // }
        // }

        // visual path
        if (CONFIG.visuals.enabled && CONFIG.visuals.creep_travel) {
            const pathToTarget = creep.memory._travel.path.split('')
                .map(d => Number(d) as DirectionConstant)
                .reduce((path, direction) => {
                    const pos = this.getPosFromDirection(path[path.length - 1], direction)
                    path.push(pos)
                    return path
                }, [creep.pos])

            creep.room.visual.poly(pathToTarget, { stroke: '#fff', lineStyle: 'dashed', opacity: 0.2 })
        }

        // Move along the path
        const moveResult = creep.move(nextDirection)

        // Check if move was successful
        if (moveResult === OK) {
            creep.memory._travel.path = creep.memory._travel.path.substring(1)      // Remove the used step
            creep.memory._travel.lastPos = Traveler.positionToObject(creep.pos)     // set last position
            creep.memory._travel.distance = creep.memory._travel.path.length        // acutal path distance to target

            logger.debug(`[${creep.name}] moved from ${creep.pos} to ${nextPosition}.`, creep.memory._travel)
        }
        // check if creep is tired
        else if (moveResult === ERR_TIRED) {
            logger.debug(`[${creep.name}] is tired after move.`, creep.memory._travel)
            logger.flushLogs()

            // just needs a minute
            return moveResult
        }

        // check if creep is stuck
        if (creep.memory._travel.stuck > stuckThreshold) {
            logger.debug(`[${creep.name}] is stuck after move.`, creep.memory._travel)
            logger.flushLogs()

            creep.say('Stuck!')

            if (CONFIG.visuals && CONFIG.visuals.creep_travel) creep.room.visual.circle(creep.pos, { fill: 'transparent', radius: 0.5, stroke: 'orange', opacity: (creep.memory._travel.stuck / 6) })

            // delete target information
            delete creep.memory._travel

            // we stuck, so no path
            return ERR_NO_PATH
        }

        logger.flushLogs()

        // movement result
        return moveResult
    }

    static getPosFromDirection(origin: RoomPosition, direction: DirectionConstant): RoomPosition {
        const offsets = {
            1: { x: 0, y: -1 },
            2: { x: 1, y: -1 },
            3: { x: 1, y: 0 },
            4: { x: 1, y: 1 },
            5: { x: 0, y: 1 },
            6: { x: -1, y: 1 },
            7: { x: -1, y: 0 },
            8: { x: -1, y: -1 },
        }

        const offset = offsets[direction]
        if (!offset) {
            throw new Error(`Invalid direction: ${direction}`)
        }

        // Create and return the new position
        return new RoomPosition(
            origin.x + offset.x,
            origin.y + offset.y,
            origin.roomName
        )
    }

    @cache('buildRoomCostMatrix', 1)
    static buildRoomCostMatrix(roomName: string, costMatrix: CostMatrix, options: TravelerOptions = {}): CostMatrix {
        const room = Game.rooms[roomName]
        if (!room) return costMatrix

        const {
            highCost = 8,           // Default high cost
            edgeCost = 200,         // Default edge cost
            wallCost = 15,          // Default wall cost
            roadCost = 1,           // Default road cost
            plainCost = 3,          // Default plain cost
            swampCost = 9,         // Default swamp cost
            ignoreCreeps = false,   // Default ignore creeps
            ...defaultOptions
        } = options

        const terrain = Game.map.getRoomTerrain(roomName)

        // set swamp and plain costs
        this.getGridNeighbors(0, 0, 50)
            // remap with terrain type
            .map(([x, y]) => ({ x, y, type: terrain.get(x, y) }))
            // set costs
            .forEach(({ x, y, type }) => {
                const cost = costMatrix.get(x, y)

                switch (type) {
                    case TERRAIN_MASK_WALL:
                        costMatrix.set(x, y, 255)

                        // get all positions around the wall to increase cost
                        this.getNeighbors(x, y, 1)
                            // remove out of bounds
                            .filter(([x, y]) => x >= 0 && x < 50 && y >= 0 && y < 50)
                            // remap
                            .map(([x, y]) => ({ x, y, cost: costMatrix.get(x, y) }))
                            // set new cost
                            .forEach(({ x, y, cost }) => {
                                costMatrix.set(x, y, Math.min(255, cost + highCost))
                            })
                        break
                    case TERRAIN_MASK_SWAMP:
                        costMatrix.set(x, y, Math.min(255, cost + swampCost))
                        break
                    case 0:
                        costMatrix.set(x, y, Math.min(255, cost + plainCost))
                        break
                }
            })

        // Mark positions within a distance of 4 around the controller
        const controller = room.controller
        if (controller && controller.my) {
            // get all positions around the target
            this.getNeighbors(controller.pos.x, controller.pos.y, 3)
                // remove out of bounds
                .filter(([x, y]) => x >= 0 && x < 50 && y >= 0 && y < 50)
                // remap with existing cost
                .map(([x, y]) => ({ x, y, cost: costMatrix.get(x, y) }))
                // set new cost
                .forEach(({ x, y, cost }) => {
                    costMatrix.set(x, y, Math.max(1, cost + highCost))
                })
        }

        const spawns = room.find(FIND_MY_SPAWNS)
        const sources = room.find(FIND_SOURCES)

        // Mark positions around spawns
        spawns.forEach(s => {
            // get all positions around the target
            this.getNeighbors(s.pos.x, s.pos.y, 1)
                // remove out of bounds
                .filter(([x, y]) => x >= 0 && x < 50 && y >= 0 && y < 50)
                // ignore walls
                .filter(([x, y]) => terrain.get(x, y) === TERRAIN_MASK_WALL)
                // remap with existing cost
                .map(([x, y]) => ({ x, y, cost: costMatrix.get(x, y) }))
                // set new cost
                .forEach(({ x, y, cost }) => {
                    costMatrix.set(x, y, Math.min(255, cost + highCost))
                })
        })

        // Mark positions around sources
        sources
            .forEach(s => {
                // get all positions around the target
                this.getNeighbors(s.pos.x, s.pos.y, 1)
                    // remove out of bounds
                    .filter(([x, y]) => x >= 0 && x < 50 && y >= 0 && y < 50)
                    // ignore walls
                    .filter(([x, y]) => terrain.get(x, y) !== TERRAIN_MASK_WALL)
                    // remap with existing cost
                    .map(([x, y]) => ({ x, y, cost: costMatrix.get(x, y) }))
                    // set new cost
                    .forEach(({ x, y, cost }) => {
                        costMatrix.set(x, y, plainCost)
                    })
            })

        room.find(FIND_STRUCTURES)
            // remap with existing cost
            .map(({ pos: { x, y, }, structureType }) => ({ x, y, structureType, cost: costMatrix.get(x, y) }))

            .forEach(({ cost, structureType, x, y }) => {
                if (structureType === STRUCTURE_ROAD || structureType === STRUCTURE_CONTAINER || structureType === STRUCTURE_RAMPART) {
                    // Favor roads
                    costMatrix.set(x, y, Math.max(1, cost - 10))
                } else {
                    // Impassable structures
                    costMatrix.set(x, y, 255)
                }
            })

        room.find(FIND_CONSTRUCTION_SITES)
            // remap with existing cost
            .map(({ pos: { x, y, }, structureType }) => ({ x, y, structureType, cost: costMatrix.get(x, y) }))
            .forEach(({ cost, structureType, x, y }) => {
                if (structureType === STRUCTURE_ROAD || structureType === STRUCTURE_CONTAINER || structureType === STRUCTURE_RAMPART) {
                    // Favor roads
                    costMatrix.set(x, y, Math.max(1, cost - 10))
                } else {
                    // Impassable structures
                    costMatrix.set(x, y, 255)
                }
            })

        if (!ignoreCreeps) {
            // find creeps that have been at the same position for awhile
            room.find(FIND_MY_CREEPS)
                // remap with existing cost
                .map((creep) => ({ creep, x: creep.pos.x, y: creep.pos.y, cost: costMatrix.get(creep.pos.x, creep.pos.y) }))
                .forEach(({ creep, x, y, cost }) => {
                    // cheap hack to get creeps to group together near a controller
                    // idea is they could share resources while together
                    const controller = room.controller
                    if (controller && creep.pos.inRangeTo(controller.pos, 3)) {
                        this.getNeighbors(creep.pos.x, creep.pos.y, 1)
                            .forEach(([x, y]) => {
                                const cost = costMatrix.get(x, y)

                                // is position clear of creeps and structures?
                                if (cost <= 200) {
                                    costMatrix.set(x, y, Math.max(1, cost - highCost))
                                }
                            })
                    }

                    // parked creep
                    if (!creep.memory._travel || creep.memory._travel.path.length === 0 || creep.memory._travel.distance === 0) {
                        costMatrix.set(x, y, 255)
                    }
                })
        }

        return costMatrix.clone()
    }

    static getGridNeighbors(x: number, y: number, distance: number = 1): [number, number][] {
        const neighbors: [number, number][] = []
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

    static getNeighbors(x: number, y: number, distance: number = 1): [number, number][] {
        const neighbors: [number, number][] = []
        for (let dx = -distance; dx <= distance; dx++) {
            for (let dy = -distance; dy <= distance; dy++) {
                // filter out of bounds
                if (x + dx < 0 || x + dx > 49 || y + dy < 0 || y + dy > 49) continue
                if (dx === 0 && dy === 0) continue // Skip the center point
                neighbors.push([x + dx, y + dy])
            }
        }
        return neighbors
    }
}
