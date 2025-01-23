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

        // TODO: verify room is valid
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

    static findOptimalPosition(room: Room, position: RoomPosition, range: number = 1): RoomPosition | undefined {
        const adjacentPositions: RoomPosition[] = []

        // Get all adjacent positions within range
        this.getNeighbors(position.x, position.y, range).forEach(([x, y]) => {
            if (
                room.lookAt(x, y).some(
                    ({ type, terrain }) =>
                        type === "structure" ||
                        type === "constructionSite" ||
                        (type === "terrain" && terrain === "wall")
                )
            )
                return

            adjacentPositions.push(new RoomPosition(x, y, room.name))
        })

        // Evaluate each position for visibility to all walkable tiles around the source
        const optimalPosition = adjacentPositions
            .map((pos) => ({
                pos,
                visibleTiles: this.getNeighbors(pos.x, pos.y, 1).filter(
                    ([nx, ny]) =>
                        this.isWalkable(room, nx, ny) &&
                        this.isNearTo(position, new RoomPosition(nx, ny, pos.roomName))
                ).length,
            }))
            // Sort by number of visible tiles and fall back to distance from source if needed
            .sort((a, b) => b.visibleTiles - a.visibleTiles || this.getRangeTo(position, a.pos) - this.getRangeTo(position, b.pos))
            .shift() // Take the position with the most visible tiles

        return optimalPosition?.pos // Return the optimal position or undefined if none found
    }

    // Helper function: Check if a position is walkable
    static isWalkable(room: Room, x: number, y: number): boolean {
        return !room
            .lookAt(x, y)
            .some(({ type, terrain, constructionSite }) => type === "structure" || (type === "constructionSite" && constructionSite!.structureType !== 'road') || (type === "terrain" && terrain === "wall"))
    }

    // @cache("findOptimalPosition", 100)
    // static findOptimalPosition(room: Room, position: RoomPosition, range: number = 1): RoomPosition | undefined {
    //     // Get all positions within 1 range of the source
    //     const adjacentPositions: RoomPosition[] = []

    //     this.getNeighbors(position.x, position.y, 1)
    //         .forEach(([x, y]) => {
    //             if (room.lookAt(x, y).some(({ type, terrain }) => type === "structure" || type === "constructionSite" || (type === "terrain" && terrain === "wall"))) return

    //             // Check if the position is walkable (not a wall)
    //             adjacentPositions.push(new RoomPosition(x, y, room.name))
    //         })

    //     const spawn = room.find(FIND_MY_SPAWNS).shift()

    //     // Check positions for the best container placement
    //     const optimalPosition = adjacentPositions
    //         // sort by more walkable positions
    //         .sort((a, b) => this.walkablePositions(a) - this.walkablePositions(b))

    //         // grab last one
    //         .pop()

    //     return optimalPosition // Return the optimal position or null if none found
    // };

    @cache("findPath")
    static findPath(start: RoomPosition, end: RoomPosition): RoomPosition[] {
        return PathFinder.search(start, { pos: end, range: 1 }, {
            roomCallback: (roomName) => Traveler.buildRoomCostMatrix(roomName, new PathFinder.CostMatrix)
        }).path
    }

    @cache("creeps")
    static creeps(filters: {
        id?: string | undefined
        id_not?: string | undefined
        role?: ROLE | ROLE[] | undefined
        job?: JOB | JOB[] | undefined
        job_not?: JOB | JOB[] | undefined
        room?: string | undefined
        target?: string | undefined
        hasTarget?: boolean | undefined
        freeCapacity?: number | undefined
        usedCapacity?: number | undefined
        ticksToLive?: number | undefined
        notAssigned?: boolean | undefined
        assignedId?: string | undefined
        notOverAssigned?: boolean | undefined
        inRange?: [RoomPosition, number] | undefined
        hasParts?: BodyPartConstant[] | undefined
        hasParts_not?: BodyPartConstant[] | undefined
        sortByDistance?: RoomPosition | undefined
        sortByUsedCapacity?: boolean | undefined
        atTarget?: boolean | undefined
    } = {}): Creep[] {
        // get all creeps
        const allCreeps = Object.values(Game.creeps).filter(creep => creep.my && !creep.spawning)

        const predicates: ((creep: Creep) => boolean)[] = []

        // if a creep has a specific id
        if (filters.id) {
            predicates.push(creep => creep.id === filters.id)
        }

        // if a creep does not have a specific id
        if (filters.id_not) {
            predicates.push(creep => creep.id !== filters.id_not)
        }

        // if a creep has a specific role
        if (filters.role) {
            predicates.push(creep =>
                Array.isArray(filters.role) ? filters.role.includes(creep.memory.role) : creep.memory.role === filters.role
            )
        }

        // if a creep does not have a specific role
        if (filters.job) {
            predicates.push(creep =>
                Array.isArray(filters.job) ? filters.job.includes(creep.memory.job as any) : creep.memory.job === filters.job
            )
        }

        // if a creep does not have a specific role
        if (filters.job_not) {
            predicates.push(creep =>
                Array.isArray(filters.job_not) ? !filters.job_not.includes(creep.memory.job as any) : creep.memory.job !== filters.job_not
            )
        }

        // if a creep is in a specific room
        if (filters.room) {
            predicates.push(creep => creep.room.name === filters.room)
        }

        // if a creep is assigned to a target
        if (filters.target) {
            predicates.push(creep => creep.memory.target === filters.target)
        }

        // if a creep has a target
        if (filters.hasTarget) {
            predicates.push(creep => creep.memory.target !== undefined)
        }

        // if a creep is not assigned to a target
        if (filters.freeCapacity !== undefined) {
            predicates.push(creep => creep.store.getFreeCapacity() > Number(filters.freeCapacity))
        }

        // if a creep is not assigned to a target
        if (filters.usedCapacity !== undefined) {
            predicates.push(creep => creep.store.getUsedCapacity() > Number(filters.usedCapacity))
        }

        // if a creep is not assigned to a target
        if (filters.ticksToLive !== undefined) {
            predicates.push(creep => !creep.ticksToLive || creep.ticksToLive > Number(filters.ticksToLive))
        }

        // if creep has specific parts
        if (filters.hasParts) {
            predicates.push(creep => (filters.hasParts as BodyPartConstant[]).every(part => creep.body.some(({ type }) => type === part)))
        }

        // if creep does not have specific parts
        if (filters.hasParts_not) {
            predicates.push(creep => !(filters.hasParts_not as BodyPartConstant[]).every(part => creep.body.some(({ type }) => type === part)))
        }

        // if a creep is not assigned to a target
        if (filters.notAssigned) {
            predicates.push(creep => allCreeps.every(({ memory: { target } }) => target !== creep.id))
        }

        // if a creep is assigned to a target, don't assign another
        if (filters.notOverAssigned) {
            predicates.push(
                creep =>
                    allCreeps.filter(({ memory: { role, job, target } }) => target === creep.id).length < 2
            )
        }

        // range checks
        if (filters.inRange && Array.isArray(filters.inRange)) {
            predicates.push(creep => utils.inRangeTo(creep.pos, filters.inRange![0] as RoomPosition, Number(filters.inRange![1])))
        }

        // if a creep is at a target
        if (filters.atTarget !== undefined) {
            // get target object
            predicates.push(creep => {
                if (!creep.memory.target) return false

                const target = Game.getObjectById<_HasId & _HasRoomPosition>(creep.memory.target)
                if (!target) return false

                const range = target instanceof StructureController ? 3 : 1

                return filters.atTarget === true ? utils.getRangeTo(creep.pos, target.pos) <= range : utils.getRangeTo(creep.pos, target.pos) > range
            })
        }

        // return the creeps that match all predicates
        const results = allCreeps.filter(creep => predicates.every(predicate => predicate(creep)))

        // sort by distance
        if (filters.sortByDistance) {
            results.sort((a, b) => utils.getRangeTo(a.pos, filters.sortByDistance as RoomPosition) - utils.getRangeTo(b.pos, filters.sortByDistance as RoomPosition))
        }

        // sort by used capacity
        if (filters.sortByUsedCapacity) {
            results.sort((a, b) => a.store.getUsedCapacity() - b.store.getUsedCapacity())
        }

        return results
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
                // filter out of bounds
                if (x + dx < 0 || x + dx > 49 || y + dy < 0 || y + dy > 49) continue
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

}


// Helper to create an enum-like object with transformed keys
export function createEnum<T extends object, Prefix extends string>(
    obj: T,
    prefix: Prefix
): { [K in keyof T as K extends `${Prefix}${infer R}` ? R : never]: K extends `${Prefix}${infer R}` ? R : never } {
    // @ts-ignore
    return Object.getOwnPropertyNames(obj).reduce((res, key) => {
        if (key.startsWith(prefix)) {
            // @ts-ignore
            const transformedKey = key.replace(prefix, "") as K extends `${Prefix}${infer R}` ? R : never
            res[transformedKey] = transformedKey
        }
        return res
    }, {} as { [K in keyof T as K extends `${Prefix}${infer R}` ? R : never]: K extends `${Prefix}${infer R}` ? R : never })
}
