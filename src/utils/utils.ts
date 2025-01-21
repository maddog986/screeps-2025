import { cache } from './cache'
import { JOB, ROLE } from './creeps/CreepBaseClass'
import Traveler from './Traveler'

export default class utils {
    // cache key
    cache() {
        return "utils"
    }

    @cache("partsCost", 1000)
    static partsCost(parts: BodyPartConstant[]): number {
        return parts.reduce((num, part) => num + BODYPART_COST[part], 0)
    }

    @cache("createBody", 1000)
    static createBody(parts: BodyPartConstant[], energyAvailable: number): BodyPartConstant[] {
        let parts_cost = this.partsCost(parts)

        // use as much as energyAvailable as possible by doubling the body parts until we reach the energyAvailable
        while (parts_cost <= energyAvailable) {
            if (parts_cost + this.partsCost(parts) > energyAvailable) {
                return parts
            }

            parts = parts.concat(parts)
            parts_cost += parts_cost
        }

        // if we have more than energyAvailable, remove the last part
        if (parts_cost > energyAvailable) {
            parts.pop()
        }

        return parts
    }

    @cache("walkablePositions", 1000)
    static walkablePositions(target: RoomPosition, dist = 1): number {
        if (!target || !target.roomName || !Game.rooms[target.roomName]) return 0

        return Game.rooms[target.roomName]
            .lookAtArea(target.y - dist, target.x - dist, target.y + dist, target.x + dist, true)
            .filter(a =>
                ["plain", "swamp"].includes(a.terrain || "wall") &&
                (target.y + dist === a.y ||
                    target.y - dist === a.y ||
                    target.x + dist === a.x ||
                    target.x - dist === a.x)
            )
            .length
    }

    @cache("findClosestByPath")
    static findClosestByPath<T extends _HasId & _HasRoomPosition>(creep: Creep, targets: T[]): T | null {
        return creep.pos.findClosestByPath(targets)
    }

    // Overload signatures
    static getRangeTo(pos1: RoomPosition, pos2: RoomPosition): number
    static getRangeTo(x1: number, y1: number, x2: number, y2: number): number

    // Method implementation with the decorator
    @cache("getRangeTo", 100)
    static getRangeTo(
        arg1: RoomPosition | number,
        arg2: RoomPosition | number,
        arg3?: number,
        arg4?: number
    ): number {
        if (arg1 instanceof RoomPosition && arg2 instanceof RoomPosition) {
            // Overload for RoomPosition arguments
            return Math.max(
                Math.abs(arg1.x - arg2.x),
                Math.abs(arg1.y - arg2.y)
            )
        } else if (
            typeof arg1 === "number" &&
            typeof arg2 === "number" &&
            typeof arg3 === "number" &&
            typeof arg4 === "number"
        ) {
            // Overload for x1, y1, x2, y2 arguments
            return Math.max(
                Math.abs(arg1 - arg3),
                Math.abs(arg2 - arg4)
            )
        } else {
            throw new Error("Invalid arguments passed to getRangeTo")
        }
    }

    @cache("isNearTo", 100)
    static isNearTo(pos1: RoomPosition, pos2: RoomPosition): boolean {
        return this.getRangeTo(pos1, pos2) <= 1
    }

    @cache("inRangeTo", 100)
    static inRangeTo(pos1: RoomPosition, pos2: RoomPosition, range: number): boolean {
        return this.getRangeTo(pos1, pos2) <= range
    }

