// Enhanced Traveler module with role-based priority, creep swapping, path caching, and CostMatrix support

import { cache } from './cache'
import { JOB, ROLE } from './creeps/CreepBaseClass'
import utils from './utils'

type CreepRole = 'harvester' | 'mule' | 'builder' | 'upgrader'

const rolePriorities: Record<CreepRole, number> = {
    upgrader: 1,
    harvester: 2,
    mule: 3,
    builder: 5,
}

export interface TravelerMemory {
    stuck: number
    lastPos: { x: number, y: number, roomName: string }
    path: string
}

interface TravelerOptions {
    stuckThreshold?: number
    avoidRooms?: string[]
    preferHighways?: boolean
    range?: number
    priority?: number
    useCache?: boolean
    ignoreCreeps?: boolean
    highCost?: number    // Cost for high-priority areas
    edgeCost?: number    // Cost for tiles near edges
    wallCost?: number    // Cost for tiles near walls
    wallBuffer?: number  // Buffer distance from walls
    edgeMargin?: number  // Margin from the edges to avoid
    plainCost?: number   // Cost for plain tiles
    swampCost?: number   // Cost for swamp tiles
    roadCost?: number    // Cost for road tiles
}

export default class Traveler {
    static move(creep: Creep, target: RoomPosition, options: TravelerOptions = {}): ScreepsReturnCode {
        // if creep is tired, do nothing
        if (creep.fatigue > 0) {
            return ERR_TIRED
        }

        if (creep.pos.isEqualTo(target)) {
            return ERR_NO_PATH
        }

        if (creep.pos.isNearTo(target)) {
            return creep.move(creep.pos.getDirectionTo(target))
        }

        const { priority = rolePriorities[creep.memory.role as CreepRole] || 99, useCache = true } = options

        if (!creep.memory._travel) {
            // console.log(creep.name, 'initialize travel memory')
            creep.memory._travel = { stuck: -1, lastPos: { x: 0, y: 0, roomName: creep.room.name }, path: '' } // Initialize travel memory
        }

        if (creep.pos.isEqualTo(new RoomPosition(creep.memory._travel.lastPos.x, creep.memory._travel.lastPos.y, creep.memory._travel.lastPos.roomName))) {
            creep.memory._travel.stuck += 1 // Increment stuck counter
        } else {
            creep.memory._travel.stuck = 0 // Reset counter if creep has moved
        }

        // find path to target
        if (!useCache || !creep.memory._travel.path.length || creep.memory._travel.stuck > 2) {
            // Generate new path using custom CostMatrix
            const new_path = creep.room.findPath(creep.pos, target, {
                range: 1,
                ignoreCreeps: true,
                ignoreRoads: true,
                maxRooms: 1,
                costCallback: (roomName, costMatrix) => this.buildCreepCostMatrix(creep, roomName, costMatrix, options),
            })
                .map(step => step.direction)
                .join('')

            // console.log(creep.name, 'new path:', new_path, 'length:', new_path.length)

            creep.memory._travel.path = new_path
        }

        // Move along the path
        if (creep.memory._travel.path.length > 0) {

            // const resolved = this.resolveTraffic(creep, priority)
            // if (resolved !== ERR_NO_PATH) {
            //     console.log(creep.name, 'resolveTraffic:', resolved)
            //     if (resolved === OK) {
            //         return OK
            //     }
            // }

            // Move along the path
            const moveResult = creep.move(Number(creep.memory._travel.path.substring(0, 1)) as DirectionConstant)

            // Check if move was successful
            if (moveResult === OK) {
                creep.memory._travel.path = creep.memory._travel.path.substring(1) // Remove the used step
                creep.memory._travel.lastPos = { x: creep.pos.x, y: creep.pos.y, roomName: creep.room.name } // Update last position

                // Check and pull trailing creep if applicable
                this.checkAndPullCreep(creep)

                return moveResult // Successfully moved
            } else {
                // console.log(creep.name, 'move failed:', moveResult)



                // Movement failed, check if stuck
                if (this.isCreepStuck(creep, options)) {
                    creep.say('Stuck!')
                    return ERR_NO_PATH
                }
            }
        }

        creep.say('No path!')
        return ERR_NO_PATH
    }

