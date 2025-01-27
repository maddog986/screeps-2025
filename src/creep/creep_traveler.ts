// Enhanced Traveler module

import { CONFIG } from 'config'
import Debuggable from 'utils/debugger'
import utils from 'utils/utils'

declare global { // using global declaration to extend the existing types
    interface CreepMemory {
        travel?: TravelerMemory
        travel_last?: number
    }

    interface Creep {
        travel(target: RoomPosition, options?: TravelerOptions): ScreepsReturnCode
    }

    interface TravelerMemory {
        stuck: number
        target: { x: number, y: number, roomName: string }
        lastPos: { x: number, y: number, roomName: string }
        destination: { x: number, y: number, roomName: string }
        distance: number
        range: number
        path: string
    }

    interface TravelerOptions {
        stuckThreshold?: number
        range?: number
        ignoreCreeps?: boolean
        highCost?: number       // Cost for high-priority areas
        edgeCost?: number       // Cost for tiles near edges
        wallCost?: number       // Cost for tiles near walls
        plainCost?: number      // Cost for plain tiles
        swampCost?: number      // Cost for swamp tiles
        roadCost?: number       // Cost for road tiles
    }
}

// extending creep prototype to make moving easier
Creep.prototype.travel = function (target: RoomPosition, options: TravelerOptions = {}): ScreepsReturnCode {
    return Traveler.move(this, target, options)
}

export const TRAVELER_DEFAULT: TravelerOptions = {
    range: 1,               // Default range
    ignoreCreeps: false,    // Default ignore creeps
    stuckThreshold: 2,      // Default stuck threshold
    highCost: 8,            // Default high cost
    edgeCost: 200,          // Default edge cost
    wallCost: 15,           // Default wall cost
    roadCost: 1,            // Default road cost
    plainCost: 3,           // Default plain cost
    swampCost: 9,           // Default swamp cost
}

export default class Traveler extends Debuggable {
    static circle(creep: Creep, stroke: string, opacity: number = 0.5) {
        if (!CONFIG.visuals || !CONFIG.visuals.creep_travel) return
        creep.room.visual.circle(creep.pos, { fill: 'transparent', radius: 0.50, stroke, opacity })
    }

    static move(creep: Creep, target: RoomPosition, options: TravelerOptions = {}): ScreepsReturnCode {
        creep.manager.log(`**traveler:** attempting to move...`)

        // make sure creep isnt tired
        if (creep.fatigue > 0) {
            creep.manager.log(`**traveler:** creep is tired`)
            return ERR_TIRED
        }

        // default options
        const { range = 1, ignoreCreeps = false, stuckThreshold = 4, ...defaultOptions } = options

        // if creep is super stuck, reset travel data and tasks
        if (creep.memory.travel && creep.memory.travel.stuck > (stuckThreshold * 2)) {
            creep.manager.log(`**traveler:** creep is super stuck, resetting travel data and tasks`)
            delete creep.memory.travel
            delete creep.memory.tasks
        }

        // make sure travel memory is set
        creep.memory.travel ??= {
            stuck: 0,
            target: utils.positionToObject(target),
            lastPos: new RoomPosition(0, 0, creep.room.name),
            destination: utils.positionToObject(target),
            distance: 0,
            range,
            path: ''
        }

        creep.manager.log('**traveler:** creep.memory.travel:', creep.memory.travel)

        // creep hasnt moved since last tick, must be stuck
        if (creep.pos.isEqualTo(utils.objectToPosition(creep.memory.travel.lastPos))) {
            // increase stuck
            creep.memory.travel.stuck += 1

            // reset path if stuck
            if (creep.memory.travel.stuck > stuckThreshold) {
                creep.memory.travel.path = ''
                this.circle(creep, 'red', (creep.memory.travel.stuck / 6))
            }

            creep.manager.log(`**traveler:** stuck increased: ${creep.memory.travel.stuck}`)
        }
        // creep has moved, must not be stuck
        else {
            // no longer stuck
            creep.memory.travel.stuck = 0

            // remove first pathing step
            creep.memory.travel.path = creep.memory.travel.path.substring(1)

            // update lastPos
            creep.memory.travel.lastPos = utils.positionToObject(creep.pos)

            // update distance
            creep.memory.travel.distance = creep.pos.getRangeTo(utils.objectToPosition(creep.memory.travel.destination))
        }

        // check last position of path to make sure its not blocked
        if (creep.memory.travel.path.length) {
            // check for a creep with no travel data that is parked at the destination
            if (Object.values(Game.creeps).some(c => c.my && !c.memory.travel && c.pos.isEqualTo(utils.objectToPosition(creep.memory.travel!.destination)))) {
                creep.memory.travel.path = ''
                creep.manager.log(`**traveler:** reset path due to parked creep`)
            }
        }

        // build a path if none exists
        if (!creep.memory.travel.path.length) {
            // blue circle around creep
            this.circle(creep, 'blue')

            // find path
            const pathFinder = PathFinder.search(creep.pos, { pos: target, range }, {
                maxRooms: 1,
                maxOps: 2000,
                roomCallback: (roomName) => creep.room.manager.getMatrix(creep, options),
            })

            // path not found
            if (pathFinder.incomplete) {
                creep.memory.travel.stuck += 1
                creep.manager.log(`**traveler:** failed to find path to target: ${target}`)
                return ERR_NO_PATH
            }

            pathFinder.path.unshift(creep.pos) // add creep pos to path

            // convert path to directions
            const path = utils.pathToDirections(pathFinder.path).join('')
            creep.manager.log(`**traveler:** new path: ${path} to target: ${target}`)

            // set new path
            creep.memory.travel.path = path

            // set new destination
            creep.memory.travel.destination = utils.positionToObject(pathFinder.path[pathFinder.path.length - 1])
        }

        // draw creep travel path
        if (CONFIG.visuals && CONFIG.visuals.creep_travel) {
            const pathToRoomPositions = utils.directionsToPath(creep.pos, creep.memory.travel.path.split('').map(dir => Number(dir) as DirectionConstant))
            creep.room.visual.poly(pathToRoomPositions, { stroke: '#fff', lineStyle: 'dashed', opacity: 0.2 })
        }

        // get next direction
        const nextDirection = Number(creep.memory.travel.path.substring(0, 1)) as DirectionConstant

        // move to target
        const result = creep.move(nextDirection)
        creep.manager.log(`**traveler:** move result: ${result} to target: ${target}`)
        return result
    }
}