    @cache("findOptimalPosition", 100)
    static findOptimalPosition(room: Room, position: RoomPosition, range: number = 1): RoomPosition | undefined {
        const terrain = new Room.Terrain(room.name)

        // Get all positions within 1 range of the source
        const adjacentPositions: RoomPosition[] = []
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                // skip out of bounds
                if (position.x + dx < 0 || position.x + dx > 49 || position.y + dy < 0 || position.y + dy > 49) continue
                // Skip the source position itself
                if (dx === 0 && dy === 0) continue

                const x = position.x + dx
                const y = position.y + dy

                // Check if the position is walkable (not a wall)
                if (terrain.get(x, y) !== TERRAIN_MASK_WALL) {
                    adjacentPositions.push(new RoomPosition(x, y, room.name))
                }
            }
        }

        const spawn = room.find(FIND_MY_SPAWNS).shift()

        // Check positions for the best container placement
        const optimalPosition = adjacentPositions.filter((pos) =>
            adjacentPositions.every(
                (adjPos) => adjPos.getRangeTo(pos) <= range // Ensure the position is within 1 range of all adjacent tiles
            )
        )
            // sort by more walkable positions
            .sort((a, b) => this.walkablePositions(a) - this.walkablePositions(b))
            // grab last one
            .pop()

        return optimalPosition // Return the optimal position or null if none found
    };

    @cache("findPath")
    static findPath(start: RoomPosition, end: RoomPosition): RoomPosition[] {
        return PathFinder.search(start, { pos: end, range: 1 }, {
            roomCallback: (roomName) => Traveler.buildRoomCostMatrix(roomName, new PathFinder.CostMatrix)
        }).path
    }

    @cache("creeps")
    static creeps({ id, id_not, role, job, room, target, freeCapacity, usedCapacity, ticksToLive, notAssigned, assignedId, notOverAssigned }: {
        id?: string | undefined
        id_not?: string | undefined
        role?: ROLE | ROLE[] | undefined
        job?: JOB | JOB[] | undefined
        room?: string | undefined
        target?: string | undefined
        freeCapacity?: number | undefined
        usedCapacity?: number | undefined
        ticksToLive?: number | undefined
        notAssigned?: boolean | undefined
        assignedId?: string | undefined
        notOverAssigned?: boolean | undefined
    } = {}): Creep[] {
        // all my creeps
        const creeps = Object.values(Game.creeps).filter(creep =>
            // its mine
            creep.my
            // is not spawning
            && !creep.spawning
        )

        return creeps.filter(creep =>
            // matches the id we want
            (id === undefined || creep.id === id)

            // matches the id we dont want
            && (id_not === undefined || creep.id !== id_not)

            // matches the role we want
            && (role === undefined || (Array.isArray(role) ? role.includes(creep.memory.role) : role === creep.memory.role))

            // matches the room we want
            && (room === undefined || creep.room.name === room)

            // matches target we want
            && (target === undefined || creep.memory.target === target)

            // has free capacity
            && (freeCapacity === undefined || creep.store.getFreeCapacity() > freeCapacity)

            // has stored capacity
            && (usedCapacity === undefined || creep.store.getUsedCapacity() > usedCapacity)

            // ticks to live
            && (ticksToLive === undefined || (!creep.ticksToLive || creep.ticksToLive > ticksToLive))

            // not already assigned
            && (notAssigned === undefined || creeps.filter(({ memory: { role, job, target } }) => target === creep.id).length === 0)

            // not over assigned
            && (notOverAssigned === undefined || creeps.filter(({ memory: { role, job, target } }) => target === creep.id).length < 2)
        )
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


    // const neighbors = utils.getNeighbors(x, y, 1)
    // neighbors.forEach(([dx, dy]) => {
    //     if (roads.some(({ x: nx, y: ny }) => nx === dx && ny === dy)) {
    //         room.visual.line(dx, dy, x, y, { color: "#666", opacity: 0.25, width: 0.45 })
    //     }
    // })

    // • • •
    // • x •
    // • • •

    static getNeighbors(x: number, y: number, distance: number = 1): [number, number][] {
        const neighbors: [number, number][] = []
        for (let dx = -distance; dx <= distance; dx++) {
            for (let dy = -distance; dy <= distance; dy++) {
                if (dx === 0 && dy === 0) continue // Skip the center point
                neighbors.push([x + dx, y + dy])
            }
        }
        return neighbors
    }

    //   •
    // • x •
    //   •
    static getOrthogonalNeighbors(x: number, y: number, distance: number = 1): [number, number][] {
        const neighbors: [number, number][] = []
        for (let i = 1; i <= distance; i++) {
            neighbors.push([x + i, y], [x - i, y], [x, y + i], [x, y - i])
        }
        return neighbors
    }

    static getGridNeighbors(x: number, y: number, distance: number = 1): [number, number][] {
        const neighbors: [number, number][] = []
        for (let dx = -distance; dx <= distance; dx++) {
            for (let dy = -distance; dy <= distance; dy++) {
                neighbors.push([x + dx, y + dy])
            }
        }
        return neighbors
    }
}