    static checkAndPullCreep(creep: Creep): void {
        // Get the position behind the creep based on its current direction
        const direction = creep.memory._travel?.path?.substring(0, 1)
        if (!direction) return // No direction to check

        const behindPos = utils.getPosFromDirection(creep.pos, ((Number(direction) + 3) % 8) + 1 as DirectionConstant) // Direction behind
        const trailingCreep = behindPos
            .lookFor(LOOK_CREEPS)
            .find(c => c.memory._travel?.path?.substring(0, 1) === String(direction) && c.fatigue > 0) // Find tired creep trying to move forward

        if (trailingCreep) {
            // Calculate total weight (body parts)
            const pullerWeight = creep.body.filter(part => part.type === MOVE).length
            const pulledWeight = trailingCreep.body.filter(part => part.type === MOVE || part.type === CARRY).length

            // Ensure puller won't get exhausted
            if (pullerWeight < pulledWeight) {
                console.log(`${creep.name} cannot pull ${trailingCreep.name}, not enough MOVE parts!`)
                return
            }

            // Pull the trailing creep
            creep.pull(trailingCreep)
            trailingCreep.move(creep) // Move towards the pulling creep
            console.log(`${creep.name} is pulling ${trailingCreep.name}`)
        }
    }

    static isCreepStuck(creep: Creep, options: TravelerOptions = {}): boolean {
        const { stuckThreshold = 2 } = options

        if (!creep.memory._travel) {
            creep.memory._travel = { stuck: 0, lastPos: { x: creep.pos.x, y: creep.pos.y, roomName: creep.room.name }, path: '' }
        }

        const { x, y, roomName } = creep.memory._travel.lastPos

        if (x === creep.pos.x && y === creep.pos.y && roomName === creep.room.name) {
            creep.memory._travel.stuck += 1
            creep.say(`Stuck! ${creep.memory._travel.stuck}`)
        } else {
            creep.memory._travel.stuck = 0
            creep.memory._travel.lastPos = { x: creep.pos.x, y: creep.pos.y, roomName: creep.room.name }
        }

        return creep.memory._travel.stuck > stuckThreshold
    }

    static resolveTraffic(creep: Creep, priority: number) {
        const adjacentCreeps = creep.pos.findInRange(FIND_MY_CREEPS, 1)
            .filter(c =>
                c.id !== creep.id &&
                (
                    // not assigned to assisting
                    c.memory.job !== JOB.assist ||

                    // and not being pulled
                    utils.creeps({ role: ROLE.mule, target: c.id }).length > 0 ||

                    // is creep in front of us where we are going
                    utils.getPosFromDirection(creep.pos, Number(creep.memory._travel!.path.substring(0, 1)) as DirectionConstant).isEqualTo(c.pos)
                )
            )

        for (const otherCreep of adjacentCreeps) {
            const otherPriority = rolePriorities[otherCreep.memory.role as CreepRole] || 99

            if (priority <= otherPriority) {
                // Attempt to swap positions if this creep has higher priority
                const directionToMove = creep.pos.getDirectionTo(otherCreep.pos)
                const directionOtherMoves = otherCreep.pos.getDirectionTo(creep.pos)

                const creepMove = creep.move(directionToMove)
                const otherMove = otherCreep.move(directionOtherMoves)

                if (creepMove === OK && otherMove === OK) {
                    otherCreep.memory.move = OK
                    delete otherCreep.memory._travel
                    console.log(`${creep.name} swapped places with ${otherCreep.name}`)
                    return creepMove
                }
            }
        }

        return ERR_NO_PATH
    }

