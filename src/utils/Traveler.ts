// Enhanced Traveler module with role-based priority, creep swapping, path caching, and CostMatrix support

import { cache } from './cache'
import { JOB } from './creeps/CreepBaseClass'
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
    lastPos: RoomPosition
    path: string
}

interface TravelerOptions {
    avoidRooms?: string[]
    preferHighways?: boolean
    range?: number
    priority?: number
    useCache?: boolean
}

export default class Traveler {
    static move(creep: Creep, target: RoomPosition, options: TravelerOptions = {}): ScreepsReturnCode {
        const { priority = rolePriorities[creep.memory.role as CreepRole] || 99, useCache = true } = options

        if (!creep.memory._travel) {
            creep.memory._travel = { stuck: 0, lastPos: creep.pos, path: '' } // Initialize travel memory
        }

        // Check for cached path
        if (useCache && creep.memory._travel.path && creep.memory._travel.path.length > 0) {
            const moveResult = creep.move(Number(creep.memory._travel.path[0]) as DirectionConstant)
            if (moveResult === OK) {
                creep.memory._travel.path = creep.memory._travel.path.slice(1) // Remove the used step
                return moveResult
            } else {
                // Invalidate cached path on error
                creep.memory._travel.path = ''
            }
        }

        // Generate new path using custom CostMatrix
        const path = creep.room.findPath(creep.pos, target, {
            ignoreCreeps: false,
            costCallback: (roomName, costMatrix) => this.buildCostMatrix(creep, roomName, costMatrix, options),
        })

        if (path.length > 0) {
            creep.memory._travel.path = path.map(step => step.direction).join('')
            return creep.move(path[0].direction)
        }

        // Handle swapping if stuck
        if (this.isCreepStuck(creep)) {
            this.resolveTraffic(creep, priority)
        }

        return ERR_NO_PATH
    }

    static isCreepStuck(creep: Creep): boolean {
        if (!creep.memory._travel) {
            creep.memory._travel = { stuck: 0, lastPos: creep.pos, path: '' } // Ensure travel memory exists
        }

        const lastPos = creep.memory._travel.lastPos as RoomPosition
        if (creep.pos.isEqualTo(lastPos)) {
            creep.memory._travel.stuck += 1
            creep.say(`Stuck! ${creep.memory._travel.stuck}}`)
        } else {
            creep.memory._travel.stuck = 0
        }
        creep.memory._travel.lastPos = creep.pos
        return creep.memory._travel.stuck > 2 // Stuck if in the same position for 3 consecutive ticks
    }

    static resolveTraffic(creep: Creep, priority: number): void {
        const adjacentCreeps = creep.pos.findInRange(FIND_MY_CREEPS, 1)
            .filter(c =>
                c.id !== creep.id &&
                (
                    // not assigned to assisting
                    c.memory.job !== JOB.assist ||

                    // and not being pulled
                    Object.values(Game.creeps).some(creep => creep.memory.job === JOB.assist && creep.memory.target === c.memory.target)
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
                    return
                }
            }
        }
    }

    @cache("buildCostMatrix", 1)
    static buildCostMatrix(creep: Creep, roomName: string, costMatrix: CostMatrix, options: TravelerOptions): CostMatrix {
        const room = Game.rooms[roomName]
        if (!room) return costMatrix

        room.find(FIND_STRUCTURES).forEach(struct => {
            if (struct.structureType === STRUCTURE_ROAD) {
                // Favor roads
                costMatrix.set(struct.pos.x, struct.pos.y, 1)
            } else if (
                struct.structureType !== STRUCTURE_CONTAINER &&
                (struct.structureType !== STRUCTURE_RAMPART || !struct.my)
            ) {
                // Impassable structures
                costMatrix.set(struct.pos.x, struct.pos.y, 255)
            }
        })

        const creepPriority = rolePriorities[creep.memory.role as CreepRole] || 99

        room.find(FIND_MY_CREEPS).forEach(c => {
            if (c.id === creep.id) return

            const otherPriority = rolePriorities[c.memory.role as CreepRole] || 99

            // Add costs for creeps with lower priority
            if (creepPriority > otherPriority && c.memory.job !== JOB.idle && utils.isNearTo(creep.pos, c.pos)) {
                costMatrix.set(c.pos.x, c.pos.y, 50)
                return
            }

            const otherTimeAtTarget = c.memory.target_time || 0

            // Add costs for creeps that have been at target for a long time
            if (otherTimeAtTarget > 100 && c.memory.job !== JOB.idle) {
                costMatrix.set(c.pos.x, c.pos.y, 50)
                return
            }

            // Add costs for creeps to avoid traffic
            costMatrix.set(c.pos.x, c.pos.y, 10)
        })

        return costMatrix
    }
}
