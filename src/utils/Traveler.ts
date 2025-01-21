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
                    // console.log(creep.name, 'is stuck:', creep.memory._travel.stuck)

                    const resolved = this.resolveTraffic(creep, priority)
                    if (resolved === OK)
                        return OK

                    console.log('Failed to resolve traffic:', resolved)
                }
            }
        }

        creep.say('No path!')
        return ERR_NO_PATH
    }

    static checkAndPullCreep(creep: Creep): void {
        // Get the position behind the creep based on its current direction
        const direction = creep.memory._travel?.path?.[0]
        if (!direction) return // No direction to check

        const behindPos = utils.getPosFromDirection(creep.pos, ((Number(direction) + 3) % 8) + 1 as DirectionConstant) // Direction behind
        const trailingCreep = behindPos
            .lookFor(LOOK_CREEPS)
            .find(c => c.memory._travel?.path?.[0] === String(direction) && c.fatigue > 0) // Find tired creep trying to move forward

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
                    utils.creeps({ role: ROLE.mule, target: c.id }).length > 0
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
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
                // edge costs
                if (x < edgeMargin || x >= 50 - edgeMargin || y < edgeMargin || y >= 50 - edgeMargin) {
                    costMatrix.set(x, y, edgeCost)
                    continue
                }

                // Add higher costs near walls
                if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
                    costMatrix.set(x, y, 255)
                } else if (terrain.get(x, y) === TERRAIN_MASK_SWAMP) {
                    // Favor swamps
                    costMatrix.set(x, y, swampCost)
                } else {
                    // plain costs
                    costMatrix.set(x, y, plainCost)
                }
            }
        }

        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
                // edge costs
                if (x < edgeMargin || x >= 50 - edgeMargin || y < edgeMargin || y >= 50 - edgeMargin) {
                    continue
                }

                // Add higher costs near walls
                if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
                    costMatrix.set(x, y, 255)

                    for (let dx = x - 1; dx <= x + 1; dx++) {
                        for (let dy = y - 1; dy <= y + 1; dy++) {
                            if (terrain.get(dx, dy) !== TERRAIN_MASK_WALL) {
                                costMatrix.set(dx, dy, wallCost)
                            }
                        }
                    }
                }
            }
        }

        // Mark positions within a distance of 4 around the controller
        const controller = room.controller
        if (controller) {
            for (let x = controller.pos.x - 3; x <= controller.pos.x + 3; x++) {
                for (let y = controller.pos.y - 3; y <= controller.pos.y + 3; y++) {
                    if (x >= 0 && x < 50 && y >= 0 && y < 50) {
                        if (terrain.get(x, y) !== TERRAIN_MASK_WALL) {
                            const existing_cost = costMatrix.get(x, y)
                            costMatrix.set(x, y, Math.min(255, existing_cost + highCost))
                        }
                    }
                }
            }
        }

        const sources = room.find(FIND_SOURCES)
        const construction_sites = room.find(FIND_CONSTRUCTION_SITES)
        const spawns = room.find(FIND_MY_SPAWNS)
        const structures = room.find(FIND_STRUCTURES)

        // Mark positions around spawns
        spawns.forEach(spawn => {
            for (let x = spawn.pos.x - 1; x <= spawn.pos.x + 1; x++) {
                for (let y = spawn.pos.y - 1; y <= spawn.pos.y + 1; y++) {
                    if (x >= 0 && x < 50 && y >= 0 && y < 50) {
                        if (terrain.get(x, y) !== TERRAIN_MASK_WALL) {
                            const existing_cost = costMatrix.get(x, y)
                            costMatrix.set(x, y, Math.min(255, existing_cost + highCost))
                        }
                    }
                }
            }
        })

        // Mark positions around sources
        sources.forEach(source => {
            for (let x = source.pos.x - 1; x <= source.pos.x + 1; x++) {
                for (let y = source.pos.y - 1; y <= source.pos.y + 1; y++) {
                    if (x >= 0 && x < 50 && y >= 0 && y < 50) {
                        if (terrain.get(x, y) !== TERRAIN_MASK_WALL) {
                            const existing_cost = costMatrix.get(x, y)
                            costMatrix.set(x, y, Math.min(255, existing_cost + highCost))
                        }
                    }
                }
            }
        })

        structures.forEach(struct => {
            if (struct.structureType === STRUCTURE_ROAD || struct.structureType === STRUCTURE_CONTAINER || struct.structureType === STRUCTURE_RAMPART) {
                // Favor roads
                costMatrix.set(struct.pos.x, struct.pos.y, 1)
            } else {
                // Impassable structures
                costMatrix.set(struct.pos.x, struct.pos.y, 255)
            }
        })

        construction_sites.forEach(struct => {
            if (struct.structureType === STRUCTURE_ROAD || struct.structureType === STRUCTURE_CONTAINER || struct.structureType === STRUCTURE_RAMPART) {
                // Favor roads
                costMatrix.set(struct.pos.x, struct.pos.y, 1)
            } else {
                // Impassable structures
                costMatrix.set(struct.pos.x, struct.pos.y, 255)
            }
        })

        if (!ignoreCreeps) {
            // find creeps that have been at the same position for awhile
            room.find(FIND_MY_CREEPS, {
                filter: (creep) => creep.memory.target_time && creep.memory.target_time >= 15 && [ROLE.harvester, ROLE.upgrader, ROLE.builder].includes(creep.memory.role as any)
            }).forEach(creep => {
                const existing_cost = costMatrix.get(creep.pos.x, creep.pos.y)
                costMatrix.set(creep.pos.x, creep.pos.y, Math.min(255, existing_cost + 100))
            })
        }

        // Mark positions around sources
        [...sources, controller].forEach(s => {
            if (!s || !s.pos) return

            for (const spawn of spawns) {
                // find a path to the source
                const path_to_source = spawn.pos.findPathTo(s.pos, {
                    range: 2,
                    ignoreCreeps,
                    maxOps: 5000,
                    costCallback: () => costMatrix,
                })
                for (const { x, y } of path_to_source) {
                    costMatrix.set(x, y, roadCost * 2)
                }
            }
        })

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