    @cache("buildRoomCostMatrix", 1)
    static buildRoomCostMatrix(roomName: string, costMatrix: CostMatrix, options: TravelerOptions = {}): CostMatrix {
        const room = Game.rooms[roomName]
        if (!room) return costMatrix

        const {
            highCost = 8,           // Default high cost
            edgeCost = 200,         // Default edge cost
            wallCost = 15,          // Default wall cost
            wallBuffer = 2,         // Default wall buffer
            edgeMargin = 2,         // Default edge margin
            roadCost = 1,           // Default road cost
            plainCost = 6,          // Default plain cost
            swampCost = 10,         // Default swamp cost
            ignoreCreeps = false,   // Default ignore creeps
        } = options

        const terrain = Game.map.getRoomTerrain(roomName)

        // Add high costs to room edges
        utils.getGridNeighbors(0, 0, 50)
            .filter(([x, y]) => x < edgeMargin || x >= 50 - edgeMargin || y < edgeMargin || y >= 50 - edgeMargin)
            .forEach(([x, y]) => costMatrix.set(x, y, edgeCost))

        // set swamp and plain costs
        utils.getGridNeighbors(0, 0, 50)
            // remap with terrain type
            .map(([x, y]) => ({ x, y, type: terrain.get(x, y) }))
            // set costs
            .forEach(({ x, y, type }) => {
                if (type === TERRAIN_MASK_WALL) {
                    costMatrix.set(x, y, 255)
                } else if (type === TERRAIN_MASK_SWAMP) {
                    costMatrix.set(x, y, swampCost)
                } else {
                    costMatrix.set(x, y, plainCost)
                }
            })

        // set swamp and plain costs
        utils.getGridNeighbors(0, 0, 50)
            // remap with terrain type
            .map(([x, y]) => ({ x, y, type: terrain.get(x, y) }))
            // set costs
            .forEach(({ x, y, type }) => {
                if (type !== TERRAIN_MASK_WALL) return

                // get all positions around the wall to increase cost
                utils.getNeighbors(x, y, 1)
                    // remove out of bounds
                    .filter(([x, y]) => x >= 0 && x < 50 && y >= 0 && y < 50)
                    // remap
                    .map(([x, y]) => ({ x, y, cost: costMatrix.get(x, y) }))
                    // set new cost
                    .forEach(({ x, y, cost }) => {
                        costMatrix.set(x, y, Math.min(255, cost + highCost))
                    })

            })

        // Mark positions within a distance of 4 around the controller
        const controller = room.controller
        if (controller && controller.my) {
            // get all positions around the target
            utils.getNeighbors(controller.pos.x, controller.pos.y, 3)
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
            utils.getNeighbors(s.pos.x, s.pos.y, 1)
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
                utils.getNeighbors(s.pos.x, s.pos.y, 1)
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
            room.find(FIND_MY_CREEPS, {
                filter: (creep) =>
                    creep.memory.target_time &&
                    creep.memory.target_time >= 15 &&
                    [ROLE.harvester, ROLE.upgrader, ROLE.builder].includes(creep.memory.role as any)
            })
                // remap with existing cost
                .map(({ pos: { x, y, } }) => ({ x, y, cost: costMatrix.get(x, y) }))
                .forEach(({ x, y, cost }) => {
                    costMatrix.set(x, y, Math.min(255, cost + 100))
                })
        }

        // Mark positions around sources
        // [...sources, controller].forEach(s => {
        //     if (!s || !s.pos) return

        //     for (const spawn of spawns) {
        //         // find a path to the source
        //         const path_to_source = spawn.pos.findPathTo(s.pos, {
        //             range: 2,
        //             ignoreCreeps,
        //             maxOps: 5000,
        //             costCallback: () => costMatrix,
        //         })
        //         for (const { x, y } of path_to_source) {
        //             costMatrix.set(x, y, roadCost * 2)
        //         }
        //     }
        // })

        return costMatrix
    }

    @cache("buildCreepCostMatrix", 1)
    static buildCreepCostMatrix(creep: Creep, roomName: string, costMatrix: CostMatrix, options: TravelerOptions = {}): CostMatrix {
        const room = Game.rooms[roomName]
        if (!room) return costMatrix

        // Use room-level cost matrix as the base
        costMatrix = this.buildRoomCostMatrix(roomName, costMatrix, options).clone()

        // find creeps that have been at the same position for awhile
        room.find(FIND_MY_CREEPS, {
            filter: (c) =>
                utils.getRangeTo(creep.pos, c.pos) <= 2
        })
            .forEach(creep => {
                if (creep.memory._travel && creep.memory._travel.path.length > 0) {
                    const direction = Number(creep.memory._travel.path.substring(0, 1)) as DirectionConstant
                    const pos = utils.getPosFromDirection(creep.pos, direction)
                    costMatrix.set(pos.x, pos.y, 255)
                } else {
                    costMatrix.set(creep.pos.x, creep.pos.y, 255)
                }
            })

        return costMatrix
    }
}
