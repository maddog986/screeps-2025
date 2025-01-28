// Enhanced Traveler module

import { CONFIG } from 'config'
import BaseClass from 'utils/base_class'
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

export default class CreepMovement extends BaseClass {
    creep: Creep

    constructor(creep: Creep) {
        super(creep.room, creep.name)

        this.creep = creep
    }

    private circle(stroke: string, opacity: number = 0.5) {
        if (!CONFIG.visuals || !CONFIG.visuals.creep_travel) return
        this.creep.room.visual.circle(this.creep.pos, { fill: 'transparent', radius: 0.50, stroke, opacity })
    }

    move(target: RoomPosition, options: TravelerOptions = {}): ScreepsReturnCode {
        this.creep.manager.log(`**traveler:** attempting to move...`)

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
        this.creep.memory.travel ??= {
            stuck: 0,
            target: utils.positionToObject(target),
            lastPos: new RoomPosition(0, 0, this.creep.room.name),
            destination: utils.positionToObject(target),
            distance: 0,
            range,
            path: ''
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
        if (this.creep.memory.travel.path.length) {
            // check for a creep with no travel data that is parked at the destination
            if (Object.values(Game.creeps).some(c => c.my && !c.memory.travel && c.pos.isEqualTo(utils.objectToPosition(this.creep.memory.travel!.destination)))) {
                this.creep.memory.travel.path = ''
                this.creep.manager.log(`**traveler:** reset path due to parked creep`)
            }
        }

        // build a path if none exists
        if (!this.creep.memory.travel.path.length) {
            // blue circle around creep
            this.circle('blue')

            // find path
            const pathFinder = PathFinder.search(this.creep.pos, { pos: target, range }, {
                maxRooms: 1,
                maxOps: 2000,
                roomCallback: (roomName) => this.creep.room.manager.getMatrix(this.creep, options),
            })

            // path not found
            if (pathFinder.incomplete) {
                this.creep.memory.travel.stuck += 1
                this.creep.manager.log(`**traveler:** failed to find path to target: ${target}`)
                return ERR_NO_PATH
            }

            pathFinder.path.unshift(this.creep.pos) // add creep pos to path

            // convert path to directions
            const path = utils.pathToDirections(pathFinder.path).join('')
            this.creep.manager.log(`**traveler:** new path: ${path} to target: ${target}`)

            // set new path
            this.creep.memory.travel.path = path

            // set new destination
            this.creep.memory.travel.destination = utils.positionToObject(pathFinder.path[pathFinder.path.length - 1])
        }

        // draw creep travel path
        if (CONFIG.visuals && CONFIG.visuals.creep_travel) {
            const pathToRoomPositions = utils.directionsToPath(this.creep.pos, this.creep.memory.travel.path.split('').map(dir => Number(dir) as DirectionConstant))
            this.creep.room.visual.poly(pathToRoomPositions, { stroke: '#fff', lineStyle: 'dashed', opacity: 0.2 })
        }

        // get next direction
        const nextDirection = Number(this.creep.memory.travel.path.substring(0, 1)) as DirectionConstant

        // move to target
        const result = this.creep.move(nextDirection)
        this.creep.manager.log(`**traveler:** move result: ${result} to target: ${target}`)
        return result
    }
}
